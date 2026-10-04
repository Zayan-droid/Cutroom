import { useMemo, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { FRAME_ASPECTS, describeAspect, planEdit, trimRange } from '@/edit/geometry';
import { describeRecipe } from '@/edit/recipe';
import type { EditRecipe, IntentKind, Take } from '@/types';
import { actions, useProjectStore } from '@/store';
import { toast } from '@/store/toast';
import { takeAsset } from '@/lib/download';
import { aspectFor, isVideoAsset } from '@/lib/media';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { Button, ButtonCost, Status } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { EditCanvas } from '@/ui/edit/EditCanvas';
import { EditTransport } from '@/ui/edit/Transport';
import { DownloadEdit } from '@/ui/edit/DownloadEdit';
import { useEditMedia, useEditPlayer } from '@/ui/edit/media';
import { takeEditBase, takeTitle } from '@/ui/edit/files';
import { frameLimitFor, frameWidth } from './Stage';

/** The shape an edit will have before its source loads, so the frame doesn't jump. */
function expectedAspect(recipe: EditRecipe, kind: IntentKind): number {
  if (recipe.frame !== 'crop') return FRAME_ASPECTS[recipe.frame];
  const [w, h] = aspectFor(kind).split('/').map((part) => Number(part.trim()));
  return ((w / h) * recipe.crop.width) / recipe.crop.height;
}

/**
 * An edited version on the stage: the source played through its recipe, what
 * changed, and the actions that make sense for an edit — download the result,
 * edit it again, remix, or go back to the original.
 */
export function EditStage({
  take,
  onBack,
  showBack,
  onEdit,
  onSelect,
}: {
  take: Take & { edit: EditRecipe };
  onBack: () => void;
  showBack: boolean;
  onEdit: (take: Take) => void;
  onSelect: (id: string) => void;
}) {
  const recipe = take.edit;
  const url = takeAsset(take);
  const kind = url && isVideoAsset(url) ? 'video' : 'image';
  const media = useEditMedia(url, kind);
  const video = media.element instanceof HTMLVideoElement ? media.element : null;
  const range = trimRange(recipe.trim, media.duration);
  const player = useEditPlayer(video, range);
  const plan = useMemo(() => (media.size ? planEdit(recipe, media.size) : null), [recipe, media.size]);
  const aspect = plan ? plan.width / plan.height : expectedAspect(recipe, take.intent.kind);
  const wide = aspect >= 1.2;
  const parent = useProjectStore((s) => s.takes.find((t) => t.id === take.parentId));
  const changes = describeRecipe(recipe, media.size ?? undefined, kind === 'video' && media.duration ? media.duration : undefined);
  const label = take.label ?? 'Edit';

  const promptBlock = (
    <div>
      <p className="text-sm font-semibold text-ink">Prompt</p>
      <p className="mt-1 max-w-3xl font-text text-[18px] leading-snug text-ink">{take.prompt}</p>
    </div>
  );

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
        <Status status={take.status} />
        <span className="tnum ml-auto text-sm font-medium text-ink-2">
          Edited · {plan ? `${describeAspect(plan.width, plan.height)} · ${plan.width} × ${plan.height}` : 'loading'}
        </span>
      </header>

      <div
        className={cn(
          'grid grid-cols-1 items-start gap-6',
          !wide && 'md:grid-cols-[minmax(0,var(--frame-w))_minmax(17.5rem,1fr)] md:gap-8',
        )}
        style={{ '--frame-w': frameWidth(frameLimitFor(aspect)) } as CSSProperties}
      >
        <div className="mx-auto w-full max-w-[var(--frame-w)] md:mx-0">
          <div className="relative w-full overflow-hidden bg-well" style={{ aspectRatio: String(aspect) }}>
            {media.status === 'ready' && plan && (
              <EditCanvas source={media.element} size={media.size} plan={plan} label={`${label}: ${changes.map((c) => c.text).join(', ') || 'edited take'}`} />
            )}
            {(media.status === 'loading' || media.status === 'idle') && (
              <p role="status" className="absolute inset-0 flex items-center justify-center text-[15px] font-medium text-ink-2">
                Loading the clip…
              </p>
            )}
            {media.status === 'error' && (
              <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
                <p className="text-lg font-semibold text-ink">Couldn't load this clip</p>
                <p className="max-w-xs text-sm text-ink-2">The file may have moved, or the connection dropped.</p>
                <Button size="sm" variant="secondary" className="mt-2" leftIcon={<Glyph name="retry" />} onClick={media.retry}>
                  Try again
                </Button>
              </div>
            )}
          </div>
          {video && media.status === 'ready' && <EditTransport player={player} min={range.start} max={range.end} />}
        </div>

        <aside aria-label="Take actions" className={cn('grid grid-cols-1 content-start gap-6', wide && 'md:grid-cols-2 md:gap-x-8')}>
          <div className={cn('flex flex-col gap-4', wide && 'md:col-span-2 md:flex-row md:flex-wrap md:items-start')}>
            <div className={cn('flex flex-col gap-1', wide && 'md:basis-full')}>
              <p className="text-sm font-semibold text-ink">Changes</p>
              <ul className="flex flex-col gap-0.5 text-[15px] text-ink-2">
                {changes.map((change) => (
                  <li key={change.tool} className="flex gap-2">
                    <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-ink-3" />
                    {change.text}
                  </li>
                ))}
              </ul>
            </div>

            {url && (
              <DownloadEdit
                url={url}
                kind={kind}
                recipe={recipe}
                fileBase={takeEditBase(take.prompt, recipe)}
                label={kind === 'video' ? 'Download edited video' : 'Download edited image'}
                variant="primary"
                size="lg"
                disabled={media.status !== 'ready' || !media.readable}
                className={cn(wide && 'md:w-[22rem]')}
              />
            )}

            <Button variant="secondary" size={wide ? 'lg' : 'md'} className={cn(wide && 'md:w-auto')} onClick={() => onEdit(take)}>
              Edit again
              <ButtonCost cost={0} />
            </Button>

            <Button
              variant="secondary"
              size={wide ? 'lg' : 'md'}
              className={cn(wide && 'md:w-auto')}
              onClick={() => {
                actions.remix(take.id);
                toast('Remixing: four new drafts are on the way.');
              }}
            >
              Remix into 4 drafts
              <ButtonCost cost={0} />
            </Button>

            {parent && (
              <Button variant="quiet" size={wide ? 'lg' : 'md'} className={cn('self-start', wide ? 'md:w-auto' : '-ml-4')} onClick={() => onSelect(parent.id)}>
                Show the original ({takeTitle(parent)})
              </Button>
            )}
          </div>
          {promptBlock}
        </aside>
      </div>
    </motion.section>
  );
}
