from __future__ import annotations

from io import BytesIO
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from docx import Document
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from ..core.config import settings
from ..core.openai_client import generate_assistant_reply, get_openai_client
from ..core.security import get_current_user_id
from ..core.supabase import get_admin_client
from ..schemas import ChatMessageOut, ChatSendRequest, ChatSendResponse
from ..services.report_job import generate_report_for_project
from .projects import _project_or_404

router = APIRouter(prefix='/projects', tags=['chat'])

# Required intake fields for a non-empty seat recommendation.
REQUIRED_FIELDS = [
    'current_seat',
    'proposed_seats',
    'arbitration_agreement_text',
    'institution_rules',
    'governing_law',
]


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _compute_missing(intake: Optional[Dict[str, Any]]) -> List[str]:
    intake = intake or {}
    # Explicit user overrides live here; they must count as "provided".
    overrides = intake.get('_assumption_overrides') or {}
    missing: List[str] = []
    for k in REQUIRED_FIELDS:
        v = overrides.get(k, intake.get(k))
        if v is None:
            missing.append(k)
            continue
        if isinstance(v, str) and not v.strip():
            missing.append(k)
            continue
        if isinstance(v, list) and len(v) == 0:
            missing.append(k)
            continue
    return missing


ASSUMPTION_TRIGGERS = (
    'assume',
    "let's assume",
    'treat as true',
    'for this scenario',
)


def _looks_like_assumption_message(msg: str) -> bool:
    t = (msg or '').lower()
    return any(trig in t for trig in ASSUMPTION_TRIGGERS)


def _normalize_seat_list(text: str) -> List[str]:
    # Split on commas or 'and'
    parts = re.split(r",|\band\b", text, flags=re.IGNORECASE)
    seats = [p.strip(" \t\n\r.;:()[]") for p in parts]
    return [s for s in seats if s]


def _extract_assumption_patch_from_user_message(user_message: str) -> Dict[str, Any]:
    """Extract explicit user overrides.

    If the user says "Assume ..." (or similar), their scenario inputs MUST override documents
    and previously extracted facts. We store them in intake:
      - _assumptions: list[str] (raw texts)
      - _assumption_overrides: dict[field->value] (parsed structured overrides)
    """
    msg = (user_message or '').strip()
    if not msg:
        return {}
    if not _looks_like_assumption_message(msg):
        return {}

    patch: Dict[str, Any] = {'_assumptions': [msg]}
    overrides: Dict[str, Any] = {}

    # Try to parse common fields from the message. We accept partial parsing; raw assumption still stored.
    segments = re.split(r"[\n;]+", msg)
    for seg in segments:
        s = seg.strip()
        if not s:
            continue
        s2 = re.sub(
            r"^(?:assume|let\s*'s\s*assume|treat\s+as\s+true|for\s+this\s+scenario)\s*[:\-]?\s*",
            "",
            s,
            flags=re.IGNORECASE,
        ).strip()

        # current seat
        m = re.search(r"(?:current\s*)?seat\s*(?:is|=|:)\s*(.+)$", s2, re.IGNORECASE)
        if m and ('current' in s2.lower() or 'current seat' in s.lower()):
            overrides['current_seat'] = m.group(1).strip()

        # proposed seats
        m = re.search(r"proposed\s+seats?\s*(?:are|is|=|:)\s*(.+)$", s2, re.IGNORECASE)
        if m:
            overrides['proposed_seats'] = _normalize_seat_list(m.group(1))

        # governing law
        m = re.search(r"governing\s+law\s*(?:is|=|:)\s*(.+)$", s2, re.IGNORECASE)
        if m:
            overrides['governing_law'] = m.group(1).strip()

        # institution/rules
        m = re.search(r"(?:institution|rules)\s*(?:are|is|=|:)\s*(.+)$", s2, re.IGNORECASE)
        if m:
            overrides['institution_rules'] = m.group(1).strip()

        # arbitration agreement / clause
        m = re.search(r"(?:arbitration\s+(?:clause|agreement|agreement\s+text))\s*(?:is|=|:)\s*(.+)$", s2, re.IGNORECASE | re.DOTALL)
        if m:
            overrides['arbitration_agreement_text'] = m.group(1).strip()

    if overrides:
        patch['_assumption_overrides'] = overrides
    return patch


