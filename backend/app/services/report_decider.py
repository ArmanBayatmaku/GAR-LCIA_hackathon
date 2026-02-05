from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from ..core.config import settings
from ..core.openai_client import get_openai_client


PAGE_TAG_RE = re.compile(r"\[PAGE\s+(\d+)\]", re.IGNORECASE)


def _norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def _split_pages(text_with_tags: str) -> List[Tuple[int, str]]:
    """Split joined page text (with [PAGE N] markers) into (page, text) entries."""
    if not text_with_tags:
        return []

    # Ensure tags are on their own line
    parts = PAGE_TAG_RE.split(text_with_tags)
    # split returns [before, page1, after1, page2, after2, ...]
    out: List[Tuple[int, str]] = []
    if len(parts) < 3:
        return out
    i = 1
    while i < len(parts):
        try:
            page = int(parts[i])
        except Exception:
            page = -1
        txt = parts[i + 1] if (i + 1) < len(parts) else ""
        txt = txt.strip()
        if txt:
            out.append((page, txt))
        i += 2
    return out


def _seat_tokens(seat: str) -> List[str]:
    """Extract a few useful tokens from a seat string."""
    if not seat:
        return []
    toks = re.split(r"[^A-Za-z]+", seat)
    toks = [t for t in toks if len(t) >= 3]
    # De-duplicate while keeping order
    seen = set()
    out = []
    for t in toks:
        tl = t.lower()
        if tl in seen:
            continue
        seen.add(tl)
        out.append(t)
    return out[:6]


def _score_page(text: str, terms: List[Tuple[str, int]]) -> int:
    t = text.lower()
    score = 0
    for term, w in terms:
        if not term:
            continue
        score += w * t.count(term)
    return score


def _select_evidence_pages(
    docs_text: List[Tuple[str, str]],
    *,
    current_seat: Optional[str],
    proposed_seats: List[str],
    max_pages: int = 14,
) -> List[Dict[str, Any]]:
    """Select a compact set of the most relevant (doc,page) excerpts for seat analysis."""
    # Weighted query terms
    base_terms: List[Tuple[str, int]] = [
        ("seat of arbitration", 8),
        ("place of arbitration", 8),
        ("seat", 2),
        ("jurisdiction", 2),
        ("governing law", 2),
        ("interim measures", 2),
        ("court", 1),
        ("set aside", 2),
        ("annul", 2),
        ("enforcement", 2),
        ("arbitration", 1),
    ]

    # Add seat tokens
    seats = [s for s in ([current_seat] if current_seat else []) + (proposed_seats or []) if s]
    for s in seats:
        for tok in _seat_tokens(s):
            base_terms.append((tok.lower(), 3))

    scored: List[Tuple[int, str, int, str]] = []  # (score, doc, page, excerpt)
    for doc_name, text in docs_text:
        for page, ptxt in _split_pages(text):
            if not ptxt:
                continue
            sc = _score_page(ptxt, base_terms)
            # Force include pages that explicitly define the seat
            if "seat of arbitration" in ptxt.lower() or "place of arbitration" in ptxt.lower():
                sc += 20
            if sc <= 0:
                continue
            excerpt = ptxt
            if len(excerpt) > 1600:
                excerpt = excerpt[:1600] + "\n...[TRUNCATED]..."
            scored.append((sc, doc_name, page, excerpt))

    scored.sort(key=lambda x: x[0], reverse=True)

    selected: List[Dict[str, Any]] = []
    seen = set()
    for sc, doc_name, page, excerpt in scored:
        key = (doc_name, page)
        if key in seen:
            continue
        seen.add(key)
        selected.append({
            "doc": doc_name,
            "page": page,
            "excerpt": excerpt,
            "score": sc,
        })
        if len(selected) >= max_pages:
            break
    return selected


