"""Text-to-image via Cloudflare Workers AI (SDXL default, FLUX-schnell optional).

SDXL returns raw PNG bytes; FLUX returns JSON with a base64 image. Both are
normalized to PNG bytes here.
"""
import base64
from typing import Optional

import httpx

from ..config import get_settings


async def generate_image(
    client: httpx.AsyncClient,
    prompt: str,
    width: int,
    height: int,
    seed: Optional[int],
    model: str,
) -> bytes:
    s = get_settings()
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{s.cloudflare_account_id}/ai/run/{model}"
    )
    payload: dict = {"prompt": prompt}
    # FLUX-schnell ignores width/height; SDXL and Lightning accept them.
    if "flux" not in model.lower():
        payload["width"] = width
        payload["height"] = height
    if seed is not None:
        payload["seed"] = seed

    res = await client.post(
        url,
        headers={"Authorization": f"Bearer {s.cloudflare_api_token}"},
        json=payload,
        timeout=120,
    )
    res.raise_for_status()

    if "application/json" in res.headers.get("content-type", ""):
        data = res.json()
        image_b64 = (data.get("result") or {}).get("image") or data.get("image")
        if not image_b64:
            raise RuntimeError("Image provider returned no image data.")
        return base64.b64decode(image_b64)
    return res.content
