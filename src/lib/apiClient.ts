// Thin client for the Cutroom backend (real generation engine).
// Reads config from Vite env the same way the mock engine does, so no extra
// ambient types are required.

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export const apiBase = (env.VITE_API_BASE ?? '').trim().replace(/\/+$/, '');

/** True only when the backend is both requested AND reachable (a base URL is set). */
export const remoteEnabled =
  (env.VITE_USE_REMOTE_ENGINE ?? 'false').trim() === 'true' && apiBase.length > 0;

async function request<T>(path: string, init?: RequestInit, timeoutMs = 120_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      let detail: unknown = `Request failed (${res.status})`;
      try {
        detail = (await res.json())?.detail ?? detail;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface ImageResult {
  url: string;
}
export function postImage(body: {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
}): Promise<ImageResult> {
  return request<ImageResult>('/image', { method: 'POST', body: JSON.stringify(body) });
}

export interface VideoJob {
  id: string;
  status: 'generating' | 'ready' | 'failed';
  progress: number;
  url?: string;
  error?: string;
}
export function postVideo(body: { prompt: string; image_url?: string }): Promise<VideoJob> {
  return request<VideoJob>('/video', { method: 'POST', body: JSON.stringify(body) });
}
export function getVideo(id: string): Promise<VideoJob> {
  return request<VideoJob>(`/video/${id}`, { method: 'GET' }, 60_000);
}

export interface ScriptLine {
  scene?: number;
  speaker?: string;
  text: string;
}
export interface ScriptResult {
  title?: string;
  lines: ScriptLine[];
}
export function postScript(body: {
  prompt: string;
  lang: string;
  scenes?: number;
}): Promise<ScriptResult> {
  return request<ScriptResult>('/story/script', { method: 'POST', body: JSON.stringify(body) }, 60_000);
}
