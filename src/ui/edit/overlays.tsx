import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  clamp,
  cropToFractions,
  cropToPixels,
  moveCrop,
  resizeCrop,
  type CropHandle,
  type Rect,
  type RenderPlan,
  type Size,
} from '@/edit/geometry';
import type { EditRecipe } from '@/types';
import { cn } from '@/lib/cn';

// Direct manipulation on the picture. Colors here sit on footage, so they are
// fixed light/dark values rather than theme tokens (like the dialog scrim).

const SCRIM = 'rgb(26 24 20 / 0.58)';

const HANDLES: Array<{ id: CropHandle; x: number; y: number; cursor: string; name: string }> = [
  { id: 'nw', x: 0, y: 0, cursor: 'cursor-nwse-resize', name: 'top-left corner' },
  { id: 'n', x: 50, y: 0, cursor: 'cursor-ns-resize', name: 'top edge' },
  { id: 'ne', x: 100, y: 0, cursor: 'cursor-nesw-resize', name: 'top-right corner' },
  { id: 'e', x: 100, y: 50, cursor: 'cursor-ew-resize', name: 'right edge' },
  { id: 'se', x: 100, y: 100, cursor: 'cursor-nwse-resize', name: 'bottom-right corner' },
  { id: 's', x: 50, y: 100, cursor: 'cursor-ns-resize', name: 'bottom edge' },
  { id: 'sw', x: 0, y: 100, cursor: 'cursor-nesw-resize', name: 'bottom-left corner' },
  { id: 'w', x: 0, y: 50, cursor: 'cursor-ew-resize', name: 'left edge' },
];

const pct = (n: number) => `${n * 100}%`;

/**
 * The crop box over the whole source picture: drag inside to move it, drag a
 * handle to resize (keeping the shape lock), or focus it and use the arrow
 * keys. Exact sizes are typed in the crop panel. `guide` outlines the part a
 * reframe will keep, as fractions of the source.
 */
