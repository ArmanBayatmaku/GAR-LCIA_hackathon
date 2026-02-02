from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..core.security import get_current_user_id
from ..core.supabase import get_admin_client
from ..core.openai_client import generate_assistant_reply
from ..core.config import settings
from ..schemas import ChatMessageOut, ChatSendRequest, ChatSendResponse
from .projects import _project_or_404

router = APIRouter(prefix='/projects', tags=['chat'])

SYSTEM_PROMPT = (
    "You are an assistant inside an arbitration hackathon app. "
    "Do not invent legal rules or citations. If the user asks for a legal conclusion, "
    "ask for missing inputs. For now, keep answers short and practical."
)


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
    res = sb.table('messages').select('*').eq('project_id', project_id).eq('owner_id', user_id).order('created_at', desc=False).execute()
    data = res.data if hasattr(res, 'data') else res.get('data')
    rows = data or []
    return [_to_msg_out(r) for r in rows]


@router.post('/{project_id}/chat/send', response_model=ChatSendResponse)
def send_message(project_id: str, payload: ChatSendRequest, user_id: str = Depends(get_current_user_id)):
    _project_or_404(project_id, user_id)
    if not payload.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Empty message')

    sb = get_admin_client()

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
    r2 = sb.table('messages').select('role,content,created_at').eq('project_id', project_id).eq('owner_id', user_id).order('created_at', desc=True).limit(settings.max_chat_history).execute()
    hist = r2.data if hasattr(r2, 'data') else r2.get('data')
    hist = list(reversed(hist or []))

    openai_messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]
    for m in hist:
        role = m['role']
        if role == 'assistant':
            openai_role = 'assistant'
        elif role == 'system':
            openai_role = 'system'
        else:
            openai_role = 'user'
        openai_messages.append({'role': openai_role, 'content': m['content']})

    # call OpenAI
    try:
        reply = generate_assistant_reply(openai_messages)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f'OpenAI call failed: {e}') from e

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
