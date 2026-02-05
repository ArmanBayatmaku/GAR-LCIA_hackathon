from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from ..core.openai_client import get_openai_client
from ..core.config import settings


@dataclass
class ExtractedFields:
    data: Dict[str, Any]


_SEAT_RE = re.compile(
    r"\b(?:seat|place)\s+of\s+arbitration\b[^\n\r]{0,120}",
    re.IGNORECASE,
)
_GOVLAW_RE = re.compile(
    r"\b(?:governing law|governed by|laws? of)\b[^\n\r]{0,140}",
    re.IGNORECASE,
)


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _snip(s: str, n: int = 8000) -> str:
    s = s.strip()
    if len(s) <= n:
        return s
    return s[:n] + "\n...[TRUNCATED]..."


def _find_lines(text: str, pattern: re.Pattern, *, max_hits: int = 12) -> List[str]:
    hits: List[str] = []
    for m in pattern.finditer(text):
        start = max(0, m.start() - 140)
        end = min(len(text), m.end() + 140)
        frag = _clean(text[start:end])
        if frag and frag not in hits:
            hits.append(frag)
        if len(hits) >= max_hits:
            break
    return hits


def _heuristic_extract(text: str) -> Dict[str, Any]:
    """Cheap regex/keyword extraction to reduce empty fields when LLM is unavailable."""
    out: Dict[str, Any] = {
        "current_seat": None,
        "proposed_seats": [],
        "institution_rules": None,
        "governing_law": None,
        "urgency": None,
        "parties": [],
        "nature_of_dispute": None,
        "procedural_sensitivities": [],
        "arbitration_agreement_text": None,
        "parties_assets_where": None,
        "evidence": {},
    }

    # very rough: pick first seat-like fragment
    seat_hits = _find_lines(text, _SEAT_RE, max_hits=3)
    if seat_hits:
        out["current_seat"] = seat_hits[0]
        out["evidence"]["current_seat"] = [{"quote": seat_hits[0]}]

    gl_hits = _find_lines(text, _GOVLAW_RE, max_hits=3)
    if gl_hits:
        out["governing_law"] = gl_hits[0]
        out["evidence"]["governing_law"] = [{"quote": gl_hits[0]}]

    # institution guess
    inst = None
    for key in ["LCIA", "ICC", "UNCITRAL", "SIAC", "HKIAC", "ICDR", "SCC", "VIAC"]:
        if re.search(rf"\b{re.escape(key)}\b", text, re.IGNORECASE):
            inst = key
            break
    if inst:
        out["institution_rules"] = inst

    # clause excerpt guess
    m = re.search(r"\barbitration\b.{0,500}", text, re.IGNORECASE | re.DOTALL)
    if m:
        out["arbitration_agreement_text"] = _clean(m.group(0))[:1200]

    return out


def extract_fields_from_documents(
    *,
    docs_text: List[Tuple[str, str]],
) -> Dict[str, Any]:
    """Extract report fields from document texts.

    docs_text: list of (filename, text_with_page_tags)

    Returns a dict matching the report_generator "extracted" structure.
    """

    combined = "\n\n".join([f"=== {name} ===\n{txt}" for name, txt in docs_text])

    # If OpenAI key missing, fall back.
    if not settings.openai_api_key:
        return _heuristic_extract(combined)

    client = get_openai_client()

    # Keep context small but include the most relevant cues.
    seat_cues = _find_lines(combined, _SEAT_RE)
    law_cues = _find_lines(combined, _GOVLAW_RE)

    prompt = {
        "task": "Extract structured arbitration case details for a seat-of-arbitration analysis report.",
        "rules": [
            "Only use information explicitly present in the provided text.",
            "If not present, return null/empty and do NOT guess.",
            "When you populate a field, also include a short evidence quote with page tag if possible.",
        ],
        "fields": {
            "current_seat": "string|null",
            "proposed_seats": "string[] (empty if none)",
            "institution_rules": "string|null",
            "governing_law": "string|null",
            "urgency": "string|null",
            "parties": "string[]",
            "nature_of_dispute": "string|null",
            "procedural_sensitivities": "string[]",
            "arbitration_agreement_text": "string|null (quote/excerpt if available)",
            "parties_assets_where": "string|null",
            "evidence": "object mapping field->[{doc, page, quote}]",
        },
        "hints": {
            "seat_related_snippets": seat_cues,
            "governing_law_snippets": law_cues,
        },
        "documents": [{"name": name, "text": _snip(txt)} for name, txt in docs_text],
    }

    messages = [
        {
            "role": "system",
            "content": (
                "You are extracting facts from arbitration documents. "
                "Return ONLY valid JSON. No markdown. No commentary. "
                "Do not invent names, seats, laws, or institutions."),
        },
        {"role": "user", "content": json.dumps(prompt)},
    ]

    # Try to force JSON object output where supported.
    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
    except Exception:
        # fallback: plain generation
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0.0,
        )
        raw = resp.choices[0].message.content or "{}"

    data = _safe_json_load(raw)
    if not isinstance(data, dict):
        data = {}

    # Ensure required keys exist
    base = _heuristic_extract(combined)
    for k, v in base.items():
        data.setdefault(k, v)

    # Normalize types
    if data.get("proposed_seats") is None:
        data["proposed_seats"] = []
    if not isinstance(data.get("proposed_seats"), list):
        data["proposed_seats"] = [str(data["proposed_seats"]) ]
    if data.get("parties") is None:
        data["parties"] = []
    if not isinstance(data.get("parties"), list):
        data["parties"] = [str(data["parties"]) ]
    if data.get("procedural_sensitivities") is None:
        data["procedural_sensitivities"] = []
    if not isinstance(data.get("procedural_sensitivities"), list):
        data["procedural_sensitivities"] = [str(data["procedural_sensitivities"]) ]

    return data


def _safe_json_load(s: str) -> Any:
    """Parse JSON even if the model wrapped it in text."""
    s = s.strip()
    # direct parse
    try:
        return json.loads(s)
    except Exception:
        pass
    # try to find first {...}
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return {}
    return {}
