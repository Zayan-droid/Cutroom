import { useEffect, useId, useRef, useState } from 'react';
import { actions } from '@/store';
import type { IntentKind, Intent } from '@/types';
import { Button, ButtonCost, Kbd } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { IntentSelector } from './IntentSelector';
import { PromptAssist, type AssistFields } from './PromptAssist';
import { cn } from '@/lib/cn';
import { quote } from '@/lib/cost';

const EMPTY: AssistFields = { subject: '', style: '', motion: '', mood: '' };

/** Worked examples: each fills the prompt, the format, and the details. */
export const EXAMPLES: Array<{ title: string; prompt: string; kind: IntentKind } & AssistFields> = [
  { title: 'Astronaut drifting past a planet', prompt: 'A lone astronaut drifting past a ringed planet', kind: 'cinematic', subject: 'A lone astronaut', style: 'Anamorphic, 35mm, cold light', motion: 'Slow dolly-in', mood: 'Awe, quiet tension' },
  { title: 'Watch on a marble pedestal', prompt: 'A smartwatch rotating on a marble pedestal', kind: 'ad', subject: 'A smartwatch', style: 'Studio softbox, glossy reflections', motion: 'Slow 360° orbit', mood: 'Premium, clean' },
  { title: 'Golden-hour kickflip', prompt: 'A skater landing a kickflip in golden-hour haze', kind: 'social', subject: 'A street skater', style: 'Handheld, warm grade', motion: 'Whip-pan, fast cut', mood: 'Kinetic, joyful' },
];

export const SHOT_INPUT_ID = 'shot-input';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

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
  kind,
  initialKind = 'cinematic',
  onKindChange,
  onSubmitted,
}: {
  variant: 'hero' | 'bar';
  /** The format can be lifted to a parent that previews it. */
  kind?: IntentKind;
  /** Starting format when the form owns it — e.g. the format of the batch on screen. */
  initialKind?: IntentKind;
  onKindChange?: (k: IntentKind) => void;
  onSubmitted?: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [ownKind, setOwnKind] = useState<IntentKind>(initialKind);
  const [assistOpen, setAssistOpen] = useState(false);
  const [fields, setFields] = useState<AssistFields>(EMPTY);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const assistId = useId();
  const hintId = useId();
  const examplesId = useId();

  const format = kind ?? ownKind;
  const setFormat = (k: IntentKind) => (onKindChange ? onKindChange(k) : setOwnKind(k));

  const effective = compose(prompt, fields);
  const canSubmit = effective.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    actions.submitDraft(effective, buildIntent(format, prompt, fields));
    onSubmitted?.();
  };

  const applyExample = (e: (typeof EXAMPLES)[number]) => {
    setPrompt(e.prompt);
    setFormat(e.kind);
    setFields({ subject: e.subject, style: e.style, motion: e.motion, mood: e.mood });
    setAssistOpen(true);
    textRef.current?.focus();
  };

  const setField = (key: keyof AssistFields, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  // Only take focus on a desktop pointer; on phones autofocus would throw up the keyboard.
  useEffect(() => {
    if (variant === 'hero' && window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) {
      textRef.current?.focus();
    }
  }, [variant]);

  // ── Compact row (working view) ──────────────────────────────────────────────
  if (variant === 'bar') {
    return (
      <form
        className="flex flex-wrap items-end gap-x-3 gap-y-2 lg:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
          <label htmlFor={SHOT_INPUT_ID} className="whitespace-nowrap text-sm font-semibold text-ink">
            New prompt
          </label>
          <input
            id={SHOT_INPUT_ID}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the next shot"
            autoComplete="off"
            className="h-11 w-full rounded border border-edge bg-field px-3 font-text text-[17px] text-ink placeholder:text-ink-3/80 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink"
          />
        </div>
        <IntentSelector value={format} onChange={setFormat} size="compact" legend="Format" hideLegend />
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          Generate 4 drafts
          <ButtonCost cost={quote('draft', format)} />
        </Button>
      </form>
    );
  }

  // ── Full composer (opening screen) ──────────────────────────────────────────
  return (
    <form
      className="flex flex-col gap-5 sm:gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={SHOT_INPUT_ID} className="text-sm font-semibold text-ink">
          Describe the shot
        </label>
        <textarea
          id={SHOT_INPUT_ID}
          ref={textRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="For example: rain on a neon-lit street at night, a cyclist passes, the camera follows."
          aria-describedby={hintId}
          className="w-full resize-y rounded border border-edge bg-field p-3.5 font-text text-[19px] leading-relaxed text-ink placeholder:text-ink-3/80 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink sm:min-h-[9.5rem]"
        />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
          <span id={examplesId} className="text-ink-2">
            Or start from an example:
          </span>
          <ul aria-labelledby={examplesId} className="flex flex-wrap gap-x-4">
            {EXAMPLES.map((e) => (
              <li key={e.title}>
                <button
                  type="button"
                  onClick={() => applyExample(e)}
                  className="py-1.5 text-left font-medium text-ink underline decoration-edge underline-offset-[3px] transition-colors hover:decoration-ink"
                >
                  {e.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <IntentSelector value={format} onChange={setFormat} />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={assistOpen}
          aria-controls={assistId}
          onClick={() => setAssistOpen((v) => !v)}
          className="tap flex max-w-full items-start gap-2 self-start text-left text-sm font-semibold text-ink"
        >
          <span
            aria-hidden
            className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-sm border border-edge text-ink-2 transition-transform', assistOpen && 'rotate-45')}
          >
            <Glyph name="plus" className="h-3 w-3" />
          </span>
          <span className="flex flex-wrap gap-x-2">
            <span>{assistOpen ? 'Hide details' : 'Add details'}</span>
            <span className="font-normal text-ink-3">optional — subject, look, camera, mood</span>
          </span>
        </button>
        <PromptAssist id={assistId} open={assistOpen} fields={fields} set={setField} />
      </div>

      {/* On phones the action row sticks to the bottom of the screen while the form scrolls. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-5 max-sm:sticky max-sm:bottom-0 max-sm:z-20 max-sm:-mx-5 max-sm:-mb-5 max-sm:bg-sheet max-sm:px-5 max-sm:pb-3 max-sm:pt-3">
        <Button type="submit" variant="primary" size="lg" disabled={!canSubmit} aria-describedby={hintId}>
          Generate 4 drafts
          <ButtonCost cost={quote('draft', format)} />
        </Button>
        <p id={hintId} className="max-w-sm text-sm leading-snug text-ink-2">
          {canSubmit
            ? 'Four short drafts, side by side. Render only the one you pick.'
            : 'Describe the shot, or pick an example, to generate drafts.'}{' '}
          <span className="hidden whitespace-nowrap text-ink-3 lg:inline">
            <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd> <Kbd>Enter</Kbd>
          </span>
        </p>
      </div>
    </form>
  );
}
