"""Text/image-to-video via fal.ai's async queue API.

submit_video() enqueues a job and returns its request id + poll URLs; poll_video()
reports progress and, on completion, the finished clip URL. This is the one layer
that actually costs money once trial credits run out.
"""
from typing import Optional

import httpx

from ..config import get_settings


async def submit_video(
    client: httpx.AsyncClient, prompt: str, image_url: Optional[str] = None
) -> dict:
    s = get_settings()
    payload: dict = {"prompt": prompt}
    if image_url:
        payload["image_url"] = image_url
    res = await client.post(
        f"https://queue.fal.run/{s.fal_video_model}",
        headers={"Authorization": f"Key {s.fal_key}"},
        json=payload,
        timeout=60,
    )
    res.raise_for_status()
    return res.json()  # { request_id, status_url, response_url }


async def poll_video(
    client: httpx.AsyncClient, status_url: str, response_url: str
) -> dict:
    s = get_settings()
    headers = {"Authorization": f"Key {s.fal_key}"}
    res = await client.get(status_url, headers=headers, timeout=60)
    res.raise_for_status()
    status = res.json().get("status")

    if status == "COMPLETED":
        out = await client.get(response_url, headers=headers, timeout=60)
        out.raise_for_status()
        body = out.json()
        video_url = (body.get("video") or {}).get("url") or body.get("url")
        if not video_url:
            return {"status": "failed", "progress": 1.0, "error": "No video URL returned."}
        return {"status": "ready", "progress": 1.0, "url": video_url}

    if status in ("IN_QUEUE", "IN_PROGRESS"):
        return {"status": "generating", "progress": 0.5}

    return {"status": "failed", "progress": 1.0, "error": f"Video job status: {status}"}
