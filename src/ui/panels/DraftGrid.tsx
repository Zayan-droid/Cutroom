import { motion } from 'framer-motion';
import { gridContainer, fadeUp } from '@/lib/motion';
import { DraftCard } from './DraftCard';
import type { Take } from '@/types';

function summary(takes: Take[]): string {
  const ready = takes.filter((t) => t.status === 'ready').length;
  const failed = takes.filter((t) => t.status === 'failed').length;
  const working = takes.length - ready - failed;
  const parts = [`${ready} of ${takes.length} ready`];
  if (working) parts.push(`${working} generating`);
  if (failed) parts.push(`${failed} failed`);
  return parts.join(' · ');
}

export function DraftGrid({
  takes,
  activeId,
  onSelect,
}: {
  takes: Take[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const prompt = takes[0]?.prompt;
  // Widescreen drafts get two large frames per row; tall formats fit four across.
  const wide = takes[0]?.intent.kind === 'cinematic';

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" exit="exit" aria-labelledby="drafts-title" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule pb-3">
        <div className="min-w-0">
          <h2 id="drafts-title" className="text-xl font-bold tracking-tight">
            Drafts
          </h2>
          {prompt && <p className="mt-0.5 line-clamp-2 font-text text-[17px] italic text-ink-2">“{prompt}”</p>}
        </div>
        {takes.length > 0 && (
          <p className="tnum text-sm font-medium text-ink-2" aria-live="polite">
            {summary(takes)}
          </p>
        )}
      </header>

      {takes.length === 0 ? (
        <p className="rounded-md border border-dashed border-edge p-6 text-[15px] text-ink-2">
          No drafts in this batch. Pick a version from the history, or write a new prompt above.
        </p>
      ) : (
        <>
          <motion.ul
            key={takes.map((t) => t.id).join('-')}
            variants={gridContainer}
            initial="hidden"
            animate="show"
            className={wide ? 'grid grid-cols-2 gap-x-5 gap-y-6' : 'grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4'}
          >
            {takes.map((t) => (
              <DraftCard key={t.id} take={t} active={t.id === activeId} onSelect={onSelect} />
            ))}
          </motion.ul>
          <p className="text-sm text-ink-3">Open a draft to play it at full size, render it, remix it, or adjust it.</p>
        </>
      )}
    </motion.section>
  );
}
