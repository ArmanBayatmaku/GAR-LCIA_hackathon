from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from ..core.config import settings
from ..core.openai_client import get_openai_client
from ..core.security import get_current_user_id
from ..core.supabase import get_admin_client
from ..schemas import ChatMessageOut, ChatSendRequest, ChatSendResponse
from ..services.report_job import generate_report_for_project
from .projects import _project_or_404

router = APIRouter(prefix="/projects", tags=["chat"])


ALLOWED_INTAKE_KEYS = {
    "current_seat",
    "proposed_seats",
    "institution_rules",
    "arbitration_agreement_text",
    "governing_law",
    "urgency",
    "parties_assets_where",
    "parties",
    "nature_of_dispute",
}

# These are the minimum fields we generally need to produce a meaningful seat-change conclusion.
REQUIRED_FOR_DECISION = [
    "current_seat",
    "proposed_seats",
    "arbitration_agreement_text",
]


def _to_msg_out(row: dict) -> ChatMessageOut:
    return ChatMessageOut(
        id=row["id"],
        role=row["role"],
        content=row["content"],
        created_at=row["created_at"],
    )


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _safe_json_load(s: str) -> Dict[str, Any]:
    s = (s or "").strip()
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        pass
    m = re.search(r"\{.*\}", s, re.DOTALL)
    if m:
        try:
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}
    return {}


