import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Clapperboard, Shuffle } from 'lucide-react';
import { INTENT_LABELS, NUDGE_LABELS, type Nudge, type Take } from '@/types';
import { Poster } from '@/ui/components/Poster';
import { Button, CostChip, StatusPill } from '@/ui/components/ui';
import { RecoverySurface } from './RecoverySurface';
import { actions, useAvailableCredits } from '@/store';
import { toast } from '@/store/toast';
import { quote } from '@/lib/cost';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/cn';

const NUDGES = Object.keys(NUDGE_LABELS) as Nudge[];

const MAXW: Record<Take['intent']['kind'], string> = {
  social: 'max-w-[300px]',
  ad: 'max-w-[420px]',
  cinematic: 'max-w-[760px]',
};

export function Stage({
  take,
  onBack,
  showBack,
}: {
  take: Take;
  onBack: () => void;
  showBack: boolean;
}) {
  const avail = useAvailableCredits();
  const ready = take.status === 'ready';
  const failed = take.status === 'failed';
  const loading = take.status === 'queued' || take.status === 'generating';
  const isDraft = take.kind === 'draft';
  const renderCost = quote('render', take.intent.kind);
  const canRender = ready && isDraft && avail >= renderCost;
  const renderReady = take.kind === 'render' && ready;

  // Micro-feedback: announce a successful render exactly once.
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (renderReady && notified.current !== take.id) {
      notified.current = take.id;
      toast('Rendered — direction locked in.', 'success');
    }
  }, [renderReady, take.id]);

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" exit="exit" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {showBack && (
          <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Drafts
          </Button>
        )}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">{take.label ?? (isDraft ? 'Draft' : 'Render')}</span>
          <span className="text-fg-subtle">·</span>
          <StatusPill status={take.status} />
        </div>
        <span className="ml-auto rounded-full border border-border px-2.5 py-1 text-[11px] text-fg-muted">
          {INTENT_LABELS[take.intent.kind]}
        </span>
      </div>

      <div className={cn('mx-auto w-full', MAXW[take.intent.kind])}>
        <motion.div
          className={cn('rounded-2xl transition-shadow duration-500', renderReady && 'shadow-glow-success')}
          animate={renderReady ? { scale: [1, 1.012, 1] } : undefined}
          transition={{ duration: 0.6 }}
        >
          <Poster take={take} layoutId={`poster-${take.id}`} rounded="rounded-2xl" />
        </motion.div>
      </div>

      <p className="mx-auto max-w-2xl text-center text-sm italic text-fg-muted line-clamp-2">“{take.prompt}”</p>

      {failed ? (
        <div className="mx-auto w-full max-w-xl">
          <RecoverySurface take={take} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {isDraft && (
              <Button
                variant="primary"
                size="lg"
                disabled={!canRender || loading}
                onClick={() => actions.render()}
                leftIcon={<Clapperboard className="h-4 w-4" />}
              >
                Render
                <CostChip cost={renderCost} className="ml-1" />
              </Button>
            )}
            <Button
              variant="subtle"
              size="lg"
              disabled={!ready}
              onClick={() => {
                actions.remix(take.id);
                toast('Spun four variants.');
              }}
              leftIcon={<Shuffle className="h-4 w-4" />}
            >
              Remix
            </Button>
          </div>

          {ready && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-fg-subtle">Nudge:</span>
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
          )}

          {isDraft && ready && !canRender && (
            <p className="text-xs text-danger">
              Not enough credits — {avail} available, this render needs {renderCost}.
            </p>
          )}
          {renderReady && (
            <p className="text-xs text-fg-subtle">Rendered. Remix or nudge to branch a new take — your rail keeps every version.</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
