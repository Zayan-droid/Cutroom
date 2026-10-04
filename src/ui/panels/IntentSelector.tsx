import { useId } from 'react';
import { cn } from '@/lib/cn';
import { costLabel, quote } from '@/lib/cost';
import { ratioLabel } from '@/lib/media';
import type { IntentKind } from '@/types';

const OPTIONS: Array<{ kind: IntentKind; label: string; shape: string; orientation: string }> = [
  { kind: 'social', label: 'Social', shape: 'h-[18px] w-[10px]', orientation: 'vertical' },
  { kind: 'ad', label: 'Product ad', shape: 'h-[18px] w-[15px]', orientation: 'portrait' },
  { kind: 'cinematic', label: 'Cinematic', shape: 'h-[15px] w-[27px]', orientation: 'widescreen' },
];

/** The frame drawn at its true proportions, so the choice is visible, not just named. */
function FrameShape({ className }: { className: string }) {
  return (
    <span aria-hidden className="grid h-[18px] w-[28px] shrink-0 place-items-center">
      <span className={cn('border-2 border-current', className)} />
    </span>
  );
}

/**
 * Output format (the intent) as native radio buttons — arrow keys move between
 * options. `full` also prints each format's ratio and render price.
 */
export function IntentSelector({
  value,
  onChange,
  size = 'full',
  legend = 'Format',
  hideLegend = false,
}: {
  value: IntentKind;
  onChange: (k: IntentKind) => void;
  size?: 'full' | 'compact';
  legend?: string;
  hideLegend?: boolean;
}) {
  const name = useId();
  const full = size === 'full';
  return (
    <fieldset className="min-w-0">
      <legend className={cn('mb-2 text-sm font-semibold text-ink', hideLegend && 'sr-only')}>{legend}</legend>
      <div className={cn('grid rounded border border-edge', full ? 'w-full grid-cols-1 sm:grid-cols-3' : 'w-max grid-cols-3')}>
        {OPTIONS.map((o) => {
          const price = costLabel(quote('render', o.kind));
          return (
            <label
              key={o.kind}
              className={cn(
                'relative min-w-0 cursor-pointer border-edge',
                full
                  ? 'border-t first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0'
                  : 'border-l first:border-l-0',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.kind}
                checked={value === o.kind}
                onChange={() => onChange(o.kind)}
                className="peer sr-only"
              />
              <span
                title={full ? undefined : `${o.label} · ${ratioLabel(o.kind)} ${o.orientation} · render ${price}`}
                className={cn(
                  'flex items-center gap-2.5 text-ink-2 transition-colors duration-150',
                  'hover:bg-ink/[0.05] hover:text-ink',
                  'peer-checked:bg-ink peer-checked:text-paper',
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
                  full ? 'h-full min-h-12 px-3 py-2 sm:min-h-[60px]' : 'h-[42px] px-3',
                )}
              >
                <FrameShape className={o.shape} />
                {full ? (
                  // One line on phones, two on wider screens; the price is always shown.
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 sm:block">
                    <span className="block text-[15px] font-semibold leading-tight">{o.label}</span>
                    <span className="tnum block text-[13px] leading-tight opacity-80">
                      {ratioLabel(o.kind)} · render {price}
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 whitespace-nowrap text-[15px] font-semibold leading-tight">
                    {/* Phones get the ratio; wider screens get the name. Both are announced. */}
                    <span aria-hidden className="tnum sm:hidden">{ratioLabel(o.kind)}</span>
                    <span className="hidden sm:inline">{o.label}</span>
                    <span className="sr-only">
                      <span className="sm:hidden">{o.label}</span>, {ratioLabel(o.kind)} {o.orientation}, render {price}
                    </span>
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
