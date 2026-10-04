"""Story script generation via Groq (fast, free-tier LLM).

Returns a title plus per-scene dialogue lines in the requested language. JSON mode
keeps the output parseable.
"""
import json

import httpx

from ..config import get_settings


async def generate_script(
    client: httpx.AsyncClient, prompt: str, lang: str, scenes: int
) -> dict:
    s = get_settings()
    system = "You are a concise screenwriter. Respond with JSON only."
    user = (
        f'Write a short {scenes}-scene story in BCP-47 language "{lang}" based on: '
        f'"{prompt}". Return JSON of the form '
        '{"title": string, "lines": [{"scene": number, "speaker": string, "text": string}]} '
        f"with one or two short lines per scene. All text must be written in {lang}."
    )
    res = await client.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {s.groq_api_key}"},
        json={
            "model": s.groq_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.8,
            "response_format": {"type": "json_object"},
        },
        timeout=60,
    )
    res.raise_for_status()
    content = res.json()["choices"][0]["message"]["content"]
    return json.loads(content)
