import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

// Form controls for the editor, matching the rest of Cutroom: native radios
// drawn as joined rectangles, labeled number fields, and plain sliders.

export interface Choice<T extends string> {
  value: T;
  label: string;
  /** Second line: a ratio, a size, what the option does. */
  detail?: string;
  /** Picture shape drawn beside the label (width / height), or 'free'. */
  shape?: number | 'free';
  disabled?: boolean;
  /** Take a whole row (e.g. a "no change" option above a grid of shapes). */
  wide?: boolean;
}

/** A frame drawn at its true proportions inside a fixed box. */
export function RatioShape({ aspect }: { aspect: number | 'free' }) {
  const box = { width: 24, height: 18 };
  const free = aspect === 'free';
  const a = free ? 1.25 : aspect;
  const width = a >= box.width / box.height ? box.width : Math.round(box.height * a);
  const height = a >= box.width / box.height ? Math.round(box.width / a) : box.height;
  return (
    <span aria-hidden className="grid h-[18px] w-6 shrink-0 place-items-center">
      <span className={cn('border-2 border-current', free && 'border-dashed')} style={{ width, height }} />
    </span>
  );
}

/**
 * Single choice as native radios (arrow keys move between options), drawn as
 * one bordered strip. `columns` sets the grid; long lists wrap into rows.
 */
export function Segmented<T extends string>({
  legend,
  options,
  value,
  onChange,
  columns = 'grid-cols-2',
  hint,
  disabled,
}: {
  legend: string;
  options: Array<Choice<T>>;
  value: T;
  onChange: (value: T) => void;
  columns?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const name = useId();
  const hintId = useId();
  return (
    <fieldset className="min-w-0" disabled={disabled} aria-describedby={hint ? hintId : undefined}>
      <legend className="mb-2 text-sm font-semibold text-ink">{legend}</legend>
      <div className={cn('grid gap-px rounded border border-edge bg-edge', columns)}>
        {options.map((o) => (
          <label key={o.value} className={cn('relative min-w-0 bg-sheet', o.wide && 'col-span-full', o.disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex h-full min-h-11 items-center gap-2.5 px-3 py-2 text-ink-2 transition-colors duration-150',
                'hover:bg-ink/[0.05] hover:text-ink',
                'peer-checked:bg-ink peer-checked:text-paper',
                // Drawn outside the option and above its neighbours, so it shows on checked (ink) options too.
                'peer-focus-visible:relative peer-focus-visible:z-10 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                'peer-disabled:bg-sheet peer-disabled:text-ink-3 peer-disabled:hover:bg-sheet',
              )}
            >
              {o.shape !== undefined && <RatioShape aspect={o.shape} />}
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold leading-tight">{o.label}</span>
                {o.detail && <span className="tnum block text-[13px] leading-tight opacity-85">{o.detail}</span>}
              </span>
            </span>
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="mt-2 text-[13px] leading-snug text-ink-2">
          {hint}
        </p>
      )}
    </fieldset>
  );
}

const fieldClass =
  'tnum h-11 w-full min-w-0 rounded border border-edge bg-field px-3 text-[15px] text-ink focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink disabled:opacity-60';

/**
 * A whole number with a unit. It commits on Enter or when focus leaves, so a
 * half-typed value never fights the picture; Escape puts the old value back.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  unit,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Math.round(Number(draft));
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(String(value));
            }
          }}
          className={cn(fieldClass, 'pr-10')}
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-ink-3">
          {unit}
        </span>
      </div>
    </div>
  );
}

/** A labeled slider whose current value is printed beside its label. */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  display,
  valueText,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Shown beside the label. */
  display: string;
  /** Read by screen readers; defaults to `display`. */
  valueText?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <span className="tnum text-[13px] font-medium text-ink-2">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText ?? display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="scrubber mt-1"
        style={{ '--pct': `${pct}%` } as CSSProperties}
      />
    </div>
  );
}
