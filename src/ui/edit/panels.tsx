import { useId } from 'react';
import {
  FRAME_ASPECTS,
  clampCrop,
  cropLockAspect,
  cropToFractions,
  cropToPixels,
  describeAspect,
  formatClock,
  lockCrop,
  sameShape,
  setCropOrigin,
  setCropSize,
  trimRange,
  upscaleChoices,
  type RenderPlan,
  type Size,
} from '@/edit/geometry';
import { createRecipe, describeRecipe, formatFactor, formatSeconds, type EditTool } from '@/edit/recipe';
import type { EditRecipe, FrameAspect } from '@/types';
import { Button } from '@/ui/components/ui';
import { NumberField, RangeField, Segmented, type Choice } from './controls';
import { formatName } from './recording';
import { panAxis } from './overlays';

// One panel per tool. Each edits the recipe through `onChange` and says in
// plain words what its settings do.

interface PanelProps {
  recipe: EditRecipe;
  size: Size;
  onChange: (recipe: EditRecipe) => void;
}

const FRAME_NAMES: Record<FrameAspect, string> = {
  '16:9': 'Widescreen',
  '9:16': 'Vertical',
  '1:1': 'Square',
  '4:5': 'Portrait',
};

const FULL_CROP = createRecipe().crop;

// ── Crop ──────────────────────────────────────────────────────────────────────

