import { useId, useState } from 'react';
import type { StoryInput } from '../../story/contract';
import type { StoryStatus, StoryTimeline } from '../../story/types';
import { cn } from '../../lib/cn';
import { Button, ButtonCost } from '../components/ui';
import { Glyph } from '../components/Glyph';
import { STORY_FIXTURES } from './fixtures';
import { LanguagePicker } from './LanguagePicker';
import { StoryPlayer } from './StoryPlayer';
import { SceneThumb, useSceneThumbnails } from './SceneThumb';

/** Half 1's store supplies this view model. The UI never calls an engine. */
export interface StoryBinding {
  timeline: StoryTimeline | null;
  status: StoryStatus | null;
  languages: readonly string[];
  error?: string;
  credits?: number;
  quote: (input: StoryInput) => number;
  composeStory: (input: StoryInput) => void;
}

const fieldClass =
  'w-full rounded border border-edge bg-field text-ink placeholder:text-ink-3/80 focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink disabled:opacity-60';

export function StoryMode({ binding }: { binding?: StoryBinding }) {
  const [lang, setLang] = useState(binding?.languages[0] ?? 'en-US');
  const [prompt, setPrompt] = useState(binding?.timeline?.prompt ?? '');
  const [preview, setPreview] = useState(STORY_FIXTURES['en-US']);
  const [error, setError] = useState('');
  const ideaId = useId();
  const languages = binding?.languages ?? Object.keys(STORY_FIXTURES);
  const selectedLang = languages.includes(lang) ? lang : languages[0] ?? '';
  const timeline = binding ? binding.timeline : preview;
  const busy = binding?.status === 'queued' || binding?.status === 'composing';
  const failed = binding?.status === 'failed';
  const input = { prompt: prompt.trim(), lang: selectedLang, targetMs: 180_000 };
  let cost: number | null = 0;
  try { cost = binding?.quote(input) ?? 0; if (!Number.isFinite(cost) || cost < 0) cost = null; }
  catch { cost = null; }
  const affordable = cost !== null && (binding?.credits === undefined || cost <= binding.credits);

  const submit = () => {
    setError('');
    if (!binding) { setPreview(STORY_FIXTURES[selectedLang]); return; }
    try { binding.composeStory(input); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not compose this story. Please try again.'); }
  };

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
      <header className="max-w-3xl">
        <h1 className="stretch-wide text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">Story studio</h1>
        <p className="mt-2 text-lg leading-relaxed text-ink-2">
          Write a story idea and pick a language. Cutroom composes a three-minute illustrated story with a
          narrated, lip-synced character and subtitles you can download.
        </p>
      </header>

      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-10">
        <form
          className="flex flex-col gap-5 rounded-md border border-rule bg-sheet p-5 sm:p-6"
          onSubmit={(event) => { event.preventDefault(); submit(); }}
        >
          {!binding && (
            <p className="border-l-[3px] border-ink pl-3 text-sm leading-snug text-ink-2">
              <span className="font-semibold text-ink">Preview mode.</span> Play a prewritten story in two
              languages. Writing your own needs the story engine.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor={ideaId} className="text-sm font-semibold text-ink">
              {binding ? 'Story idea' : 'Preview story'}
            </label>
            <textarea
              id={ideaId}
              rows={5}
              maxLength={2000}
              readOnly={!binding}
              disabled={busy}
              required={!!binding}
              value={binding ? prompt : STORY_FIXTURES[selectedLang]?.prompt ?? ''}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="A character, a place, and what they want. For example: a lighthouse keeper helps a lost star find its way home."
              className={cn(fieldClass, 'resize-y p-3 font-text text-[18px] leading-relaxed')}
            />
            {binding && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setPrompt(STORY_FIXTURES['en-US'].prompt)}
                className="w-max text-sm font-medium text-ink underline decoration-edge underline-offset-[3px] transition-colors hover:decoration-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use the example idea
              </button>
            )}
          </div>

          <LanguagePicker languages={languages} lang={selectedLang} onChange={setLang} disabled={busy} />

          <div className="flex flex-col gap-2 border-t border-rule pt-5">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={busy || !selectedLang || !affordable || (!!binding && !prompt.trim())}
            >
              {busy ? 'Composing…' : !binding ? 'Load preview' : failed ? 'Try again' : 'Compose story'}
              {cost !== null && binding && <ButtonCost cost={cost} />}
            </Button>
            {cost === null && <p role="status" className="text-sm text-bad">A price is unavailable right now. Please try again.</p>}
            {cost !== null && !affordable && (
              <p role="status" className="text-sm text-bad">This story needs {cost} credits; {binding?.credits} are available.</p>
            )}
            {(error || binding?.error || failed) && (
              <p role="alert" className="text-sm text-bad">
                {error || binding?.error || 'This story could not be composed. Your idea is still here; try again.'}
              </p>
            )}
            {binding && cost !== null && affordable && !failed && (
              <p className="text-sm text-ink-2">Charged only when the story is ready.</p>
            )}
          </div>

          <p className="text-[13px] leading-snug text-ink-3">
            Narration uses the voices installed in your browser, so availability differs by device. Subtitles always work.
          </p>
        </form>

        <section aria-label="Story player" className="min-w-0">
          {busy && binding ? (
            <Composing timeline={binding.timeline} status={binding.status} />
          ) : timeline && (!binding || binding.status === 'ready') ? (
            <StoryPlayer key={timeline.id} timeline={timeline} />
          ) : (
            <div className="grid aspect-video place-items-center rounded-md border border-dashed border-edge bg-sheet p-8 text-center">
              <div className="max-w-sm">
                <p className="text-lg font-semibold text-ink">No story yet</p>
                <p className="mt-1 text-[15px] text-ink-2">
                  Compose a story and it plays here, scene by scene, with narration and subtitles.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const STEPS = ['Outline', 'Scenes and dialogue', 'Ready to play'] as const;

/** Composition progress from the engine: the planned scenes plus a real percentage. */
function Composing({ timeline, status }: { timeline: StoryTimeline | null; status: StoryStatus | null }) {
  const progress = timeline?.progress ?? 0;
  const pct = Math.round(progress * 100);
  const step = status === 'queued' ? 0 : 1;
  const scenes = timeline?.scenes ?? [];
  const thumbs = useSceneThumbnails(timeline);
  return (
    <div role="status" aria-live="polite" className="rounded-md border border-rule bg-sheet p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight">
          {status === 'queued' ? 'Planning your story' : 'Writing scenes and dialogue'}
        </h2>
        <span className="tnum text-lg font-semibold">{pct}%</span>
      </div>

      <div
        role="progressbar"
        aria-label="Story composition"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-4 h-1.5 bg-ink/10"
      >
        <div
          className="h-full origin-left bg-ink transition-transform duration-200 ease-out"
          style={{ transform: `scaleX(${Math.max(0.02, progress)})` }}
        />
      </div>

      <ol className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        {STEPS.map((label, i) => (
          <li key={label} className={cn('inline-flex items-center gap-2', i < step ? 'text-ink' : i === step ? 'font-semibold text-ink' : 'text-ink-3')}>
            {i < step ? <Glyph name="check" className="text-ok" /> : <span aria-hidden className="tnum w-4 text-center text-sm">{i + 1}</span>}
            {label}
            {i < step && <span className="sr-only">(done)</span>}
          </li>
        ))}
      </ol>

      {scenes.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-ink">{scenes.length} scenes planned</p>
          <ol className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {scenes.map((scene, index) => (
              <li key={scene.id} className="flex flex-col gap-1.5">
                <SceneThumb src={thumbs[index]} seed={scene.posterSeed} className="border border-rule" />
                <span className="text-[13px] text-ink-2">Scene {index + 1}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
