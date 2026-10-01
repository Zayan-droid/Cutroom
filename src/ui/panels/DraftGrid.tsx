import { motion } from 'framer-motion';
import { gridContainer, fadeUp } from '@/lib/motion';
import { DraftCard } from './DraftCard';
import type { Take } from '@/types';

export function DraftGrid({
  takes,
  activeId,
  onSelect,
}: {
  takes: Take[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const settling = takes.some((t) => t.status === 'queued' || t.status === 'generating');
  const anyReady = takes.some((t) => t.status === 'ready');

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-fg">
          {settling ? 'Drafting four takes…' : 'Pick a direction'}
        </h2>
        <p className="text-xs text-fg-subtle">
          {anyReady ? 'Select a draft to render, remix, or nudge.' : 'Cheap look first — free.'}
        </p>
      </div>

      <motion.div
        key={takes.map((t) => t.id).join('-')}
        variants={gridContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4"
      >
        {takes.map((t) => (
          <DraftCard key={t.id} take={t} selected={t.id === activeId} onSelect={onSelect} />
        ))}
      </motion.div>
    </motion.section>
  );
}
