import { useState } from 'react';
import { BookOpen, Check, WandSparkles } from 'lucide-react';
import type { StoryInput } from '../../story/contract';
import type { StoryStatus, StoryTimeline } from '../../story/types';
import { Button, CostChip } from '../components/ui';
import { STORY_FIXTURES } from './fixtures';
import { LanguagePicker } from './LanguagePicker';
import { StoryPlayer } from './StoryPlayer';

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

export function StoryMode({ binding }: { binding?: StoryBinding }) {
  const [lang, setLang] = useState(binding?.languages[0] ?? 'en-US');
  const [prompt, setPrompt] = useState(binding?.timeline?.prompt ?? '');
  const [preview, setPreview] = useState(STORY_FIXTURES['en-US']);
  const [error, setError] = useState('');
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

  return <main className="mx-auto max-w-[1400px] px-4 py-6 sm:py-8">
    <div className="mb-6 flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></span>
      <div><h1 className="text-xl font-semibold tracking-tight">Story studio</h1><p className="mt-1 text-sm text-fg-muted">A little world. Three minutes to get lost in it.</p></div>
    </div>
    <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <form className="space-y-5 rounded-2xl border border-border bg-surface p-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        {!binding && <div className="space-y-2"><span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-fg">Player preview</span>
          <p className="text-xs leading-relaxed text-fg-muted">Explore a prewritten story in two languages. Custom story composition is coming with the story engine.</p></div>}
        <label className="block space-y-2 text-xs text-fg-muted"><span>{binding ? 'Your story idea' : 'Preview story'}</span>
          <textarea rows={5} maxLength={2000} readOnly={!binding} disabled={busy} required={!!binding} value={binding ? prompt : STORY_FIXTURES[selectedLang]?.prompt ?? ''}
            onChange={(event) => setPrompt(event.target.value)} placeholder="A character, a place, a small adventure…"
            className="w-full resize-y rounded-xl border border-border-strong bg-bg/60 p-3 text-sm leading-relaxed text-fg placeholder:text-fg-muted" />
        </label>
        {binding && <button type="button" disabled={busy} onClick={() => setPrompt(STORY_FIXTURES['en-US'].prompt)} className="cursor-pointer text-xs text-primary transition-colors hover:text-fg disabled:cursor-not-allowed">Use an example idea</button>}
        <LanguagePicker languages={languages} lang={selectedLang} onChange={setLang} disabled={busy} />
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !selectedLang || !affordable || (!!binding && !prompt.trim())} leftIcon={<WandSparkles className="h-4 w-4" />}>
          {busy ? 'Composing…' : !binding ? 'Load preview' : failed ? 'Try again' : 'Compose story'}
          {cost !== null && <CostChip cost={cost} />}
        </Button>
        {cost === null && <p role="status" className="text-xs text-danger">A price is unavailable. Please try again.</p>}
        {cost !== null && !affordable && <p role="status" className="text-xs text-danger">This story needs {cost} credits; {binding?.credits} are available.</p>}
        {(error || binding?.error || failed) && <p role="alert" className="text-sm text-danger">{error || binding?.error || 'This story could not be composed. Your idea is still here; try again.'}</p>}
        <p className="text-xs leading-relaxed text-fg-muted">{binding ? 'Procedural stories with stylized scenes, spoken dialogue, and subtitles. ' : 'Scenes, spoken dialogue, and subtitles share one timeline. '}Voice availability depends on your device.</p>
      </form>
      {busy ? <div className="space-y-5 rounded-2xl border border-border bg-surface p-8" role="status" aria-live="polite">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 to-accent/20">
          <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        <h2 className="text-lg font-semibold">{binding.status === 'queued' ? 'Finding the shape of your story' : 'Giving each scene its voice'}</h2>
        <progress className="h-2 w-full accent-primary" value={timeline?.progress ?? 0} max={1} aria-label="Story composition progress" />
        <ol className="flex flex-wrap gap-4 text-sm text-fg-muted"><li className="flex items-center gap-2">{binding.status === 'composing' && <Check className="h-4 w-4 text-success" />}Outline</li><li>Scenes & dialogue</li><li>Ready to play</li></ol>
      </div> : timeline && (!binding || binding.status === 'ready') ? <StoryPlayer key={timeline.id} timeline={timeline} />
        : <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-border-strong bg-surface p-8 text-center text-fg-muted"><p>Your story will appear here, ready to play.</p></div>}
    </div>
  </main>;
}
