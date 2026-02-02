from __future__ import annotations

from typing import List, Dict, Any

from openai import OpenAI

from .config import settings


_client: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def generate_assistant_reply(chat_messages: List[Dict[str, str]]) -> str:
    """Generate an assistant reply based on chat history.

    chat_messages: list of {role: 'system'|'user'|'assistant', content: str}
    """
    client = get_openai_client()
    # Use Chat Completions API for compatibility.
    resp = client.chat.completions.create(
        model=settings.openai_model,
        messages=chat_messages,
        temperature=0.2,
    )
    return resp.choices[0].message.content or ''