def _get_stored_blockers(project: Dict[str, Any]) -> List[str]:
    """Fallback: blockers saved by report generation in intake metadata (if present)."""
    intake = project.get('intake') or {}
    inv = intake.get('_intervention') or {}
    last = intake.get('_last_decision') or {}
    blockers = inv.get('missing_info') or last.get('missing_info') or []
    out: List[str] = []
    if isinstance(blockers, list):
        for b in blockers:
            s = _clean(str(b))
            if s:
                out.append(s)
    return out


def _looks_like_why_intervention_question(msg: str) -> bool:
    t = (msg or '').lower()
    if 'intervention' not in t:
        return False
    return any(k in t for k in ['why', 'reason', 'missing', "what's missing", 'what is missing', 'blocked', 'blocker'])


def _build_intervention_summary(
    *,
    project: Dict[str, Any],
    missing_fields: List[str],
    report_blockers: List[str],
    docs: List[Dict[str, Any]],
) -> str:
    """Authoritative explanation used when the user asks why intervention is active."""
    lines: List[str] = []
    lines.append("Intervention Required — specific reason(s) for THIS project:")
    if missing_fields:
        lines.append(f"- Missing required fields: {', '.join(missing_fields)}")
    if not docs:
        lines.append("- No documents uploaded for this project, so the decision cannot be grounded.")
    if report_blockers:
        lines.append("- Blockers from the last generated report:")
        for b in report_blockers[:6]:
            lines.append(f"  • {b}")
    rep_err = project.get('report_error')
    if rep_err:
        lines.append(f"- Technical note: {rep_err}")
    if (not missing_fields) and docs and (not report_blockers):
        lines.append("- The project is marked intervention, but no blockers were extracted. Regenerate the report to refresh blockers.")
    lines.append("\nReply with the missing details and I will update the project and regenerate the report.")
    return "\n".join(lines).strip()
def _get_project(sb, project_id: str, user_id: str) -> Dict[str, Any]:
    res = sb.table('projects').select('*').eq('id', project_id).eq('owner_id', user_id).limit(1).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    if not data:
        raise HTTPException(status_code=404, detail='Project not found')
    return data[0]


def _list_documents(sb, project_id: str, user_id: str) -> List[Dict[str, Any]]:
    res = (
        sb.table('documents')
        .select('id,filename,mime_type,byte_size,storage_bucket,storage_path,created_at')
        .eq('project_id', project_id)
        .eq('owner_id', user_id)
        .order('created_at', desc=False)
        .execute()
    )
    data = res.data if hasattr(res, 'data') else res.get('data')
    return data or []


def _download_report_docx_bytes(sb, project: Dict[str, Any]) -> Optional[bytes]:
    bucket = project.get('report_bucket')
    path = project.get('report_path')
    if not bucket or not path:
        return None
    try:
        data = sb.storage.from_(bucket).download(path)
        if hasattr(data, 'read'):
            data = data.read()
        return data if isinstance(data, (bytes, bytearray)) else None
    except Exception:
        return None


def _docx_to_text(docx_bytes: bytes, *, max_chars: int = 22000) -> str:
    try:
        d = Document(BytesIO(docx_bytes))
        parts = []
        for p in d.paragraphs:
            t = (p.text or '').strip()
            if t:
                parts.append(t)
        txt = '\n'.join(parts)
        txt = txt.strip()
        if len(txt) > max_chars:
            # Prefer the conclusion section if present
            idx = txt.lower().find('3. conclusion')
            if idx != -1:
                txt = txt[idx:idx + max_chars]
            else:
                txt = txt[:max_chars]
        return txt
    except Exception:
        return ''


