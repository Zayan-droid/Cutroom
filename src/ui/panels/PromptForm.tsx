import { useState } from 'react';
import { Sparkles, SlidersHorizontal, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import { actions } from '@/store';
import type { IntentKind, Intent } from '@/types';
import { Button, CostChip, Kbd } from '@/ui/components/ui';
import { IntentSelector } from './IntentSelector';
import { PromptAssist, type AssistFields } from './PromptAssist';

const EMPTY: AssistFields = { subject: '', style: '', motion: '', mood: '' };

const SURPRISES: Array<{ prompt: string; kind: IntentKind } & AssistFields> = [
  { prompt: 'A lone astronaut drifting past a neon ringed planet', kind: 'cinematic', subject: 'A lone astronaut', style: 'anamorphic, 35mm film grain', motion: 'slow dolly-in', mood: 'awe, quiet tension' },
  { prompt: 'Sleek smartwatch rotating on a marble pedestal', kind: 'ad', subject: 'A smartwatch', style: 'studio softbox, glossy', motion: 'orbit, 360°', mood: 'premium, clean' },
  { prompt: 'Skater landing a kickflip in golden-hour haze', kind: 'social', subject: 'A street skater', style: 'handheld, warm grade', motion: 'whip-pan, fast cut', mood: 'kinetic, joyful' },
  { prompt: 'Rain-slicked Tokyo alley glowing with signage', kind: 'cinematic', subject: 'A neon alley', style: 'blade-runner, deep teal', motion: 'steady tracking', mood: 'moody, cinematic' },
];

const QUICK: Array<{ label: string; prompt: string; kind: IntentKind }> = [
  { label: 'Neon city night', prompt: 'A neon city at night, rain-slicked streets reflecting signs', kind: 'cinematic' },
  { label: 'Product spin', prompt: 'Sleek wireless earbuds spinning on a pedestal', kind: 'ad' },
  { label: 'Golden-hour skate', prompt: 'Skater landing a trick in golden hour', kind: 'social' },
];

function buildIntent(kind: IntentKind, prompt: string, f: AssistFields): Intent {
  return {
    kind,
    subject: f.subject.trim() || prompt.trim(),
    style: f.style.trim(),
    motion: f.motion.trim(),
    mood: f.mood.trim(),
  };
}

function compose(prompt: string, f: AssistFields): string {
  if (prompt.trim()) return prompt.trim();
  return [f.subject, f.style, f.motion, f.mood].map((s) => s.trim()).filter(Boolean).join(', ');
}

export function PromptForm({
  variant,
  onSubmitted,
}: {
  variant: 'hero' | 'bar';
  onSubmitted?: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<IntentKind>('cinematic');
  const [assistOpen, setAssistOpen] = useState(false);
  const [fields, setFields] = useState<AssistFields>(EMPTY);

  const effective = compose(prompt, fields);
  const canSubmit = effective.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    actions.submitDraft(effective, buildIntent(kind, prompt, fields));
    onSubmitted?.();
  };

  const surprise = () => {
    const s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    setPrompt(s.prompt);
    setKind(s.kind);
    setFields({ subject: s.subject, style: s.style, motion: s.motion, mood: s.mood });
    setAssistOpen(true);
  };

  const setField = (key: keyof AssistFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  // ── Compact bar (working mode) ──────────────────────────────────────────────
  if (variant === 'bar') {
    return (
      <div className="rounded-2xl border border-border bg-surface/70 p-2 shadow-card backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe the next take…"
            aria-label="Prompt"
            className="h-11 min-w-[180px] flex-1 rounded-xl border border-transparent bg-black/20 px-3.5 text-sm text-fg placeholder:text-fg-subtle/70 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <IntentSelector value={kind} onChange={setKind} size="sm" />
          <Button variant="ghost" size="icon" onClick={surprise} title="Surprise me" aria-label="Surprise me">
            <Sparkles className="h-4 w-4" />
          </Button>
          <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit} leftIcon={<ArrowUp className="h-4 w-4" />}>
            Draft
            <CostChip cost={0} className="ml-0.5" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Hero (land / empty state) ───────────────────────────────────────────────
  return (
    <div className="w-full rounded-3xl border border-border bg-surface/60 p-4 shadow-card backdrop-blur-md sm:p-5">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={3}
        autoFocus
        placeholder="Describe what you want to see. A neon city at night, slow dolly-in, cinematic…"
        aria-label="Prompt"
        className="w-full resize-none rounded-2xl border border-transparent bg-black/20 p-4 text-[15px] leading-relaxed text-fg placeholder:text-fg-subtle/70 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
      />

      <PromptAssist open={assistOpen} fields={fields} set={setField} onSurprise={surprise} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <IntentSelector value={kind} onChange={setKind} />
        <button
          type="button"
          onClick={() => setAssistOpen((v) => !v)}
          className={cn(
            'inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
            assistOpen ? 'bg-white/[0.06] text-fg' : 'text-fg-muted hover:text-fg hover:bg-white/[0.04]',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Prompt assist
        </button>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-fg-subtle sm:flex sm:items-center sm:gap-1.5">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            to draft
          </span>
          <Button variant="primary" size="lg" onClick={submit} disabled={!canSubmit} leftIcon={<Sparkles className="h-4 w-4" />}>
            Draft 4 takes
            <CostChip cost={0} className="ml-1" />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <span className="text-xs text-fg-subtle">Try:</span>
        {QUICK.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => {
              setPrompt(q.prompt);
              setKind(q.kind);
            }}
            className="cursor-pointer rounded-full border border-border bg-white/[0.03] px-3 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}
