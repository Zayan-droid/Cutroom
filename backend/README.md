# Cutroom backend

The real generation engine behind the frozen `GenerationEngine` / `StoryEngine`
seam. FastAPI orchestrator that calls hosted model providers (it does **not** run
GPUs itself — a free EC2/Oracle box only runs this API + CPU TTS).

## Run locally

```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then paste your keys into .env
uvicorn app.main:app --reload --port 8787
```

Check wiring: `GET http://localhost:8787/health` reports which providers are configured.

## Endpoints

| Method | Path | Provider | Notes |
|---|---|---|---|
| GET | `/health` | — | provider readiness |
| POST | `/image` | Cloudflare Workers AI | SDXL default; `model` overrides to FLUX. Cached to R2. |
| POST | `/video` | fal.ai | returns `{ id }`; poll below |
| GET | `/video/{id}` | fal.ai | `{ status, progress, url }` |
| POST | `/story/script` | Groq | per-scene dialogue in the chosen language |
| POST | `/tts` | — | 501 stub; narration uses browser Web Speech |

Each model route returns **503** when its key is missing, so the frontend falls
back to the bundled mock engine instead of breaking.

## Keys
All keys live in `backend/.env` (gitignored). See [`.env.example`](.env.example)
for every variable and where to get it.

## Deploy
Frontend → Vercel (`VITE_API_BASE` points here, `VITE_USE_REMOTE_ENGINE=true`).
Backend → any small CPU box (EC2 `t3.micro`, Oracle Always-Free, Fly.io, Render).
Set `ALLOWED_ORIGINS` to your Vercel URL. Cache aggressively (R2) before going public.
