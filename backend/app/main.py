"""Cutroom backend — the real generation engine behind the frozen seam.

Endpoints:
  GET  /health            provider readiness
  POST /image             text-to-image (Cloudflare Workers AI), cached to R2
  POST /video             text/image-to-video (fal.ai) -> returns a job id
  GET  /video/{id}        poll a video job
  POST /story/script      per-scene dialogue (Groq)
  POST /tts               stubbed (narration uses the browser Web Speech API)

Every model route degrades to a clear 503 when its provider key is absent, so the
frontend's RemoteEngine can fall back to the mock engine instead of hard-failing.
"""
import base64
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from . import schemas
from .cache import AssetStore, cache_key
from .config import get_settings
from .providers import image_cf, text_groq, video_fal


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient()
    app.state.store = AssetStore()
    app.state.jobs = {}  # video job id -> { status_url, response_url }
    yield
    await app.state.http.aclose()


settings = get_settings()
app = FastAPI(title="Cutroom backend", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _data_url(data: bytes, content_type: str = "image/png") -> str:
    return f"data:{content_type};base64,{base64.b64encode(data).decode()}"


def _asset_url(key: str) -> str:
    """Browser-fetchable URL for a cached asset.

    Prefers a real public base (custom domain / r2.dev) if configured; otherwise
    serves the private object through this backend's /asset proxy.
    """
    s = get_settings()
    pub = s.r2_public_url.rstrip("/")
    if pub and "r2.cloudflarestorage.com" not in pub:
        return f"{pub}/{key}"
    return f"{s.public_base_url.rstrip('/')}/asset/{key}"


@app.get("/health")
def health() -> dict:
    s = get_settings()
    return {
        "ok": True,
        "providers": {
            "text": s.groq_ready,
            "image": s.image_ready,
            "video": s.video_ready,
            "cache": s.r2_ready,
        },
    }


@app.post("/image", response_model=schemas.ImageResponse)
async def post_image(req: schemas.ImageRequest) -> dict:
    s = get_settings()
    if not s.image_ready:
        raise HTTPException(
            503, "Image provider not configured (CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN)."
        )
    model = req.model or s.image_model
    store: AssetStore = app.state.store
    key = cache_key("img", f"{model}|{req.prompt}|{req.width}x{req.height}|{req.seed}", "png")

    if store.exists(key):
        return {"url": _asset_url(key)}

    try:
        data = await image_cf.generate_image(
            app.state.http, req.prompt, req.width, req.height, req.seed, model
        )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Image generation failed: {exc}") from exc

    return {"url": _asset_url(key) if store.put(key, data, "image/png") else _data_url(data)}


@app.get("/asset/{key:path}")
def get_asset(key: str) -> Response:
    """Serve a cached asset from the private R2 bucket (CORS-enabled for canvas)."""
    got: AssetStore = app.state.store
    result = got.get(key)
    if result is None:
        raise HTTPException(404, "Asset not found.")
    data, content_type = result
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@app.post("/video", response_model=schemas.VideoJob)
async def post_video(req: schemas.VideoRequest) -> dict:
    s = get_settings()
    if not s.fal_key:
        raise HTTPException(503, "Video provider not configured (FAL_KEY).")
    try:
        job = await video_fal.submit_video(app.state.http, req.prompt, req.image_url)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Video submit failed: {exc}") from exc

    job_id = job.get("request_id") or job.get("requestId")
    if not job_id:
        raise HTTPException(502, "Video provider returned no job id.")
    app.state.jobs[job_id] = {
        "status_url": job.get("status_url"),
        "response_url": job.get("response_url"),
    }
    return {"id": job_id, "status": "generating", "progress": 0.1}


@app.get("/video/{job_id}", response_model=schemas.VideoJob)
async def get_video(job_id: str) -> dict:
    meta = app.state.jobs.get(job_id)
    if not meta:
        raise HTTPException(404, "Unknown video job.")
    try:
        result = await video_fal.poll_video(
            app.state.http, meta["status_url"], meta["response_url"]
        )
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"Video poll failed: {exc}") from exc
    return {"id": job_id, **result}


@app.post("/story/script", response_model=schemas.ScriptResponse)
async def post_script(req: schemas.ScriptRequest) -> dict:
    s = get_settings()
    if not s.groq_ready:
        raise HTTPException(503, "Text provider not configured (GROQ_API_KEY).")
    try:
        data = await text_groq.generate_script(
            app.state.http, req.prompt, req.lang, req.scenes
        )
    except Exception as exc:  # network, JSON, or upstream error
        raise HTTPException(502, f"Script generation failed: {exc}") from exc
    return {"title": data.get("title"), "lines": data.get("lines", [])}


@app.post("/tts")
def post_tts() -> dict:
    raise HTTPException(
        501,
        "Server TTS is not enabled. Narration uses the browser Web Speech API; "
        "self-host Kokoro or Piper to enable this endpoint.",
    )
