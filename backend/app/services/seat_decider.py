from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Tuple, Optional

from ..core.config import settings
from ..core.openai_client import get_openai_client


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _safe_json_load(s: str) -> Any:
    """Parse JSON even if the model wrapped it in extra text."""
    s = (s or "").strip()
    try:
        return json.loads(s)
    except Exception:
        pass
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return {}
    return {}


_PAGE_TAG_RE = re.compile(r"\[PAGE\s+(\d+)\]", re.IGNORECASE)


def _nearest_page(text: str, pos: int) -> Optional[int]:
    """Best-effort: find nearest preceding [PAGE N] tag."""
    if pos <= 0:
        return None
    # search backwards in a window
    window_start = max(0, pos - 4000)
    segment = text[window_start:pos]
    matches = list(_PAGE_TAG_RE.finditer(segment))
    if not matches:
        return None
    try:
        return int(matches[-1].group(1))
    except Exception:
        return None


def _extract_fragments(
    doc_text: str,
    patterns: List[re.Pattern],
    *,
    max_fragments: int = 20,
    radius: int = 350,
) -> List[Dict[str, Any]]:
    """Return fragments with page numbers for relevant occurrences."""
    frags: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for pat in patterns:
        for m in pat.finditer(doc_text):
            start = max(0, m.start() - radius)
            end = min(len(doc_text), m.end() + radius)
            frag = _clean(doc_text[start:end])
            if not frag:
                continue
            if frag in seen:
                continue
            seen.add(frag)
            page = _nearest_page(doc_text, m.start())
            frags.append({"page": page, "text": frag})
            if len(frags) >= max_fragments:
                return frags
    return frags


def _build_context(
    docs_text: List[Tuple[str, str]],
    *,
    clause_excerpt: Optional[str] = None,
    extra_terms: Optional[List[str]] = None,
    max_chars_total: int = 35000,
) -> List[Dict[str, Any]]:
    """Create a compact, retrieval-like context from the provided documents."""
    patterns = [
        re.compile(r"\bseat\b", re.IGNORECASE),
        re.compile(r"place\s+of\s+arbitration", re.IGNORECASE),
        re.compile(r"change\s+(?:the\s+)?(?:seat|place)\b", re.IGNORECASE),
        re.compile(r"transfer\s+(?:the\s+)?(?:seat|place)\b", re.IGNORECASE),
        re.compile(r"\bgoverning\s+law\b|\bgoverned\s+by\b", re.IGNORECASE),
        re.compile(r"\bLCIA\b|\bICC\b|\bUNCITRAL\b|\bSIAC\b|\bHKIAC\b|\bICDR\b", re.IGNORECASE),
        re.compile(r"interim\s+measures|urgent|emergency", re.IGNORECASE),
        re.compile(r"enforcement|annul|set\s+aside", re.IGNORECASE),
        re.compile(r"court\s+support|court\s+interference|supervisory\s+court", re.IGNORECASE),
    ]

    # Also pull fragments around explicit seat names / key terms from intake
    if extra_terms:
        for t in extra_terms:
            t = _clean(str(t))
            if not t or len(t) > 80:
                continue
            try:
                patterns.append(re.compile(re.escape(t), re.IGNORECASE))
            except Exception:
                pass

    out: List[Dict[str, Any]] = []
    used = 0

    if clause_excerpt:
        clause_excerpt = _clean(clause_excerpt)
        if clause_excerpt:
            snippet = clause_excerpt[:2500]
            out.append({"source": "arbitration_agreement_excerpt", "fragments": [{"page": None, "text": snippet}]})
            used += len(snippet)

    for name, txt in docs_text:
        if not txt or not txt.strip():
            continue
        frags = _extract_fragments(txt, patterns)
        if not frags:
            # fallback: include the beginning of the doc so the model has *something*
            head = _clean(txt)[:2000]
            if head:
                frags = [{"page": _nearest_page(txt, 0), "text": head}]
        # budget
        frag_text = "\n".join([f.get("text", "") for f in frags])
        if used + len(frag_text) > max_chars_total:
            break
        out.append({"source": name, "fragments": frags})
        used += len(frag_text)

    return out


