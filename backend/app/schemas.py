from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthSession(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None


class AuthResponse(BaseModel):
    user_id: str
    email: str | None = None
    session: AuthSession


class ProjectCreate(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = None
    intake: Dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    intake: Optional[Dict[str, Any]] = None


class ProjectOut(BaseModel):
    id: str
    owner_id: str
    title: str
    description: Optional[str] = None
    status: str
    intake: Dict[str, Any]
    created_at: str
    updated_at: str
    # Optional report fields (generated after project creation)
    report_url: Optional[str] = None
    report_bucket: Optional[str] = None
    report_path: Optional[str] = None
    report_generated_at: Optional[str] = None


class DocumentOut(BaseModel):
    id: str
    project_id: str
    filename: str
    mime_type: Optional[str] = None
    byte_size: Optional[int] = None
    created_at: str
    download_url: Optional[str] = None


class ChatMessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: str


class ChatSendRequest(BaseModel):
    message: str


class ChatSendResponse(BaseModel):
    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