def _extract_missing_blockers_from_report(report_text: str) -> List[str]:
    if not report_text:
        return []
    # Try to capture the "Missing information / blockers" block
    t = report_text
    m = re.search(r"Missing information\s*/\s*blockers\s*:(.*?)(\n\s*3\.2\s*Rationale|\n\s*3\.2\s*Rationale|\n\s*3\.2|\n\s*3\.3|$)", t, re.IGNORECASE | re.DOTALL)
    block = m.group(1) if m else ''
    lines = []
    for raw in (block or '').splitlines():
        s = raw.strip(' \t\r\n-•')
        if not s:
            continue
        # remove bracket citations to keep it readable in chat
        s = re.sub(r"\[[^\]]+\]", "", s).strip()
        if s:
            lines.append(s)
    # If we couldn't find that heading, fall back to lines containing "Missing".
    if not lines:
        for raw in t.splitlines():
            if re.search(r"missing information|blockers", raw, re.IGNORECASE):
                continue
            if raw.strip().lower().startswith('missing'):
                s = raw.strip(' \t\r\n-•')
                s = re.sub(r"\[[^\]]+\]", "", s).strip()
                if s:
                    lines.append(s)
    return lines[:12]


def _build_system_prompt(
    *,
    project: Dict[str, Any],
    docs: List[Dict[str, Any]],
    missing_fields: List[str],
    report_text: str,
    report_blockers: List[str],
) -> str:
    """A project-scoped prompt that *forces* the assistant to use context."""

    # Keep context compact to reduce token waste.
    intake = project.get('intake') or {}
    ctx = {
        'project_id': project.get('id'),
        'title': project.get('title'),
        'status': project.get('status'),
        'report_error': project.get('report_error'),
        'missing_required_fields': missing_fields,
        'intake': intake,
        'assumptions_active': intake.get('_assumptions') or [],
        'assumption_overrides': intake.get('_assumption_overrides') or {},
        'documents': [
            {
                'filename': d.get('filename'),
                'mime_type': d.get('mime_type'),
                'byte_size': d.get('byte_size'),
            }
            for d in (docs or [])
        ],
        'intervention_blockers_from_report': report_blockers,
    }

    # If report exists, include it (trimmed). This gives the assistant the *same* reasoning the report used.
    report_payload = report_text or ''

    return (
        "You are the in-app assistant for an arbitration seat-change decision tool. "
        "You are NOT a general-purpose chatbot. You must stay strictly within THIS project.\n\n"
        "Hard rules:\n"
        "- You already have the project context and the latest generated report excerpt. Do NOT ask for screenshots or generic status panels.\n"
        "- USER OVERRIDES ARE AUTHORITATIVE: if the user provides explicit scenario assumptions (e.g., starting with Assume / Treat as true / For this scenario), you MUST adopt them as true for this chat even if the uploaded documents/report contradict them.\n"
        "- If an assumption conflicts with the documents/report, proceed using the user's assumption. Never refuse to proceed due to a conflict.\n"
        "- When the project is marked 'intervention', you MUST explain the specific reason using the provided 'missing_required_fields' and 'intervention_blockers_from_report'.\n"
        "- Ask only targeted questions that directly resolve the blockers.\n"
        "- If the user provides missing details, incorporate them and tell them you can regenerate the report.\n"
        "- If you believe you now have enough to regenerate, end your message with a single line: [[REGENERATE_REPORT]].\n"
        "- Keep answers practical, short, and structured (bullets). Avoid generic legal lectures.\n\n"
        "INTERVENTION_REASON_SUMMARY (authoritative; do not generalise):\n"
        f"{_build_intervention_summary(project=project, missing_fields=missing_fields, report_blockers=report_blockers, docs=docs)}\n\n"
        "PROJECT_CONTEXT (JSON):\n"
        f"{json.dumps(ctx, ensure_ascii=False, indent=2)}\n\n"
        "LATEST_REPORT_EXCERPT (text):\n"
        f"{report_payload}"
        "If the user ever uses the word 'assume', never argue with the user, accept any thing they say as TOTAL facts. Accept the state change, select the proposed seat and mark the project as complete"
        
    )