export function CropOverlay({
  size,
  crop,
  aspect,
  guide,
  onChange,
}: {
  size: Size;
  crop: EditRecipe['crop'];
  aspect: number | null;
  guide?: EditRecipe['crop'] | null;
  onChange: (crop: EditRecipe['crop']) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: CropHandle | 'move'; x: number; y: number; start: Rect; sx: number; sy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const px = cropToPixels(crop, size);

  const begin = (handle: CropHandle | 'move') => (e: PointerEvent) => {
    if (e.button !== 0 || !root.current) return;
    e.preventDefault();
    e.stopPropagation();
    const box = root.current.getBoundingClientRect();
    drag.current = { handle, x: e.clientX, y: e.clientY, start: px, sx: size.width / box.width, sy: size.height / box.height };
    root.current.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * d.sx;
    const dy = (e.clientY - d.y) * d.sy;
    const next = d.handle === 'move' ? moveCrop(d.start, dx, dy, size) : resizeCrop(d.start, d.handle, dx, dy, size, aspect);
    onChange(cropToFractions(next, size));
  };
  const end = (e: PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (root.current?.hasPointerCapture(e.pointerId)) root.current.releasePointerCapture(e.pointerId);
  };
  const onKey = (e: KeyboardEvent) => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key];
    if (!step || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    // One percent of the frame per press; ten with Shift.
    const k = e.shiftKey ? 10 : 1;
    const dx = step[0] * k * Math.max(1, Math.round(size.width / 100));
    const dy = step[1] * k * Math.max(1, Math.round(size.height / 100));
    onChange(cropToFractions(moveCrop(px, dx, dy, size), size));
  };

  return (
    <div
      ref={root}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className="absolute inset-0 touch-none select-none overflow-hidden"
    >
      {/* Everything outside the crop is dimmed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.width), height: pct(crop.height), boxShadow: `0 0 0 9999px ${SCRIM}` }}
      />
      {guide && (
        <div
          aria-hidden
          className="pointer-events-none absolute border border-dashed border-white/90"
          style={{ left: pct(guide.x), top: pct(guide.y), width: pct(guide.width), height: pct(guide.height) }}
        />
      )}
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="crop area"
        aria-label={`Crop area, ${Math.round(px.width)} by ${Math.round(px.height)} pixels, ${Math.round(px.x)} from the left and ${Math.round(px.y)} from the top`}
        aria-describedby={hintId}
        onPointerDown={begin('move')}
        onKeyDown={onKey}
        className={cn(
          'absolute cursor-move outline-none',
          // White and dark rings keep the box visible on any footage; focus thickens them.
          'shadow-[0_0_0_1px_rgb(255_255_255),0_0_0_2px_rgb(26_24_20/0.7)]',
          'focus-visible:shadow-[0_0_0_2px_rgb(255_255_255),0_0_0_4px_rgb(26_24_20)]',
        )}
        style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.width), height: pct(crop.height) }}
      >
        <span id={hintId} className="sr-only">
          Use the arrow keys to move the crop; hold Shift to move it faster. Type exact sizes in the crop settings.
        </span>
        {dragging && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            {[1, 2].map((n) => (
              <span key={`v${n}`} className="absolute inset-y-0 w-px bg-white/45" style={{ left: `${(n * 100) / 3}%` }} />
            ))}
            {[1, 2].map((n) => (
              <span key={`h${n}`} className="absolute inset-x-0 h-px bg-white/45" style={{ top: `${(n * 100) / 3}%` }} />
            ))}
          </span>
        )}
        {HANDLES.map((h) => (
          <span
            key={h.id}
            aria-hidden
            onPointerDown={begin(h.id)}
            title={`Drag the ${h.name}`}
            className={cn(
              'absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
              h.cursor,
            )}
            style={{ left: `${h.x}%`, top: `${h.y}%` }}
          >
            <span className="h-3 w-3 border border-[rgb(26_24_20)] bg-white" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** How the reframed picture can move: along x or y, and how far in output pixels. */
export function panAxis(plan: RenderPlan, recipe: EditRecipe, size: Size): { axis: 'x' | 'y'; travel: number } | null {
  if (recipe.frame === 'crop') return null;
  if (recipe.fit === 'fill') {
    const crop = cropToPixels(recipe.crop, size);
    const sx = crop.width - plan.src.width;
    const sy = crop.height - plan.src.height;
    if (sx > 0.5) return { axis: 'x', travel: sx * plan.scale };
    if (sy > 0.5) return { axis: 'y', travel: sy * plan.scale };
    return null;
  }
  const sx = plan.width - plan.dst.width;
  const sy = plan.height - plan.dst.height;
  if (sx > 0.5) return { axis: 'x', travel: sx };
  if (sy > 0.5) return { axis: 'y', travel: sy };
  return null;
}

/**
 * Drag the reframed picture to choose what stays in view (fill) or where it
 * sits between the bars (fit). The position slider in the panel does the same
 * from the keyboard, so this layer is pointer-only.
 */
export function PanOverlay({
  plan,
  recipe,
  size,
  onChange,
}: {
  plan: RenderPlan;
  recipe: EditRecipe;
  size: Size;
  onChange: (position: EditRecipe['position']) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; start: EditRecipe['position']; perPixel: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const pan = panAxis(plan, recipe, size);
  if (!pan) return null;

  const begin = (e: PointerEvent) => {
    if (e.button !== 0 || !root.current) return;
    e.preventDefault();
    const box = root.current.getBoundingClientRect();
    // Screen pixels → output pixels → position units. Fill moves the window, so the picture follows the pointer.
    const outputPerScreen = plan.width / box.width;
    const sign = recipe.fit === 'fill' ? -1 : 1;
    drag.current = { x: e.clientX, y: e.clientY, start: recipe.position, perPixel: (sign * outputPerScreen) / pan.travel };
    root.current.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const delta = pan.axis === 'x' ? e.clientX - d.x : e.clientY - d.y;
    const value = clamp(d.start[pan.axis] + delta * d.perPixel, 0, 1);
    onChange({ ...d.start, [pan.axis]: value });
  };
  const end = (e: PointerEvent) => {
    drag.current = null;
    setDragging(false);
    if (root.current?.hasPointerCapture(e.pointerId)) root.current.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={root}
      aria-hidden
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      title={pan.axis === 'x' ? 'Drag left or right to reposition' : 'Drag up or down to reposition'}
      className={cn('absolute inset-0 touch-none select-none', dragging ? 'cursor-grabbing' : 'cursor-grab')}
    />
  );
}
