import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PromptForm } from './PromptForm';
import { TakeFrame } from '@/ui/components/TakeFrame';
import { fadeUp } from '@/lib/motion';
import { costLabel, quote } from '@/lib/cost';
import { ratioLabel } from '@/lib/media';
import { INTENT_LABELS, type IntentKind, type Take } from '@/types';

// Bundled demo clips — the same full-resolution renders the offline engine plays back.
const SAMPLES: Record<IntentKind, { url: string; scene: string }> = {
  social: { url: new URL('../../assets/social-1-render.mp4', import.meta.url).href, scene: 'Shoreline from above' },
  ad: { url: new URL('../../assets/ad-3-render.mp4', import.meta.url).href, scene: 'Watch on marble' },
  cinematic: { url: new URL('../../assets/cinematic-2-render.mp4', import.meta.url).href, scene: 'Coastline' },
};

/** Max preview height per format, so a vertical sample never towers over the form. */
const SAMPLE_WIDTH: Record<IntentKind, string> = {
  social: 'max-w-[236px]',
  ad: 'max-w-[336px]',
  cinematic: 'max-w-none',
};

function sampleTake(kind: IntentKind): Take {
  return {
    id: `sample-${kind}`,
    parentId: null,
    kind: 'render',
    status: 'ready',
    prompt: SAMPLES[kind].scene,
    intent: { kind, subject: '', style: '', motion: '', mood: '' },
    assetUrl: SAMPLES[kind].url,
    cost: 0,
    createdAt: 0,
  };
}

const STEPS: Array<{ term: string; text: (k: IntentKind) => string }> = [
  { term: 'Drafts', text: () => 'Four at a time, always free. Compare directions before spending anything.' },
  {
    term: 'Render',
    text: (k) =>
      `${costLabel(quote('render', k))} for ${INTENT_LABELS[k].toLowerCase()}. Charged only when the render finishes.`,
  },
  { term: 'Versions', text: () => 'Drafts, renders, remixes, and retries all stay in your history. Continue from any of them.' },
];

export function LandScreen() {
  const [kind, setKind] = useState<IntentKind>('cinematic');
  const sample = useMemo(() => sampleTake(kind), [kind]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:pt-12">
      <motion.header variants={fadeUp} initial="hidden" animate="show" className="max-w-3xl">
        <h1 className="stretch-wide text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">Start a video</h1>
        <p className="mt-2 text-lg leading-relaxed text-ink-2">
          <span className="sm:hidden">Four free drafts first. Pay only for the one you render.</span>
          <span className="hidden sm:inline">
            Describe a shot and Cutroom generates four drafts for free. Render the one you want — the only
            step that costs credits — and keep branching from any version.
          </span>
        </p>
      </motion.header>

      <div className="mt-6 grid grid-cols-1 items-start gap-8 sm:mt-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          aria-label="New shot"
          className="rounded-md border border-rule bg-sheet p-5 sm:p-7"
        >
          <PromptForm variant="hero" kind={kind} onKindChange={setKind} />
        </motion.section>

        <motion.aside variants={fadeUp} initial="hidden" animate="show" aria-labelledby="sample-title" className="flex flex-col gap-6">
          <figure className="flex flex-col gap-2">
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span id="sample-title" className="text-sm font-semibold text-ink">
                Sample render · {SAMPLES[kind].scene}, {ratioLabel(kind)}
              </span>
              <span className="text-[13px] text-ink-3">Demo footage bundled with Cutroom, not your prompt</span>
            </figcaption>
            <div className={SAMPLE_WIDTH[kind]}>
              <TakeFrame take={sample} variant="stage" />
            </div>
          </figure>

          <dl className="divide-y divide-rule border-y border-rule">
            {STEPS.map((s) => (
              <div key={s.term} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-[15px] font-semibold text-ink">{s.term}</dt>
                <dd className="text-[15px] leading-snug text-ink-2">{s.text(kind)}</dd>
              </div>
            ))}
          </dl>
        </motion.aside>
      </div>
    </main>
  );
}
