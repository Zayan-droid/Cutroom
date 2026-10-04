import { useEffect, useRef, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { INTENT_LABELS, NUDGE_LABELS, type IntentKind, type Nudge, type Take } from '@/types';
import { TakeFrame } from '@/ui/components/TakeFrame';
import { Button, ButtonCost, Status } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { RecoverySurface } from './RecoverySurface';
import { actions, useAvailableCredits } from '@/store';
import { toast } from '@/store/toast';
import { quote } from '@/lib/cost';
import { ratioLabel } from '@/lib/media';
import { fadeUp, tBase } from '@/lib/motion';
import { cn } from '@/lib/cn';

const NUDGES = Object.keys(NUDGE_LABELS) as Nudge[];

/**
 * Frame size caps. The frame keeps its exact ratio; its height is budgeted
 * against the viewport so the controls (and, for widescreen, the actions
 * stacked below) stay on screen at common laptop heights.
 */
const FRAME_LIMIT: Record<IntentKind, { px: number; ratio: number; reserve: number }> = {
  social: { px: 360, ratio: 9 / 16, reserve: 340 },
  ad: { px: 460, ratio: 4 / 5, reserve: 340 },
  cinematic: { px: 960, ratio: 16 / 9, reserve: 420 },
};

function frameWidth({ px, ratio, reserve }: (typeof FRAME_LIMIT)[IntentKind]): string {
  return `min(${px}px, calc(max(240px, 100vh - ${reserve}px) * ${ratio.toFixed(4)}))`;
}

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
  const isDraft = take.kind === 'draft';
  const renderCost = quote('render', take.intent.kind);
  const canRender = ready && isDraft && avail >= renderCost;
  const renderReady = take.kind === 'render' && ready;
  const limit = FRAME_LIMIT[take.intent.kind];
  const wide = take.intent.kind === 'cinematic';
  const label = take.label ?? (isDraft ? 'Draft' : 'Render');

  const promptBlock = (
    <div>
      <p className="text-sm font-semibold text-ink">Prompt</p>
      <p className="mt-1 max-w-3xl font-text text-[18px] leading-snug text-ink">{take.prompt}</p>
    </div>
  );

  // Micro-feedback: announce a successful render exactly once.
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (renderReady && notified.current !== take.id) {
      notified.current = take.id;
      toast('Render finished. It is saved in your version history.', 'success');
    }
  }, [renderReady, take.id]);

  return (
    <motion.section variants={fadeUp} initial="hidden" animate="show" exit="exit" aria-labelledby="stage-title" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule pb-3">
        {showBack && (
          <Button variant="quiet" size="sm" onClick={onBack} leftIcon={<Glyph name="back" />} className="-ml-2">
            All drafts
          </Button>
        )}
        <h2 id="stage-title" className="text-xl font-bold tracking-tight">
          {label}
        </h2>
        <Status status={take.status} progress={take.progress} />
        <span className="ml-auto text-sm font-medium text-ink-2">
          {INTENT_LABELS[take.intent.kind]} · {ratioLabel(take.intent.kind)}
        </span>
      </header>

      {/* The picture leads. Widescreen takes span the column with actions below;
          tall formats leave room beside the frame, so actions sit there instead. */}
      <div
        className={cn('grid grid-cols-1 items-start gap-6', !wide && 'md:grid-cols-[var(--frame-w)_minmax(0,1fr)] md:gap-8')}
        style={{ '--frame-w': frameWidth(limit) } as CSSProperties}
      >
        <div className="mx-auto w-full max-w-[var(--frame-w)] md:mx-0">
          <TakeFrame take={take} variant="stage" layoutId={`frame-${take.id}`} />
        </div>

        <aside aria-label="Take actions" className={cn('grid grid-cols-1 content-start gap-6', wide && 'md:grid-cols-2 md:gap-x-8')}>
          {/* Widescreen: the main actions come first, right under the player. */}
          {!wide && promptBlock}

          {failed ? (
            <div>
              <RecoverySurface take={take} />
            </div>
          ) : (
            <>
              <div className={cn('flex flex-col gap-4', wide && 'md:col-span-2 md:flex-row md:flex-wrap md:items-start')}>
                {renderReady && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0, transition: tBase }}
                    className={cn('flex gap-2.5 rounded-md border border-ok/60 bg-ok/[0.08] p-3 text-[15px] text-ink', wide && 'md:basis-full')}
                  >
                    <Glyph name="check" className="mt-0.5 text-ok" />
                    <p>
                      <span className="font-semibold">Final render complete.</span>{' '}
                      <span className="text-ink-2">Remix or adjust it to branch a new version.</span>
                    </p>
                  </motion.div>
                )}

                {isDraft && (
                  <div className={cn('flex flex-col gap-2', wide && 'md:w-[22rem]')}>
                    <Button variant="primary" size="lg" disabled={!canRender} onClick={() => actions.render()}>
                      Render final
                      <ButtonCost cost={renderCost} />
                    </Button>
                    {ready && !canRender ? (
                      <p role="alert" className="text-sm text-bad">
                        Not enough credits: this render needs {renderCost}, and {avail} {avail === 1 ? 'is' : 'are'} available.
                      </p>
                    ) : (
                      <p className="text-sm text-ink-2">
                        {ready ? 'Charged only when the render finishes.' : 'Available once this draft is ready.'}
                      </p>
                    )}
                  </div>
                )}

                <Button
                  variant="secondary"
                  size={wide ? 'lg' : 'md'}
                  disabled={!ready}
                  className={cn(wide && 'md:w-auto')}
                  onClick={() => {
                    actions.remix(take.id);
                    toast('Remixing: four new drafts are on the way.');
                  }}
                >
                  Remix into 4 drafts
                  <ButtonCost cost={0} />
                </Button>
              </div>
            </>
          )}

          {wide && promptBlock}

          {!failed && (
            <fieldset disabled={!ready} className="flex min-w-0 flex-col gap-2 disabled:opacity-60">
              <legend className="text-sm font-semibold text-ink">Adjust and retry</legend>
              <p className="-mt-1 text-sm text-ink-2">Each adjustment makes one new free draft from this take.</p>
              <div className="grid grid-cols-2 gap-2">
                {NUDGES.map((n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="secondary"
                    className="border-edge font-medium"
                    onClick={() => {
                      actions.applyNudge(take.id, n);
                      toast(`Adjusting: ${NUDGE_LABELS[n].toLowerCase()}.`);
                    }}
                  >
                    {NUDGE_LABELS[n]}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
        </aside>
      </div>
    </motion.section>
  );
}
