import { useId, useMemo, useState, type CSSProperties } from 'react';
import { cropLockAspect, cropToFractions, describeAspect, planEdit, sourcePlan, trimRange, type RenderPlan } from '@/edit/geometry';
import { canonicalRecipe, createRecipe, isUnchanged, sameRecipe, type EditTool } from '@/edit/recipe';
import type { EditRecipe } from '@/types';
import { cn } from '@/lib/cn';
import { Button, ButtonCost } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { EditCanvas } from './EditCanvas';
import { CropOverlay, PanOverlay } from './overlays';
import { CropPanel, OutputSummary, ReframePanel, TOOL_NAMES, TrimPanel, UpscalePanel, toolState } from './panels';
import { Segmented } from './controls';
import { EditTransport } from './Transport';
import { DownloadEdit } from './DownloadEdit';
import { useEditMedia, useEditPlayer, type MediaKind } from './media';
import { browserRecordingType } from './recording';

/** What the editor is working on: one of the user's takes, or a file from their computer. */
export interface EditSource {
  url: string;
  kind: MediaKind;
  /** "Render · final", "Draft 2", or a file name. */
  title: string;
  /** The take's prompt, when editing a take. */
  prompt?: string;
  /** A short caution shown under the title (e.g. editing a low-resolution draft). */
  note?: string;
  /** Rough shape before the file loads (width / height), to avoid a jump. */
  aspectHint: number;
  /** Download name for a recipe, without the extension. */
  fileBase(recipe: EditRecipe): string;
  /** Present when the edit can be saved as a version; receives the cleaned-up recipe. */
  save?: (recipe: EditRecipe) => void;
}

/** Preview frame width: the picture keeps its ratio and stays above the fold at laptop heights. */
function frameWidth(aspect: number): string {
  return `min(100%, calc(max(240px, 100vh - 330px) * ${aspect.toFixed(4)}))`;
}

