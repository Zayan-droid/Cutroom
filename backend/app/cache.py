"""Content-addressed asset cache on Cloudflare R2 (S3-compatible).

Every generated asset is keyed by a hash of its inputs, so repeat requests (and
judges clicking around the live demo) are served from cache for free instead of
re-billing the GPU provider. If R2 is not configured the store is a no-op and
callers fall back to returning a data: URL.
"""
import hashlib
from typing import Optional

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
        self._public = s.r2_public_url.rstrip("/")
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

    def url_for(self, key: str) -> Optional[str]:
        """Public URL for a key, or None if no public base is configured."""
        if not self.enabled or not self._public:
            return None
        return f"{self._public}/{key}"

    def exists(self, key: str) -> bool:
        if not self.enabled or self._client is None:
            return False
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception:
            return False

    def put(self, key: str, data: bytes, content_type: str) -> Optional[str]:
        """Upload and return the public URL (None if not publicly served)."""
        if not self.enabled or self._client is None:
            return None
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )
        return self.url_for(key)
