from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # OpenAI
    openai_api_key: str
    openai_model: str = 'gpt-4.1-mini'

    # Storage
    storage_bucket: str = 'project-files'

    # CORS
    cors_origins: str = 'http://localhost:5173'

    # Chat
    max_chat_history: int = 20

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]


settings = Settings()