export function Editor({
  source,
  recipe,
  base,
  onChange,
  onChooseSource,
}: {
  source: EditSource;
  recipe: EditRecipe;
  /** The recipe the editor opened with, for unsaved-change checks. */
  base: EditRecipe;
  onChange: (recipe: EditRecipe) => void;
  onChooseSource: () => void;
}) {
  const media = useEditMedia(source.url, source.kind);
  const video = media.element instanceof HTMLVideoElement ? media.element : null;
  const size = media.size;
  const duration = media.duration;
  const isVideo = source.kind === 'video';
  const tools: EditTool[] = isVideo ? ['crop', 'reframe', 'upscale', 'trim'] : ['crop', 'reframe', 'upscale'];
  const [tool, setTool] = useState<EditTool>('crop');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const range = trimRange(recipe.trim, duration);
  const player = useEditPlayer(video, range);
  const titleId = useId();
  const recordingType = useMemo(() => browserRecordingType(true), []);

  const plan = useMemo<RenderPlan | null>(() => (size ? planEdit(recipe, size) : null), [recipe, size]);
  const cropping = tool === 'crop';
  const shown = size ? (cropping ? sourcePlan(size) : plan) : null;
  const aspect = shown ? shown.width / shown.height : source.aspectHint;

  const unchanged = size ? isUnchanged(recipe, size, isVideo ? duration : undefined) : true;
  const sameAsBase = size
    ? sameRecipe(canonicalRecipe(recipe, size, isVideo ? duration : undefined), canonicalRecipe(base, size, isVideo ? duration : undefined))
    : true;
  const canSave = !!source.save && !!size && !unchanged && !sameAsBase;
  const dirty = !sameRecipe(recipe, base);

  // The crop tool outlines what a fill reframe will keep inside the crop.
  const guide =
    size && plan && recipe.frame !== 'crop' && recipe.fit === 'fill' && !plan.background ? cropToFractions(plan.src, size) : null;

  const save = () => {
    if (!source.save || !size || !canSave) return;
    source.save(canonicalRecipe(recipe, size, isVideo ? duration : undefined));
  };

  const leave = () => {
    if (dirty) setConfirmLeave(true);
    else onChooseSource();
  };

  return (
    <section aria-labelledby={titleId} className="mt-6 flex flex-col gap-5">
      <header className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-rule pb-4">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-xl font-bold tracking-tight">
            {source.title}
          </h2>
          {source.prompt && <p className="mt-0.5 line-clamp-1 font-text text-[17px] italic text-ink-2">“{source.prompt}”</p>}
          {size && (
            <p className="tnum mt-1 text-sm text-ink-2">
              Original: {size.width} × {size.height} · {describeAspect(size.width, size.height)}
              {isVideo && duration > 0 ? ` · ${duration.toFixed(1)} s` : ''}
            </p>
          )}
          {source.note && <p className="mt-1 text-sm text-warn">{source.note}</p>}
        </div>
        <Button variant="secondary" size="sm" leftIcon={<Glyph name="back" />} onClick={leave}>
          Choose another clip
        </Button>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,22.5rem)] lg:gap-8">
        {/* The frame keeps its ratio inside a height budget; the controls under it never get
            narrower than 20rem, so a tall frame still has a usable scrubber. */}
        <div className="min-w-0" style={{ '--frame-w': frameWidth(aspect) } as CSSProperties}>
          <div className="mx-auto w-full max-w-[var(--frame-w)]">
            <div className="relative w-full overflow-hidden bg-well" style={{ aspectRatio: String(aspect) }}>
              {media.status === 'ready' && size && shown && (
                <EditCanvas
                  source={media.element}
                  size={size}
                  plan={shown}
                  label={cropping ? 'The whole picture, with the crop area marked' : 'The edited picture'}
                />
              )}
              {media.status === 'ready' && size && cropping && (
                <CropOverlay
                  size={size}
                  crop={recipe.crop}
                  aspect={cropLockAspect(recipe.cropAspect, size)}
                  guide={guide}
                  onChange={(crop) => onChange({ ...recipe, crop })}
                />
              )}
              {media.status === 'ready' && size && plan && tool === 'reframe' && (
                <PanOverlay plan={plan} recipe={recipe} size={size} onChange={(position) => onChange({ ...recipe, position })} />
              )}
              {(media.status === 'loading' || media.status === 'idle') && (
                <p role="status" className="absolute inset-0 flex items-center justify-center text-[15px] font-medium text-ink-2">
                  Loading the clip…
                </p>
              )}
              {media.status === 'error' && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center">
                  <p className="text-lg font-semibold text-ink">Couldn't load this clip</p>
                  <p className="max-w-sm text-sm text-ink-2">
                    {source.save
                      ? 'The file may have moved, or the connection dropped.'
                      : "Your browser may not play this format. MP4 (H.264), WebM, and common image files work best."}
                  </p>
                  <Button size="sm" variant="secondary" className="mt-2" leftIcon={<Glyph name="retry" />} onClick={media.retry}>
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="mx-auto w-full max-w-[max(var(--frame-w),20rem)]">
            {video && media.status === 'ready' && (
              <EditTransport
                player={player}
                min={0}
                max={duration}
                kept={recipe.trim || tool === 'trim' ? range : undefined}
                label="Position in the original clip"
              />
            )}
            {media.status === 'ready' && (
              <p className="mt-3 text-sm text-ink-2">
                {cropping
                  ? 'Showing the whole picture. The bright area is kept.'
                  : tool === 'trim'
                    ? 'Showing the result. Playback loops over the kept part; the darker stretch of the bar is kept.'
                    : 'Showing the result.'}
              </p>
            )}
            {media.status === 'ready' && !media.readable && (
              <p role="note" className="mt-2 text-sm text-warn">
                This file's host doesn't let the browser read its pixels, so you can preview edits but not download them.
              </p>
            )}
          </div>
        </div>

        <aside aria-label="Edit settings" className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-5 rounded-md border border-rule bg-sheet p-4">
            <Segmented
              legend="Tool"
              options={tools.map((t) => ({
                value: t,
                label: TOOL_NAMES[t],
                detail: size && plan ? toolState(t, recipe, size, plan, duration) : undefined,
              }))}
              value={tool}
              columns={isVideo ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-2' : 'grid-cols-3'}
              onChange={setTool}
              disabled={!size}
            />
            {size && plan ? (
              <div role="group" aria-label={`${TOOL_NAMES[tool]} settings`}>
                {tool === 'crop' && <CropPanel recipe={recipe} size={size} onChange={onChange} />}
                {tool === 'reframe' && <ReframePanel recipe={recipe} size={size} plan={plan} onChange={onChange} />}
                {tool === 'upscale' && <UpscalePanel recipe={recipe} size={size} onChange={onChange} />}
                {tool === 'trim' && isVideo && <TrimPanel recipe={recipe} duration={duration} playhead={player.time} onChange={onChange} />}
              </div>
            ) : (
              <p className="text-[15px] text-ink-2">{media.status === 'error' ? 'Settings appear once the clip loads.' : 'Loading…'}</p>
            )}
          </div>

          {size && plan && (
            <OutputSummary recipe={recipe} size={size} plan={plan} duration={duration} kind={source.kind} recordingType={recordingType} />
          )}

          <div className="flex flex-col gap-2">
            {source.save && (
              <>
                <Button variant="primary" size="lg" disabled={!canSave} onClick={save}>
                  Save as new version
                  <ButtonCost cost={0} />
                </Button>
                <p className="text-sm text-ink-2">
                  {canSave
                    ? 'Adds it to your version history. The original stays as it is.'
                    : unchanged
                      ? 'Make a change to save a new version.'
                      : 'This matches the version you opened. Change something to save a new one.'}
                </p>
              </>
            )}
            {size && (
              <DownloadEdit
                url={source.url}
                kind={source.kind}
                recipe={recipe}
                fileBase={source.fileBase(canonicalRecipe(recipe, size, isVideo ? duration : undefined))}
                label={isVideo ? 'Download video' : 'Download image'}
                variant={source.save ? 'secondary' : 'primary'}
                size="lg"
                disabled={unchanged || !media.readable || (isVideo && !recordingType)}
                className={cn(source.save && 'mt-2')}
              />
            )}
            {size && isVideo && !recordingType && (
              <p className="text-sm text-bad">This browser can't record video, so edits can be saved but not downloaded here.</p>
            )}
            <Button
              variant="quiet"
              className="-ml-4 self-start"
              disabled={!size || unchanged}
              onClick={() => onChange(createRecipe())}
            >
              Reset to the original
            </Button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this edit?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onChooseSource();
        }}
      >
        {source.save
          ? "Your changes haven't been saved as a version. Choosing another clip discards them."
          : "Your changes haven't been downloaded. Choosing another clip discards them."}
      </ConfirmDialog>
    </section>
  );
}
