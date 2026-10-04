"""Typed settings loaded from backend/.env (never committed).

Every field maps to an env var of the same name (case-insensitive). The
`*_ready` properties let routes degrade gracefully: a missing key returns a
clear 503 instead of crashing, so the frontend can fall back to the mock engine.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Server
    port: int = 8787
    allowed_origins: str = "http://localhost:5173"
    # The backend's own public URL — used to build /asset/{key} links the browser
    # can fetch. Set to the deployed backend URL in production.
    public_base_url: str = "http://localhost:8787"

    # Text — Groq (model ids rotate; see GET /openai/v1/models for the live list)
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # Image — Cloudflare Workers AI
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = ""
    image_model: str = "@cf/stabilityai/stable-diffusion-xl-base-1.0"

    # Video — fal.ai (default) / Replicate (alt)
    fal_key: str = ""
    fal_video_model: str = "fal-ai/ltx-video"
    replicate_api_token: str = ""

    # Storage / cache — Cloudflare R2
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "cutroom-assets"
    r2_public_url: str = ""

    # Optional
    huggingface_api_key: str = ""

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def groq_ready(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def image_ready(self) -> bool:
        return bool(self.cloudflare_account_id and self.cloudflare_api_token)

    @property
    def video_ready(self) -> bool:
        return bool(self.fal_key or self.replicate_api_token)

    @property
    def r2_ready(self) -> bool:
        return bool(
            self.r2_account_id
            and self.r2_access_key_id
            and self.r2_secret_access_key
            and self.r2_bucket
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
