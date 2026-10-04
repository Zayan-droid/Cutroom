"""Content-addressed asset cache on Cloudflare R2 (S3-compatible).

Every generated asset is keyed by a hash of its inputs, so repeat requests (and
judges clicking around the live demo) are served from cache for free instead of
re-billing the GPU provider.

The bucket stays PRIVATE: assets are served back to the browser through the
backend's own `/asset/{key}` route (see main.py), so no public bucket, r2.dev
subdomain, or custom domain is required. If R2 is not configured at all, callers
fall back to returning a data: URL inline.
"""
import hashlib
from typing import Optional, Tuple

import boto3
from botocore.config import Config

from .config import get_settings


def cache_key(prefix: str, payload: str, ext: str) -> str:
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    return f"{prefix}/{digest}.{ext}"


class AssetStore:
    def __init__(self) -> None:
        s = get_settings()
        self.enabled = s.r2_ready
        self._bucket = s.r2_bucket
        self._client = None
        if self.enabled:
            self._client = boto3.client(
                "s3",
                endpoint_url=f"https://{s.r2_account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=s.r2_access_key_id,
                aws_secret_access_key=s.r2_secret_access_key,
                config=Config(signature_version="s3v4"),
                region_name="auto",
            )

    def exists(self, key: str) -> bool:
        if not self.enabled or self._client is None:
            return False
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return False

    def put(self, key: str, data: bytes, content_type: str) -> bool:
        """Upload an asset. Returns False (never raises) so a cache problem
        degrades to an inline data URL instead of failing generation."""
        if not self.enabled or self._client is None:
            return False
        try:
            self._client.put_object(
                Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
            )
            return True
        except Exception as exc:  # noqa: BLE001 - cache must never break generation
            print(f"[cache] R2 put failed ({key}): {exc} - serving inline instead")
            return False

    def get(self, key: str) -> Optional[Tuple[bytes, str]]:
        """Fetch an asset's bytes + content type, or None if unavailable."""
        if not self.enabled or self._client is None:
            return None
        try:
            obj = self._client.get_object(Bucket=self._bucket, Key=key)
            return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")
        except Exception:
            return None