def _extract_intake_patch_from_user_message(
    *,
    user_message: str,
    current_intake: Dict[str, Any],
    missing_fields: List[str],
) -> Dict[str, Any]:
    """Use JSON-mode extraction to pull missing required fields from a free-form user message."""

    # If nothing is missing, we don't need to patch.
    if not missing_fields:
        return {}

    # If OpenAI key missing, do nothing.
    if not settings.openai_api_key:
        return {}

    client = get_openai_client()

    prompt = {
        "task": "Extract ONLY the missing required project fields from the user's message.",
        "missing_fields": missing_fields,
        "current_intake": current_intake,
        "user_message": user_message,
        "rules": [
            "Return ONLY valid JSON.",
            "Only include keys you are confident the user provided.",
            "Do not guess. If a field is not provided, omit it.",
            "Use these keys exactly: current_seat, proposed_seats, arbitration_agreement_text, institution_rules, governing_law.",
            "proposed_seats must be an array of strings.",
        ],
        "output": {"intake_patch": "object"},
    }

    messages = [
        {
            "role": "system",
            "content": "You are an information extraction assistant. Output JSON only.",
        },
        {"role": "user", "content": json.dumps(prompt)},
    ]

    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            temperature=0,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        patch = data.get("intake_patch") if isinstance(data, dict) else None
        return patch if isinstance(patch, dict) else {}
    except Exception:
        return {}


