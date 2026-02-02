from __future__ import annotations

from supabase import create_client, Client

from .config import settings


def get_admin_client() -> Client:
    # Service role key must stay server-side.
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_anon_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_anon_key)

