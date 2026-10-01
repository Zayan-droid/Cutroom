import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import type { Take } from '@/types';
import { Poster } from '@/ui/components/Poster';
import { StatusPill, CostChip } from '@/ui/components/ui';
import { gridItem } from '@/lib/motion';
import { actions } from '@/store';
import { toast } from '@/store/toast';
import { cn } from '@/lib/cn';

export function DraftCard({
  take,
  selected,
  onSelect,
}: {
  take: Take;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const ready = take.status === 'ready';
  const failed = take.status === 'failed';

  return (
    <motion.div
      variants={gridItem}
      layout
      whileHover={{ y: -3 }}
      role="button"
      tabIndex={0}
      aria-label={`${take.label ?? 'Draft'} — ${take.status}`}
      onClick={() => onSelect(take.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(take.id);
        }
      }}
      className={cn(
        'group relative cursor-pointer rounded-2xl border bg-surface-2/60 p-1.5 transition-shadow duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected ? 'border-primary/60 shadow-glow' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="relative">
        <Poster take={take} layoutId={`poster-${take.id}`} rounded="rounded-xl" />

        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-center justify-between">
          <span className="rounded-md bg-black/45 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur-sm">
            {take.label}
          </span>
          {ready && <CostChip cost={take.cost} />}
        </div>

        {failed && (
          <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/68 p-3 text-center backdrop-blur-sm">
            <div>
              <p className="mb-2.5 line-clamp-3 text-xs text-fg-muted">{take.error}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  actions.retry(take.id);
                  toast('Reroll — no charge.', 'success');
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-b from-primary to-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reroll · Free
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-1.5 py-1.5">
        <StatusPill status={take.status} />
        {ready && (
          <span className="text-[11px] text-fg-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            Select →
          </span>
        )}
      </div>
    </motion.div>
  );
}