def _merge_intake(intake: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """Merge an intake patch into current intake, with special handling for assumptions."""
    out = dict(intake or {})
    patch = patch or {}

    # Merge assumptions (append unique)
    if '_assumptions' in patch:
        existing = out.get('_assumptions') or []
        merged = list(existing)
        for a in (patch.get('_assumptions') or []):
            s = _clean(str(a))
            if s and s not in merged:
                merged.append(s)
        out['_assumptions'] = merged

    # Merge structured overrides; these MUST also override the main fields.
    if '_assumption_overrides' in patch:
        existing_overrides = out.get('_assumption_overrides') or {}
        merged_overrides = dict(existing_overrides)
        for k, v in (patch.get('_assumption_overrides') or {}).items():
            if v is None:
                continue
            if isinstance(v, str):
                v = v.strip()
            merged_overrides[k] = v
            # Apply override to top-level field too (so downstream uses it automatically).
            out[k] = v
        out['_assumption_overrides'] = merged_overrides

    # Merge normal fields
    for k, v in (patch or {}).items():
        if k in ('_assumptions', '_assumption_overrides'):
            continue
        if v is None:
            continue
        if isinstance(v, str):
            v = v.strip()
        out[k] = v

    return out
def _strip_regen_marker(text: str) -> Tuple[str, bool]:
    if not text:
        return text, False
    lines = text.strip().splitlines()
    if lines and lines[-1].strip() == '[[REGENERATE_REPORT]]':
        return '\n'.join(lines[:-1]).rstrip(), True
    return text, False


def _seed_intervention_message(
    *,
    project: Dict[str, Any],
    missing_fields: List[str],
    report_blockers: List[str],
    docs: List[Dict[str, Any]],
) -> str:
    lines: List[str] = []
    lines.append("This project is marked **Intervention Required**.")
    if missing_fields:
        lines.append("\n**Missing required fields:** " + ", ".join(missing_fields))
    if report_blockers:
        lines.append("\n**Blockers from the last generated report (what prevented a supported conclusion):**")
        for b in report_blockers[:10]:
            lines.append(f"- {b}")

    if not docs:
        lines.append("\n**No documents are uploaded** for this project, so the system cannot ground the decision.")

    # Give very concrete next steps.
    lines.append("\nReply in chat with the missing details. Short answers are fine.")
    if 'current_seat' in missing_fields:
        lines.append("- Current seat (e.g., London)")
    if 'proposed_seats' in missing_fields:
        lines.append("- Proposed seat(s) (comma-separated)")
    if 'arbitration_agreement_text' in missing_fields:
        lines.append("- Paste the arbitration clause (especially seat/change-seat language)")
    if 'institution_rules' in missing_fields:
        lines.append("- Institution/rules (e.g., LCIA 2020)")
    if 'governing_law' in missing_fields:
        lines.append("- Governing law (contract)")

    if report_blockers:
        lines.append("\nIf you can answer the blockers above, I can regenerate the report.")
        lines.append("When you believe you have provided enough, say: **generate report**.")

    return "\n".join(lines).strip()


def _to_msg_out(row: dict) -> ChatMessageOut:
    return ChatMessageOut(
        id=row['id'],
        role=row['role'],
        content=row['content'],
        created_at=row['created_at'],
    )


@router.get('/{project_id}/chat/messages', response_model=list[ChatMessageOut])
def list_messages(project_id: str, user_id: str = Depends(get_current_user_id)):
    _project_or_404(project_id, user_id)
    sb = get_admin_client()
    project = _get_project(sb, project_id, user_id)

    res = (
        sb.table('messages')
        .select('*')
        .eq('project_id', project_id)
        .eq('owner_id', user_id)
        .order('created_at', desc=False)
        .execute()
    )
    data = res.data if hasattr(res, 'data') else res.get('data')
    rows = data or []

    # If intervention and empty chat, seed a first message that explains WHY using the report.
    if (not rows) and (project.get('status') == 'intervention'):
        docs = _list_documents(sb, project_id, user_id)
        missing_fields = _compute_missing(project.get('intake') or {})
        report_bytes = _download_report_docx_bytes(sb, project)
        report_text = _docx_to_text(report_bytes) if report_bytes else ''
        # Fallback to cached excerpt saved in intake during report generation (avoids storage download issues).
        intake_cached = (project.get('intake') or {})
        if not report_text:
            report_text = str(intake_cached.get('_last_report_excerpt') or '')
        blockers = _extract_missing_blockers_from_report(report_text)

        if not blockers:
            blockers = _get_stored_blockers(project)
        seeded = _seed_intervention_message(
            project=project,
            missing_fields=missing_fields,
            report_blockers=blockers,
            docs=docs,
        )
        try:
            ins = sb.table('messages').insert({
                'project_id': project_id,
                'owner_id': user_id,
                'role': 'assistant',
                'content': seeded,
            }).execute()
            d = ins.data if hasattr(ins, 'data') else ins.get('data')
            if d:
                rows = d + rows
        except Exception:
            # If seeding fails, still return an empty chat.
            pass

    return [_to_msg_out(r) for r in (rows or [])]


@router.post('/{project_id}/chat/send', response_model=ChatSendResponse)
def send_message(
    project_id: str,
    payload: ChatSendRequest,
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    _project_or_404(project_id, user_id)
    if not payload.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Empty message')

    sb = get_admin_client()

    project = _get_project(sb, project_id, user_id)
    docs = _list_documents(sb, project_id, user_id)
    report_bytes = _download_report_docx_bytes(sb, project)
    report_text = _docx_to_text(report_bytes) if report_bytes else ''
    # Fallback to cached excerpt saved in intake during report generation (avoids storage download issues).
    intake_cached = (project.get('intake') or {})
    if not report_text:
        report_text = str(intake_cached.get('_last_report_excerpt') or '')
    report_blockers = _extract_missing_blockers_from_report(report_text)
    if not report_blockers:
        report_blockers = _get_stored_blockers(project)

    # If intervention: try to extract missing required fields from the user message and patch intake.
    current_intake = project.get('intake') or {}
    missing_fields = _compute_missing(current_intake)

# Apply explicit user scenario assumptions/overrides (ALWAYS highest priority).
# This runs even if no required fields are missing, because it can override prior extracted values.
    assumption_patch = _extract_assumption_patch_from_user_message(payload.message.strip())
    if assumption_patch:
        merged = _merge_intake(current_intake, assumption_patch)
        try:
            sb.table('projects').update({'intake': merged}).eq('id', project_id).eq('owner_id', user_id).execute()
            project['intake'] = merged
        except Exception:
            pass
        current_intake = project.get('intake') or {}
        missing_fields = _compute_missing(current_intake)
        patch = _extract_intake_patch_from_user_message(
            user_message=payload.message.strip(),
            current_intake=current_intake,
            missing_fields=missing_fields,
        )
        if patch:
            merged = _merge_intake(current_intake, patch)
            try:
                sb.table('projects').update({'intake': merged}).eq('id', project_id).eq('owner_id', user_id).execute()
                project['intake'] = merged
            except Exception:
                pass
            missing_fields = _compute_missing(project.get('intake') or {})

        # store user message
        ins_user = {
            'project_id': project_id,
            'owner_id': user_id,
            'role': 'user',
            'content': payload.message.strip(),
        }
        r1 = sb.table('messages').insert(ins_user).execute()
        d1 = r1.data if hasattr(r1, 'data') else r1.get('data')
        if not d1:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Failed to store user message')
        user_row = d1[0]

        # get last N messages for context (including new user message)
        r2 = (
            sb.table('messages')
            .select('role,content,created_at')
            .eq('project_id', project_id)
            .eq('owner_id', user_id)
            .order('created_at', desc=True)
            .limit(settings.max_chat_history)
            .execute()
        )
        hist = r2.data if hasattr(r2, 'data') else r2.get('data')
        hist = list(reversed(hist or []))

        # Deterministic intervention explanation: avoid generic LLM answers for "why/missing" questions.
        if project.get('status') == 'intervention' and _looks_like_why_intervention_question(payload.message):
            summary = _build_intervention_summary(project=project, missing_fields=missing_fields, report_blockers=report_blockers, docs=docs)
            ins = sb.table('messages').insert({
                'project_id': project_id,
                'owner_id': user_id,
                'role': 'assistant',
                'content': summary,
            }).execute()
            d = ins.data if hasattr(ins, 'data') else ins.get('data')
            asst_row = (d or [None])[0]
            if not asst_row:
                r_last = (
                    sb.table('messages')
                    .select('*')
                    .eq('project_id', project_id)
                    .eq('owner_id', user_id)
                    .order('created_at', desc=True)
                    .limit(1)
                    .execute()
                )
                dd = r_last.data if hasattr(r_last, 'data') else r_last.get('data')
                asst_row = (dd or [None])[0]
            return ChatSendResponse(user_message=_to_msg_out(user_row), assistant_message=_to_msg_out(asst_row))

        system_prompt = _build_system_prompt(
            project=project,
            docs=docs,
            missing_fields=missing_fields,
            report_text=report_text,
            report_blockers=report_blockers,
        )

        openai_messages = [{'role': 'system', 'content': system_prompt}]
        for m in hist:
            role = m.get('role')
            openai_role = 'assistant' if role == 'assistant' else 'user'
            if role == 'system':
                # we don't persist system messages; skip if any exist
                continue
            openai_messages.append({'role': openai_role, 'content': m.get('content', '')})

        # call OpenAI
        try:
            reply_raw = generate_assistant_reply(openai_messages)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'OpenAI call failed: {e}') from e

        reply, wants_regen = _strip_regen_marker(reply_raw)

        # Also trigger regeneration if the user explicitly asks.
        user_asks_regen = bool(re.search(r"\b(regenerate|generate)\s+report\b", payload.message, re.IGNORECASE))
        if wants_regen or user_asks_regen:
            # mark project working and kick background regeneration
            try:
                sb.table('projects').update({'status': 'working', 'report_error': None}).eq('id', project_id).eq('owner_id', user_id).execute()
            except Exception:
                pass
            background.add_task(generate_report_for_project, project_id, user_id)
            if not reply:
                reply = "Okay — regenerating the report now. Refresh the project in a moment to download the updated version."
            else:
                reply = reply + "\n\n(Started regenerating the report.)"

        # store assistant message
        ins_asst = {
            'project_id': project_id,
            'owner_id': user_id,
            'role': 'assistant',
            'content': reply,
        }
        r3 = sb.table('messages').insert(ins_asst).execute()
        d3 = r3.data if hasattr(r3, 'data') else r3.get('data')
        if not d3:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail='Failed to store assistant message')
        asst_row = d3[0]

        return ChatSendResponse(user_message=_to_msg_out(user_row), assistant_message=_to_msg_out(asst_row))