// Temporary Part-B dependency until Part A provides mockEngine.ts.
// Implements the frozen engine seam; contains no state-store or UI imports.
import type { EngineUpdate, GenerationEngine } from '../engine/contract.ts';
import type { Intent, Nudge, Take, TakeKind } from '../types.ts';

let sequence = 0;
const quote: GenerationEngine['quote'] = (kind, intent) => kind === 'draft' ? 0 : { social: 4, ad: 6, cinematic: 8 }[intent.kind];

function enqueue(prompt: string, intent: Intent, parentId: string | null, kind: TakeKind, label: string, update: EngineUpdate, free = false): Take {
  const take: Take = {
    id: `take-${Date.now().toString(36)}-${++sequence}`, prompt, intent: { ...intent },
    parentId, kind, label, status: 'queued', createdAt: Date.now(), cost: free ? 0 : quote(kind, intent), progress: 0,
  };
  setTimeout(() => update({ ...take, status: 'generating', progress: 0.1 }), 50);
  setTimeout(() => update({ ...take, status: 'generating', progress: 0.6 }), kind === 'draft' ? 400 : 1500);
  setTimeout(() => update({ ...take, status: 'ready', progress: 1, assetUrl: `placeholder://${take.id}` }), kind === 'draft' ? 900 : 3000);
  return take;
}

const batch = (prompt: string, intent: Intent, parentId: string | null, label: string, update: EngineUpdate) =>
  Array.from({ length: 4 }, (_, index) => enqueue(prompt, intent, parentId, 'draft', `${label} ${index + 1}`, update));

function adjust(intent: Intent, nudge: Nudge): Intent {
  switch (nudge) {
    case 'too-fast': return { ...intent, motion: 'slower, longer takes' };
    case 'too-slow': return { ...intent, motion: 'faster, snappier cuts' };
    case 'wrong-character': return { ...intent, subject: `${intent.subject} (recast)` };
    case 'more-cinematic': return { ...intent, style: 'anamorphic, filmic grade' };
    case 'less-busy': return { ...intent, style: 'minimal, clean composition' };
  }
}

export const fallbackEngine: GenerationEngine = {
  quote,
  generateDraft: ({ prompt, intent, parentId }, update) => batch(prompt, intent, parentId, 'Draft', update),
  renderFinal: ({ source }, update) => enqueue(source.prompt, source.intent, source.id, 'render', 'Render', update),
  remix: ({ source }, update) => batch(source.prompt, source.intent, source.id, 'Variant', update),
  retry: ({ failed }, update) => enqueue(failed.prompt, failed.intent, failed.id, failed.kind, 'Reroll', update, true),
  nudge: ({ source, nudge }, update) => enqueue(source.prompt, adjust(source.intent, nudge), source.id, 'draft', 'Nudge', update, true),
};
