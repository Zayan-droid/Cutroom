"""Request/response shapes for the Cutroom backend."""
from typing import List, Optional

from pydantic import BaseModel


class ImageRequest(BaseModel):
    prompt: str
    width: int = 768
    height: int = 432
    seed: Optional[int] = None
    model: Optional[str] = None  # overrides IMAGE_MODEL (e.g. a FLUX model id)


class ImageResponse(BaseModel):
    url: str  # R2 public URL when caching is on, otherwise a data: URL


class VideoRequest(BaseModel):
    prompt: str
    image_url: Optional[str] = None  # image->video when provided
    seconds: Optional[int] = None


class VideoJob(BaseModel):
    id: str
    status: str  # 'generating' | 'ready' | 'failed'
    progress: float = 0.0
    url: Optional[str] = None
    error: Optional[str] = None


class ScriptLine(BaseModel):
    scene: Optional[int] = None
    speaker: Optional[str] = None
    text: str


class ScriptRequest(BaseModel):
    prompt: str
    lang: str
    scenes: int = 6


class ScriptResponse(BaseModel):
    title: Optional[str] = None
    lines: List[ScriptLine] = []