def decide_conclusion_from_documents(
    *,
    docs_text: List[Tuple[str, str]],
    project_intake: Dict[str, Any],
    extracted: Dict[str, Any],
) -> Dict[str, Any]:
    """Produce conclusion fields for the report.

    This does NOT browse the web. It only uses the text extracted from uploaded
    documents plus the user's intake values.

    Returns keys that report_generator understands:
      - preferred_seat, alternative_seat
      - rationale (list)
      - alternative_circumstances
      - jurisdiction_notes (dict)
      - decision_meta (object)
    """

    # Normalize seats
    current_seat = (project_intake.get("current_seat") or extracted.get("current_seat") or "").strip() or None
    proposed = project_intake.get("proposed_seats") or extracted.get("proposed_seats") or []
    if proposed is None:
        proposed = []
    if isinstance(proposed, str):
        proposed = [proposed]
    proposed_seats = [str(x).strip() for x in proposed if str(x).strip()]

    # If no OpenAI key, return a conservative fallback.
    if not settings.openai_api_key:
        if current_seat:
            return {
                "preferred_seat": current_seat,
                "rationale": [
                    {
                        "text": "No AI model is configured (OPENAI_API_KEY missing), so this conclusion is a placeholder.",
                        "citations": [],
                    }
                ],
                "alternative_seat": proposed_seats[0] if proposed_seats else None,
                "alternative_circumstances": "To be determined.",
                "jurisdiction_notes": {},
                "decision_meta": {"confidence": "low", "missing": ["OPENAI_API_KEY"]},
            }
        return {
            "preferred_seat": None,
            "rationale": [{"text": "Insufficient information to decide.", "citations": []}],
            "alternative_seat": None,
            "alternative_circumstances": "To be determined.",
            "jurisdiction_notes": {},
            "decision_meta": {"confidence": "low", "missing": ["current_seat", "proposed_seats"]},
        }

    evidence_pages = _select_evidence_pages(
        docs_text,
        current_seat=current_seat,
        proposed_seats=proposed_seats,
        max_pages=14,
    )

    # Hard stop: if we have no evidence pages at all, deciding is mostly guessing.
    if not evidence_pages:
        missing = ["extractable_evidence"]
        if not current_seat:
            missing.append("current_seat")
        if not proposed_seats:
            missing.append("proposed_seats")
        return {
            "preferred_seat": current_seat,
            "rationale": [
                {
                    "text": "No extractable evidence was found in the uploaded documents for a seat comparison. This conclusion is not evidence-based.",
                    "citations": [],
                }
            ],
            "alternative_seat": proposed_seats[0] if proposed_seats else None,
            "alternative_circumstances": "Provide proposed seat(s) and an official seat guide / rules text to justify a change.",
            "jurisdiction_notes": {},
            "decision_meta": {"confidence": "low", "missing": missing},
        }

    client = get_openai_client()

    # Compact case snapshot
    snapshot = {
        "current_seat": current_seat,
        "proposed_seats": proposed_seats,
        "institution_rules": project_intake.get("institution_rules") or extracted.get("institution_rules"),
        "governing_law": project_intake.get("governing_law") or extracted.get("governing_law"),
        "urgency": project_intake.get("urgency") or extracted.get("urgency"),
        "parties_assets_where": project_intake.get("parties_assets_where") or extracted.get("parties_assets_where"),
        "nature_of_dispute": project_intake.get("nature_of_dispute") or extracted.get("nature_of_dispute"),
        "procedural_sensitivities": project_intake.get("procedural_sensitivities") or extracted.get("procedural_sensitivities"),
        "arbitration_agreement_text": project_intake.get("arbitration_agreement_text") or extracted.get("arbitration_agreement_text"),
        "parties": project_intake.get("parties") or extracted.get("parties"),
    }

    prompt = {
        "task": "Choose the most appropriate seat of arbitration (and optional backup seat) using only the provided evidence excerpts.",
        "strict_rules": [
            "Do NOT use outside knowledge or web browsing. Use ONLY the evidence excerpts provided.",
            "If evidence is insufficient for a factor, say so explicitly and lower confidence.",
            "Citations must reference the doc and page from evidence excerpts (e.g., 'ARBITRATION AGREEMENT.pdf [PAGE 3]').",
            "Do NOT claim legal certainty. This is a decision-support draft, not legal advice.",
        ],
        "decision_goal": {
            "question": "Should the seat be changed? If yes, to where?",
            "candidates": {
                "current_seat": current_seat,
                "proposed_seats": proposed_seats,
            },
        },
        "case_snapshot": snapshot,
        "evidence_excerpts": evidence_pages,
        "output_schema": {
            "selection_criteria": "string[] (high-level factors used; keep generic if evidence doesn't specify)",
            "shortlisted_jurisdictions": "string[] (seats actually compared)",
            "preferred_seat": "string|null",
            "change_recommended": "boolean",
            "alternative_seat": "string|null",
            "rationale": "array of {text: string, citations: string[]}",
            "jurisdiction_notes": "object mapping seat-> {positives: string[], negatives: string[]}",
            "alternative_circumstances": "string|null",
            "missing_info_blockers": "string[]",
            "confidence": "one of: low|medium|high",
        },
    }

    messages = [
        {
            "role": "system",
            "content": (
                "You are an arbitration decision-support assistant. Return ONLY valid JSON. "
                "Never invent citations. Never use outside knowledge."
            ),
        },
        {"role": "user", "content": json.dumps(prompt)},
    ]

    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
    except Exception:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.1,
        )
        raw = resp.choices[0].message.content or "{}"

    data = _safe_json_load(raw)
    if not isinstance(data, dict):
        data = {}

    # Post-normalize
    preferred = data.get("preferred_seat")
    if preferred:
        preferred = _norm_ws(str(preferred))
    alt = data.get("alternative_seat")
    if alt:
        alt = _norm_ws(str(alt))

    rationale = data.get("rationale")
    if not isinstance(rationale, list):
        rationale = []

    jur_notes = data.get("jurisdiction_notes")
    if not isinstance(jur_notes, dict):
        jur_notes = {}

    selection_criteria = data.get("selection_criteria")
    if not isinstance(selection_criteria, list):
        selection_criteria = []

    shortlisted_jurisdictions = data.get("shortlisted_jurisdictions")
    if not isinstance(shortlisted_jurisdictions, list):
        shortlisted_jurisdictions = []

    confidence = data.get("confidence")
    if confidence not in ("low", "medium", "high"):
        confidence = "low"

    return {
        "preferred_seat": preferred or current_seat,
        "alternative_seat": alt,
        "rationale": rationale,
        "jurisdiction_notes": jur_notes,
        "selection_criteria": selection_criteria,
        "shortlisted_jurisdictions": shortlisted_jurisdictions,
        "alternative_circumstances": data.get("alternative_circumstances"),
        "decision_meta": {
            "confidence": confidence,
            "change_recommended": bool(data.get("change_recommended")) if data.get("change_recommended") is not None else None,
            "missing": data.get("missing_info_blockers") if isinstance(data.get("missing_info_blockers"), list) else [],
        },
    }


def _safe_json_load(s: str) -> Any:
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
