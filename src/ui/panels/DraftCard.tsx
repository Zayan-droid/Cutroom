import { motion } from 'framer-motion';
import type { Take } from '@/types';
import { TakeFrame } from '@/ui/components/TakeFrame';
import { Button, Cost, Status } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { gridItem } from '@/lib/motion';
import { actions } from '@/store';
import { toast } from '@/store/toast';
import { cn } from '@/lib/cn';

const STATUS_WORDS: Record<Take['status'], string> = {
  queued: 'queued',
  generating: 'generating',
  ready: 'ready',
  failed: 'failed',
};

/**
 * One draft. The whole card is a single button (stretched over the card); the
 * retry control for a failed draft is a sibling above it, never nested inside.
 */
export function DraftCard({
  take,
  active,
  onSelect,
}: {
  take: Take;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const failed = take.status === 'failed';
  const label = take.label ?? 'Draft';

  return (
    <motion.li variants={gridItem} className="group relative flex min-w-0 flex-col gap-2">
      <div
        className={cn(
          'relative outline outline-offset-[3px] transition-[outline-color] duration-150',
          active ? 'outline-2 outline-mark' : 'outline-1 outline-transparent group-hover:outline-edge',
        )}
      >
        <TakeFrame take={take} layoutId={`frame-${take.id}`} />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">{label}</p>
          <Status status={take.status} progress={take.progress} />
        </div>
        <div className="shrink-0 text-right text-[13px] leading-5">
          {active && <p className="font-semibold text-mark">Selected</p>}
          {take.status === 'ready' && <Cost cost={take.cost} className="text-ink-3" />}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSelect(take.id)}
        aria-label={`Open ${label}, ${STATUS_WORDS[take.status]}`}
        aria-current={active ? 'true' : undefined}
        className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-offset-[6px]"
      />

      {failed && (
        <div className="relative z-20 flex flex-col items-start gap-2">
          <p className="line-clamp-3 text-[13px] leading-snug text-ink-2">{take.error ?? 'Generation failed.'}</p>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Glyph name="retry" />}
            onClick={() => {
              actions.retry(take.id);
              toast('Rerolling that draft. Rerolls are free.', 'success');
            }}
          >
            Reroll · Free
          </Button>
        </div>
      )}
    </motion.li>
  );
}
