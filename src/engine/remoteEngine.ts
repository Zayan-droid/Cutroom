// RemoteEngine — implements the frozen GenerationEngine seam by calling the
// Cutroom backend. Drafts/variants become fast text-to-image jobs; a render
// becomes a text-to-video job that is polled to completion. Identity, cost, and
// credit accounting still belong to the store, exactly as with the mock engine.
//
// On any backend error a take settles to 'failed' with a human message, so the
// existing recovery surface (free reroll + nudges) handles outages gracefully.

import type { Intent, Nudge, Take, TakeKind } from '../types.ts';
import type { EngineUpdate, GenerationEngine } from './contract.ts';
import { quote } from './cost.ts';
import { getVideo, postImage, postVideo } from '../lib/apiClient.ts';

let fallbackId = 0;
const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `take-${Date.now().toString(36)}-${++fallbackId}`;
const copy = (take: Take): Take => ({ ...take, intent: { ...take.intent } });
const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

function adjust(intent: Intent, nudge: Nudge): Intent {
  const add = (value: string, direction: string) =>
    value.trim() ? `${value}; ${direction}` : direction;
  switch (nudge) {
    case 'too-fast':
      return { ...intent, motion: add(intent.motion, 'slower movement, longer holds') };
    case 'too-slow':
      return { ...intent, motion: add(intent.motion, 'faster movement, snappier pacing') };
    case 'wrong-character':
      return { ...intent, subject: add(intent.subject, 'alternate casting, keep the described role') };
    case 'more-cinematic':
      return { ...intent, style: add(intent.style, 'cinematic lighting and filmic framing') };
    case 'less-busy':
      return { ...intent, style: add(intent.style, 'simpler composition with fewer background elements') };
    default:
      throw new Error('Choose a supported adjustment.');
  }
}

function sizeFor(kind: Intent['kind']): { width: number; height: number } {
  if (kind === 'social') return { width: 432, height: 768 }; // 9:16
  if (kind === 'ad') return { width: 640, height: 640 }; // 1:1
  return { width: 768, height: 432 }; // 16:9 cinematic
}

function promptFor(intent: Intent, kind: TakeKind): string {
  const bits = [intent.subject, intent.style, intent.motion, intent.mood]
    .map((s) => s?.trim())
    .filter(Boolean);
  const hint = kind === 'render' ? 'cinematic film frame, highly detailed' : 'concept preview frame';
  return [bits.join(', '), hint].filter(Boolean).join(', ');
}

function queuedTake(input: {
  prompt: string;
  intent: Intent;
  parentId: string | null;
  kind: TakeKind;
  label: string;
  free?: boolean;
}): Take {
  return {
    id: uid(),
    parentId: input.parentId,
    kind: input.kind,
    status: 'queued',
    prompt: input.prompt,
    intent: { ...input.intent },
    cost: input.free ? 0 : quote(input.kind, input.intent),
    label: input.label,
    progress: 0,
    createdAt: Date.now(),
  };
}

const failMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

async function runImage(take: Take, onUpdate: EngineUpdate, seed: number): Promise<void> {
  onUpdate({ ...copy(take), status: 'generating', progress: 0.3 });
  try {
    const { width, height } = sizeFor(take.intent.kind);
    const { url } = await postImage({ prompt: promptFor(take.intent, take.kind), width, height, seed });
    onUpdate({ ...copy(take), status: 'ready', progress: 1, assetUrl: url });
  } catch (error) {
    onUpdate({
      ...copy(take),
      status: 'failed',
      progress: 1,
      error: failMessage(error, 'Generation failed. Try a free reroll.'),
    });
  }
}

async function runVideo(take: Take, onUpdate: EngineUpdate): Promise<void> {
  onUpdate({ ...copy(take), status: 'generating', progress: 0.1 });
  try {
    const job = await postVideo({ prompt: promptFor(take.intent, 'render') });
    let progress = 0.15;
    for (let attempt = 0; attempt < 90; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const status = await getVideo(job.id);
      if (status.status === 'ready' && status.url) {
        onUpdate({ ...copy(take), status: 'ready', progress: 1, assetUrl: status.url });
        return;
      }
      if (status.status === 'failed') {
        onUpdate({
          ...copy(take),
          status: 'failed',
          progress: 1,
          error: status.error ?? 'Render failed. Try again.',
        });
        return;
      }
      progress = Math.min(0.95, progress + 0.04);
      onUpdate({ ...copy(take), status: 'generating', progress });
    }
    onUpdate({ ...copy(take), status: 'failed', progress: 1, error: 'Render timed out.' });
  } catch (error) {
    onUpdate({
      ...copy(take),
      status: 'failed',
      progress: 1,
      error: failMessage(error, 'Render failed. Try again.'),
    });
  }
}

function batch(
  prompt: string,
  intent: Intent,
  parentId: string | null,
  label: string,
  onUpdate: EngineUpdate,
): Take[] {
  const takes = Array.from({ length: 4 }, (_, index) =>
    queuedTake({ prompt, intent, parentId, kind: 'draft', label: `${label} ${index + 1}` }),
  );
  takes.forEach((take) => void runImage(take, onUpdate, randomSeed()));
  return takes;
}

export const remoteEngine: GenerationEngine = {
  quote,
  generateDraft: ({ prompt, intent, parentId }, onUpdate) =>
    batch(prompt, intent, parentId, 'Draft', onUpdate),
  renderFinal({ source }, onUpdate) {
    if (source.status !== 'ready' || source.kind !== 'draft') {
      throw new Error('Choose a ready draft to render.');
    }
    const take = queuedTake({
      prompt: source.prompt,
      intent: source.intent,
      parentId: source.id,
      kind: 'render',
      label: 'Render',
    });
    void runVideo(take, onUpdate);
    return take;
  },
  remix({ source }, onUpdate) {
    if (source.status !== 'ready') throw new Error('Choose a ready take to remix.');
    return batch(source.prompt, source.intent, source.id, 'Variant', onUpdate);
  },
  retry({ failed }, onUpdate) {
    if (failed.status !== 'failed') throw new Error('Choose a failed take to reroll.');
    const take = queuedTake({
      prompt: failed.prompt,
      intent: failed.intent,
      parentId: failed.id,
      kind: failed.kind,
      label: 'Reroll',
      free: true,
    });
    if (take.kind === 'render') void runVideo(take, onUpdate);
    else void runImage(take, onUpdate, randomSeed());
    return take;
  },
  nudge({ source, nudge }, onUpdate) {
    if (source.status !== 'ready' && source.status !== 'failed') {
      throw new Error('Choose a finished take to adjust.');
    }
    const take = queuedTake({
      prompt: source.prompt,
      intent: adjust(source.intent, nudge),
      parentId: source.id,
      kind: 'draft',
      label: 'Nudge',
      free: true,
    });
    void runImage(take, onUpdate, randomSeed());
    return take;
  },
};