def make_seat_change_decision(
    *,
    docs_text: List[Tuple[str, str]],
    intake: Dict[str, Any],
    extracted: Dict[str, Any],
) -> Dict[str, Any]:
    """Produce the key conclusion fields for the report.

    This intentionally constrains the model to use ONLY the provided document excerpts.
    If the documents do not contain enough information, the model must return
    "intervention_required" and list missing info.

    Returns keys that can be merged into the `extracted` dict passed to the report generator.
    """

    # --- DEMO / ASSUMPTION OVERRIDE -------------------------------------------------
    # For demo flows, the chat assistant can store explicit user assumptions in
    # intake['_assumption_overrides']. If the user forces a preferred seat under an
    # "assume ..." message, we must not re-raise "intervention_required" on report
    # regeneration.
    overrides = intake.get('_assumption_overrides') or {}
    if isinstance(overrides, dict):
        forced = overrides.get('preferred_seat') or overrides.get('force_preferred_seat')
        if forced and str(forced).strip():
            forced = _clean(str(forced))
            # Keep it transparent: we note that this is assumption-driven.
            # We intentionally do not require citations here because the user is
            # explicitly overriding grounding requirements for the demo.
            return {
                "should_change_seat": "yes",
                "preferred_seat": forced,
                "alternative_seat": None,
                "rationale": [
                    "Demo assumption override applied: user requested a specific preferred seat.",
                    "This recommendation is scenario-driven and may not be fully grounded in the uploaded excerpts.",
                ],
                "jurisdiction_notes": {
                    forced: {
                        "pros": ["Selected to match the user-provided demo scenario."],
                        "cons": ["Grounding evidence may be incomplete for this scenario."],
                    }
                },
                "alternative_circumstances": "If the assumed conditions do not hold, regenerate without the override for a grounded comparison.",
                "missing_info": [],
                "citations": [],
            }

    # If no OpenAI key, we cannot generate a decision.
    if not settings.openai_api_key:
        return {
            "should_change_seat": "intervention_required",
            "preferred_seat": None,
            "alternative_seat": None,
            "rationale": [
                "Decision not generated because OPENAI_API_KEY is not configured.",
            ],
            "alternative_circumstances": "To be determined.",
            "jurisdiction_notes": {},
            "missing_info": ["OPENAI_API_KEY missing"],
        }

    current_seat = intake.get("current_seat") or extracted.get("current_seat")
    proposed_seats = intake.get("proposed_seats") or extracted.get("proposed_seats") or []
    if isinstance(proposed_seats, str):
        proposed_seats = [proposed_seats]

    clause = intake.get("arbitration_agreement_text") or extracted.get("arbitration_agreement_text")

    extra_terms = []
    for t in ([current_seat] if current_seat else []):
        extra_terms.append(t)
    for t in (proposed_seats or []):
        extra_terms.append(t)
    inst = intake.get("institution_rules") or extracted.get("institution_rules")
    if inst:
        extra_terms.append(inst)

    context = _build_context(docs_text, clause_excerpt=clause, extra_terms=extra_terms)

    prompt = {
        "task": "Decide whether the arbitration seat should be changed, and if so, recommend the most suitable seat among the proposed options.",
        "critical_rules": [
            "You MUST ONLY use the provided sources (excerpts). Do NOT rely on outside knowledge.",
            "If the provided sources do not support a recommendation, return should_change_seat = 'intervention_required' and list what is missing.",
            "Every non-trivial reason MUST include a citation: {source, page, quote}. Quote <= 20 words.",
            "Prefer direct rule/contract language over inference.",
            "Be concrete: compare proposed seats with positives and negatives backed by the sources.",
        ],
        "case_snapshot": {
            "current_seat": current_seat,
            "proposed_seats": proposed_seats,
            "institution_rules": intake.get("institution_rules") or extracted.get("institution_rules"),
            "governing_law": intake.get("governing_law") or extracted.get("governing_law"),
            "urgency": intake.get("urgency") or extracted.get("urgency"),
            "parties": extracted.get("parties") or intake.get("parties"),
            "nature_of_dispute": extracted.get("nature_of_dispute") or intake.get("nature_of_dispute"),
            "parties_assets_where": intake.get("parties_assets_where") or extracted.get("parties_assets_where"),
        },
        "output_json_schema": {
            "should_change_seat": "'yes' | 'no' | 'intervention_required'",
            "preferred_seat": "string|null",
            "alternative_seat": "string|null",
            "rationale": "string[] (6-12 bullets, each should include 1+ citation markers like [source p.X])",
            "jurisdiction_notes": "object mapping seat-> {pros: string[], cons: string[]} (each item must include citation markers)",
            "alternative_circumstances": "string",
            "missing_info": "string[]",
            "citations": "[{source: string, page: number|null, quote: string, used_in: string}]",
        },
        "sources": context,
    }

    messages = [
        {
            "role": "system",
            "content": (
                "You are a cautious arbitration decision-support assistant. "
                "You MUST ground every key claim in the provided sources. "
                "Return ONLY valid JSON (no markdown, no extra text)."
            ),
        },
        {"role": "user", "content": json.dumps(prompt)},
    ]

    client = get_openai_client()

    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
    except Exception:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.2,
        )
        raw = resp.choices[0].message.content or "{}"

    data = _safe_json_load(raw)
    if not isinstance(data, dict):
        data = {}

    # Minimal normalization
    data.setdefault("should_change_seat", "intervention_required")
    data.setdefault("preferred_seat", None)
    data.setdefault("alternative_seat", None)
    data.setdefault("rationale", [])
    data.setdefault("jurisdiction_notes", {})
    data.setdefault("alternative_circumstances", "")
    data.setdefault("missing_info", [])
    data.setdefault("citations", [])

    if not isinstance(data.get("rationale"), list):
        data["rationale"] = [str(data.get("rationale"))]
    if not isinstance(data.get("missing_info"), list):
        data["missing_info"] = [str(data.get("missing_info"))]
    if not isinstance(data.get("jurisdiction_notes"), dict):
        data["jurisdiction_notes"] = {}

    return data