export function CropPanel({ recipe, size, onChange }: PanelProps) {
  const lock = cropLockAspect(recipe.cropAspect, size);
  const px = clampCrop(cropToPixels(recipe.crop, size), size);
  const setCrop = (next: typeof px) => onChange({ ...recipe, crop: cropToFractions(next, size) });
  const full = px.x === 0 && px.y === 0 && px.width === size.width && px.height === size.height;

  const shapes: Array<Choice<EditRecipe['cropAspect']>> = [
    { value: 'free', label: 'Free', shape: 'free' },
    { value: 'original', label: 'Original', detail: describeAspect(size.width, size.height), shape: size.width / size.height },
    ...(Object.keys(FRAME_ASPECTS) as FrameAspect[]).map((id) => ({ value: id, label: id, shape: FRAME_ASPECTS[id] })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Segmented
        legend="Shape"
        options={shapes}
        value={recipe.cropAspect}
        columns="grid-cols-3"
        onChange={(id) => onChange({ ...recipe, cropAspect: id, crop: cropToFractions(lockCrop(px, size, cropLockAspect(id, size)), size) })}
        hint="Drag the box or its handles on the picture. A shape keeps the box at that ratio."
      />
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-semibold text-ink">Exact size and position</legend>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Width" unit="px" value={px.width} min={1} max={size.width} onCommit={(width) => setCrop(setCropSize(px, { width }, size, lock))} />
          <NumberField label="Height" unit="px" value={px.height} min={1} max={size.height} onCommit={(height) => setCrop(setCropSize(px, { height }, size, lock))} />
          <NumberField label="From left" unit="px" value={px.x} min={0} max={size.width - px.width} onCommit={(x) => setCrop(setCropOrigin(px, { x }, size))} />
          <NumberField label="From top" unit="px" value={px.y} min={0} max={size.height - px.height} onCommit={(y) => setCrop(setCropOrigin(px, { y }, size))} />
        </div>
      </fieldset>
      <Button
        variant="quiet"
        size="sm"
        className="-ml-3 self-start"
        disabled={full && recipe.cropAspect === 'free'}
        onClick={() => onChange({ ...recipe, crop: { ...FULL_CROP }, cropAspect: 'free' })}
      >
        Reset crop
      </Button>
    </div>
  );
}

// ── Reframe ───────────────────────────────────────────────────────────────────

function positionWords(value: number, axis: 'x' | 'y'): string {
  const [start, end] = axis === 'x' ? ['left', 'right'] : ['top', 'bottom'];
  if (Math.abs(value - 0.5) < 0.005) return 'Centred';
  if (value <= 0.005) return `At the ${start} edge`;
  if (value >= 0.995) return `At the ${end} edge`;
  return `${Math.round(value * 100)}% toward the ${end}`;
}

export function ReframePanel({ recipe, size, plan, onChange }: PanelProps & { plan: RenderPlan }) {
  const crop = clampCrop(cropToPixels(recipe.crop, size), size);
  const cropAspect = crop.width / crop.height;
  const reframing = recipe.frame !== 'crop';
  const already = reframing && sameShape(FRAME_ASPECTS[recipe.frame as FrameAspect], cropAspect);
  const pan = panAxis(plan, recipe, size);

  const frames: Array<Choice<EditRecipe['frame']>> = [
    { value: 'crop', label: 'Keep the crop’s shape', detail: describeAspect(crop.width, crop.height), shape: cropAspect, wide: true },
    ...(Object.keys(FRAME_ASPECTS) as FrameAspect[]).map((id) => ({
      value: id,
      label: FRAME_NAMES[id],
      detail: id,
      shape: FRAME_ASPECTS[id],
    })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <Segmented
        legend="Frame"
        options={frames}
        value={recipe.frame}
        columns="grid-cols-2"
        onChange={(frame) => onChange({ ...recipe, frame, position: { x: 0.5, y: 0.5 } })}
        hint={
          reframing
            ? already
              ? `The crop is already ${recipe.frame}, so nothing changes.`
              : null
            : 'Choose a frame to make a vertical, square, portrait, or widescreen version of the crop.'
        }
      />
      {reframing && !already && (
        <>
          <Segmented
            legend="Fit"
            options={[
              { value: 'fill', label: 'Fill the frame', detail: 'Cuts what overflows' },
              { value: 'fit', label: 'Fit inside', detail: 'Keeps it all, adds bars' },
            ]}
            value={recipe.fit}
            onChange={(fit) => onChange({ ...recipe, fit, position: { x: 0.5, y: 0.5 } })}
          />
          {recipe.fit === 'fit' && (
            <Segmented
              legend="Bars"
              options={[
                { value: 'blur', label: 'Blurred' },
                { value: 'black', label: 'Black' },
                { value: 'white', label: 'White' },
              ]}
              columns="grid-cols-3"
              value={recipe.background}
              onChange={(background) => onChange({ ...recipe, background })}
            />
          )}
          {pan && (
            <div className="flex flex-col gap-2">
              <RangeField
                label={pan.axis === 'x' ? 'Horizontal position' : 'Vertical position'}
                min={0}
                max={100}
                step={1}
                value={Math.round(recipe.position[pan.axis] * 100)}
                display={positionWords(recipe.position[pan.axis], pan.axis)}
                onChange={(value) => onChange({ ...recipe, position: { ...recipe.position, [pan.axis]: value / 100 } })}
              />
              <p className="text-[13px] leading-snug text-ink-2">
                {recipe.fit === 'fill' ? 'Drag the picture to choose what stays in the frame.' : 'Drag the picture to move it between the bars.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Upscale ───────────────────────────────────────────────────────────────────

const UPSCALE_NAMES: Record<EditRecipe['upscale'], string> = {
  none: 'Original size',
  '1080p': '1080p · Full HD',
  '1440p': '1440p · QHD',
  '4k': '4K · Ultra HD',
};

export function UpscalePanel({ recipe, size, onChange }: PanelProps) {
  const choices = upscaleChoices(recipe, size);
  const current = choices.find((c) => c.id === recipe.upscale);
  const value = current?.available ? recipe.upscale : 'none';
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        legend="Output size"
        options={choices.map((c) => ({
          value: c.id,
          label: UPSCALE_NAMES[c.id],
          detail: c.available
            ? `${c.width} × ${c.height}${c.factor > 1 ? ` · ${formatFactor(c.factor)}` : ''}`
            : 'Already this size or larger',
          disabled: !c.available,
        }))}
        value={value}
        columns="grid-cols-1"
        onChange={(upscale) => onChange({ ...recipe, upscale })}
      />
      <p className="text-[13px] leading-snug text-ink-2">
        Upscaling redraws every frame at the larger size with a sharp bicubic filter, then sharpens fine edges. It suits big
        screens and platforms that ask for a size; it can't add detail the clip doesn't have.
      </p>
    </div>
  );
}

// ── Trim ──────────────────────────────────────────────────────────────────────

export function TrimPanel({
  recipe,
  duration,
  playhead,
  onChange,
}: {
  recipe: EditRecipe;
  duration: number;
  playhead: number;
  onChange: (recipe: EditRecipe) => void;
}) {
  const range = trimRange(recipe.trim, duration);
  const step = duration > 20 ? 0.1 : 0.05;
  const setTrim = (start: number, end: number) => {
    const next = trimRange({ start, end }, duration);
    const whole = next.start < 0.005 && next.end > duration - 0.005;
    onChange({ ...recipe, trim: whole ? null : next });
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <RangeField
          label="Start"
          min={0}
          max={duration}
          step={step}
          value={range.start}
          display={formatClock(range.start)}
          onChange={(start) => setTrim(start, range.end)}
        />
        <Button variant="secondary" size="sm" className="self-start border-edge font-medium" onClick={() => setTrim(playhead, range.end)}>
          Start at the playhead ({formatClock(playhead)})
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <RangeField
          label="End"
          min={0}
          max={duration}
          step={step}
          value={range.end}
          display={formatClock(range.end)}
          onChange={(end) => setTrim(range.start, end)}
        />
        <Button variant="secondary" size="sm" className="self-start border-edge font-medium" onClick={() => setTrim(range.start, playhead)}>
          End at the playhead ({formatClock(playhead)})
        </Button>
      </div>
      <p className="tnum text-[15px] text-ink-2">
        Keeps {formatSeconds(range.end - range.start)} of {formatSeconds(duration)}.
      </p>
      <Button variant="quiet" size="sm" className="-ml-3 self-start" disabled={!recipe.trim} onClick={() => onChange({ ...recipe, trim: null })}>
        Reset trim
      </Button>
    </div>
  );
}

// ── Output ────────────────────────────────────────────────────────────────────

export function OutputSummary({
  recipe,
  size,
  plan,
  duration,
  kind,
  recordingType,
}: {
  recipe: EditRecipe;
  size: Size;
  plan: RenderPlan;
  duration: number;
  kind: 'video' | 'image';
  recordingType: string | null;
}) {
  const id = useId();
  const changes = describeRecipe(recipe, size, kind === 'video' ? duration : undefined);
  const range = trimRange(recipe.trim, duration);
  return (
    <section aria-labelledby={id} className="rounded-md border border-rule bg-sheet p-4">
      <h3 id={id} className="text-base font-bold">
        Output
      </h3>
      <dl className="mt-2 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-[15px]">
        <dt className="text-ink-2">Size</dt>
        <dd className="tnum font-medium text-ink">
          {plan.width} × {plan.height} <span className="font-normal text-ink-2">· {describeAspect(plan.width, plan.height)}</span>
        </dd>
        {kind === 'video' && (
          <>
            <dt className="text-ink-2">Length</dt>
            <dd className="tnum font-medium text-ink">{formatSeconds(range.end - range.start)}</dd>
          </>
        )}
        <dt className="text-ink-2">File</dt>
        <dd className="font-medium text-ink">{kind === 'video' ? formatName(recordingType) : 'PNG image'}</dd>
      </dl>
      <p className="mt-3 text-sm font-semibold text-ink">Changes</p>
      {changes.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-0.5 text-[15px] text-ink-2">
          {changes.map((change) => (
            <li key={change.tool} className="flex gap-2">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-ink-3" />
              {change.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[15px] text-ink-2">None yet: this is the original picture.</p>
      )}
    </section>
  );
}

export const TOOL_NAMES: Record<EditTool, string> = {
  crop: 'Crop',
  reframe: 'Reframe',
  upscale: 'Upscale',
  trim: 'Trim',
};

/** One line per tool for the tool picker: what it is set to right now. */
export function toolState(tool: EditTool, recipe: EditRecipe, size: Size, plan: RenderPlan, duration: number): string {
  switch (tool) {
    case 'crop': {
      const px = clampCrop(cropToPixels(recipe.crop, size), size);
      return px.width === size.width && px.height === size.height ? 'Full frame' : `${px.width} × ${px.height}`;
    }
    case 'reframe':
      return recipe.frame === 'crop' ? 'Off' : `${recipe.frame} ${recipe.fit === 'fill' ? 'fill' : 'fit'}`;
    case 'upscale':
      return plan.upscale > 1 ? formatFactor(plan.upscale) : 'Off';
    case 'trim': {
      const range = trimRange(recipe.trim, duration);
      return recipe.trim ? formatSeconds(range.end - range.start) : 'Off';
    }
  }
}
