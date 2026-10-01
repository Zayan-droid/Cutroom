import { motion } from 'framer-motion';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { actions } from '@/store';
import { NUDGE_LABELS, type Nudge, type Take } from '@/types';
import { Button, CostChip } from '@/ui/components/ui';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/cn';

const NUDGES = Object.keys(NUDGE_LABELS) as Nudge[];

export function RecoverySurface({ take, size = 'full' }: { take: Take; size?: 'full' | 'inline' }) {
  const full = size === 'full';
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className={cn(
        'rounded-2xl border border-danger/25 bg-danger-600/[0.08]',
        full ? 'p-5' : 'p-3.5',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-danger/15 text-danger">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className={cn('font-semibold text-fg', full ? 'text-[15px]' : 'text-sm')}>
            This take failed
          </p>
          <p className={cn('text-fg-muted', full ? 'mt-0.5 text-sm' : 'text-xs')}>
            {take.error ?? 'Something went wrong upstream.'}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size={full ? 'md' : 'sm'}
          onClick={() => actions.retry(take.id)}
          leftIcon={<RotateCcw className="h-4 w-4" />}
        >
          Reroll
          <CostChip cost={0} className="ml-0.5" />
        </Button>
        <span className="text-xs text-fg-subtle">or adjust and retry:</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {NUDGES.map((n) => (
          <button
            key={n}
            onClick={() => actions.applyNudge(take.id, n)}
            className="cursor-pointer rounded-full border border-border-strong bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-primary/40 hover:text-fg"
          >
            {NUDGE_LABELS[n]}
          </button>
        ))}
      </div>

      {full && (
        <p className="mt-3.5 text-xs text-fg-subtle">
          Rerolls never cost credits — and your failed take stays on the rail, so you never lose an
          earlier good state.
        </p>
      )}
    </motion.div>
  );
}