def _normalize_intake_patch(patch: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in (patch or {}).items():
        if k not in ALLOWED_INTAKE_KEYS:
            continue
        if v is None:
            continue
        if isinstance(v, str) and not v.strip():
            continue
        out[k] = v

    # normalize proposed_seats
    if "proposed_seats" in out:
        ps = out["proposed_seats"]
        if isinstance(ps, str):
            parts = [p.strip() for p in re.split(r"[,;\n]", ps) if p.strip()]
            out["proposed_seats"] = parts
        elif isinstance(ps, list):
            out["proposed_seats"] = [str(x).strip() for x in ps if str(x).strip()]
    return out


def _compute_intervention(project: Dict[str, Any], docs_count: int) -> Tuple[str, List[str]]:
    intake = project.get("intake") or {}
    if not isinstance(intake, dict):
        intake = {}

    missing: List[str] = []

    def _empty_list(val: Any) -> bool:
        return not isinstance(val, list) or len([x for x in val if str(x).strip()]) == 0

    # Required decision inputs
    if not _clean(str(intake.get("current_seat") or "")):
        missing.append("current_seat")
    if _empty_list(intake.get("proposed_seats")):
        missing.append("proposed_seats")
    if not _clean(str(intake.get("arbitration_agreement_text") or "")):
        missing.append("arbitration_agreement_text")

    # Helpful but not strictly required
    if not _clean(str(intake.get("institution_rules") or "")):
        missing.append("institution_rules")
    if not _clean(str(intake.get("governing_law") or "")):
        missing.append("governing_law")

    # Build a plain-English reason.
    parts: List[str] = []
    if docs_count == 0:
        parts.append("No documents are uploaded to this project yet.")
    # If report generation stored a more specific intervention reason, surface it.
    meta = intake.get("_intervention") if isinstance(intake.get("_intervention"), dict) else None
    if meta:
        mi = meta.get("missing_info")
        if isinstance(mi, list) and mi:
            parts.append("Decision needed more grounded info: " + "; ".join([str(x) for x in mi if str(x).strip()]) )
    if project.get("report_error"):
        parts.append(f"Last report error: {project.get('report_error')}")
    if missing:
        parts.append("Missing inputs: " + ", ".join(missing))
    if not parts:
        parts.append("The app does not have enough grounded information to produce a confident conclusion.")
    return " ".join(parts), missing


def _missing_questions(missing: List[str]) -> List[str]:
    qmap = {
        "current_seat": "What is the current seat / place of arbitration stated in the arbitration agreement?",
        "proposed_seats": "Which alternative seat(s) are you considering (comma-separated)?",
        "arbitration_agreement_text": "Paste the arbitration clause (seat + rules clause) or upload the contract page that contains it.",
        "institution_rules": "Which institutional rules apply (LCIA / ICC / SIAC / UNCITRAL / etc.)? If unclear, paste the rules clause.",
        "governing_law": "What is the governing law of the contract/arbitration agreement?",
    }
    out = []
    for k in missing:
        if k in qmap:
            out.append(qmap[k])
    return out[:6]


def _build_intervention_intro(project: Dict[str, Any], reason: str, missing: List[str]) -> str:
    lines = [
        "This project is marked as INTERVENTION REQUIRED.",
        "",
        f"Reason: {reason}",
    ]
    qs = _missing_questions(missing)
    if qs:
        lines.append("")
        lines.append("To fix this, please answer:")
        for i, q in enumerate(qs, 1):
            lines.append(f"{i}. {q}")
        lines.append("")
        lines.append("After you provide the missing info, I can update the project and regenerate the report.")
        lines.append("You can also click 'Generate Report' at any time.")
    else:
        lines.append("")
        lines.append("Tell me what changed / what you want to update, and I can regenerate the report.")
    return "\n".join(lines)


@router.get("/{project_id}/chat/messages", response_model=list[ChatMessageOut])
def list_messages(project_id: str, user_id: str = Depends(get_current_user_id)):
    project = _project_or_404(project_id, user_id)
    sb = get_admin_client()

    res = (
        sb.table("messages")
        .select("*")
        .eq("project_id", project_id)
        .eq("owner_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    rows = (res.data if hasattr(res, "data") else res.get("data")) or []

    # If the project is Intervention Required and there is no chat history, seed a first assistant message
    # explaining why and what the user needs to provide.
    if not rows and (project.get("status") == "intervention"):
        docs_res = (
            sb.table("documents")
            .select("id")
            .eq("project_id", project_id)
            .eq("owner_id", user_id)
            .execute()
        )
        docs = (docs_res.data if hasattr(docs_res, "data") else docs_res.get("data")) or []
        reason, missing = _compute_intervention(project, len(docs))
        intro = _build_intervention_intro(project, reason, missing)

        ins_asst = {
            "project_id": project_id,
            "owner_id": user_id,
            "role": "assistant",
            "content": intro,
        }
        r0 = sb.table("messages").insert(ins_asst).execute()
        d0 = r0.data if hasattr(r0, "data") else r0.get("data")
        if d0:
            rows = d0

    return [_to_msg_out(r) for r in rows]


@router.post("/{project_id}/chat/send", response_model=ChatSendResponse)
def send_message(
    project_id: str,
    payload: ChatSendRequest,
    background: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    project = _project_or_404(project_id, user_id)
    if not payload.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty message")

    sb = get_admin_client()

    # store user message
    ins_user = {
        "project_id": project_id,
        "owner_id": user_id,
        "role": "user",
        "content": payload.message.strip(),
    }
    r1 = sb.table("messages").insert(ins_user).execute()
    d1 = r1.data if hasattr(r1, "data") else r1.get("data")
    if not d1:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to store user message")
    user_row = d1[0]

    # documents context (names only; we do NOT re-download docs on every chat message)
    docs_res = (
        sb.table("documents")
        .select("filename")
        .eq("project_id", project_id)
        .eq("owner_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    docs = (docs_res.data if hasattr(docs_res, "data") else docs_res.get("data")) or []
    doc_names = [d.get("filename") for d in docs if d.get("filename")]
    docs_count = len(doc_names)

    reason, missing = _compute_intervention(project, docs_count)
    intake = project.get("intake") or {}
    if not isinstance(intake, dict):
        intake = {}

    # get last N messages for context (including new user message)
    r2 = (
        sb.table("messages")
        .select("role,content,created_at")
        .eq("project_id", project_id)
        .eq("owner_id", user_id)
        .order("created_at", desc=True)
        .limit(settings.max_chat_history)
        .execute()
    )
    hist = (r2.data if hasattr(r2, "data") else r2.get("data")) or []
    hist = list(reversed(hist))

    system_prompt = (
        "You are the in-app assistant for an arbitration seat-change project. "
        "You MUST stay within this single project. Do NOT discuss other projects. "
        "Do NOT invent legal rules or citations. If the user asks for a legal conclusion, "
        "ask for missing inputs and suggest regenerating the report.\n\n"
        f"PROJECT TITLE: {project.get('title')}\n"
        f"PROJECT STATUS: {project.get('status')}\n"
        f"UPLOADED DOCUMENTS: {', '.join(doc_names) if doc_names else 'None'}\n"
        f"CURRENT INTAKE JSON: {json.dumps(intake, ensure_ascii=False)}\n"
        f"INTERVENTION REASON: {reason}\n"
        f"MISSING FIELDS: {missing}\n\n"
        "When status is INTERVENTION REQUIRED, your FIRST priority is to explain why "
        "(based on the reason/missing list) and ask targeted questions to fill the gaps. "
        "When the user provides concrete details, propose updates using an intake_patch.\n\n"
        "Return ONLY valid JSON with this schema:\n"
        "{\n"
        "  \"assistant_message\": string,\n"
        "  \"intake_patch\": object|null,\n"
        "  \"should_regenerate_report\": boolean,\n"
        "  \"regenerate_reason\": string|null\n"
        "}\n"
    )

    openai_messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for m in hist:
        role = m.get("role")
        if role == "assistant":
            openai_role = "assistant"
        else:
            openai_role = "user"
        openai_messages.append({"role": openai_role, "content": m.get("content") or ""})

    client = get_openai_client()
    raw = "{}"
    try:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=openai_messages,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
    except Exception:
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=openai_messages,
            temperature=0.2,
        )
        raw = resp.choices[0].message.content or "{}"

    data = _safe_json_load(raw)
    assistant_text = _clean(str(data.get("assistant_message") or ""))
    intake_patch = data.get("intake_patch") if isinstance(data.get("intake_patch"), dict) else {}
    intake_patch = _normalize_intake_patch(intake_patch)

    # Merge patch into intake
    updated_intake = dict(intake)
    if intake_patch:
        updated_intake.update(intake_patch)

    # Store intake updates if any
    if updated_intake != intake:
        try:
            sb.table("projects").update({"intake": updated_intake}).eq("id", project_id).eq("owner_id", user_id).execute()
            project["intake"] = updated_intake
            intake = updated_intake
        except Exception:
            pass

    # Decide whether to regenerate
    explicit_regen = bool(re.search(r"\b(generate|regenerate)\b.*\breport\b", payload.message, re.IGNORECASE))
    wants_regen = bool(data.get("should_regenerate_report")) or explicit_regen

    # If the project is intervention and the patch filled the missing fields, regenerate deterministically.
    reason_after, missing_after = _compute_intervention(project, docs_count)
    if (project.get("status") == "intervention") and intake_patch and (len(missing_after) == 0):
        wants_regen = True

    if not assistant_text:
        assistant_text = "OK."

    # Ensure the assistant explains intervention state when applicable
    if project.get("status") == "intervention":
        prefix = f"Intervention required: {reason}\n"
        if missing:
            prefix += "Missing: " + ", ".join(missing) + "\n"
        if not assistant_text.lower().startswith("intervention required"):
            assistant_text = prefix + "\n" + assistant_text
        if missing_after:
            assistant_text += "\n\nStill missing: " + ", ".join(missing_after)

    # Trigger report generation in the background if requested
    if wants_regen:
        try:
            sb.table("projects").update({"status": "working", "report_error": None}).eq("id", project_id).eq("owner_id", user_id).execute()
        except Exception:
            pass
        background.add_task(generate_report_for_project, project_id, user_id)
        assistant_text += "\n\nReport regeneration started."

    # store assistant message
    ins_asst = {
        "project_id": project_id,
        "owner_id": user_id,
        "role": "assistant",
        "content": assistant_text,
    }
    r3 = sb.table("messages").insert(ins_asst).execute()
    d3 = r3.data if hasattr(r3, "data") else r3.get("data")
    if not d3:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to store assistant message")
    asst_row = d3[0]

    return ChatSendResponse(user_message=_to_msg_out(user_row), assistant_message=_to_msg_out(asst_row))
