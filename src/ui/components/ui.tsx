import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { costLabel } from '@/lib/cost';
import type { TakeStatus } from '@/types';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<ButtonVariant, string> = {
  // The accent is reserved for the one action that moves the work forward.
  primary: 'bg-mark text-on-mark enabled:hover:bg-mark/90 disabled:bg-ink/15 disabled:text-ink-3',
  secondary: 'border border-ink/70 bg-transparent text-ink enabled:hover:bg-ink/[0.06] disabled:border-edge/60 disabled:text-ink-3',
  quiet: 'bg-transparent text-ink-2 enabled:hover:bg-ink/[0.06] enabled:hover:text-ink disabled:text-ink-3',
  danger: 'bg-bad text-sheet enabled:hover:bg-bad/90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-2',
  md: 'h-11 px-4 text-[15px] gap-2',
  lg: 'h-12 px-5 text-base gap-2.5',
  icon: 'h-11 w-11 justify-center',
};

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', leftIcon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'tap inline-flex select-none items-center justify-center rounded font-semibold',
        'transition-colors duration-150 ease-out active:translate-y-px',
        'disabled:cursor-not-allowed disabled:active:translate-y-0',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="tnum inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-edge/70 bg-sheet px-1.5 font-sans text-xs font-semibold text-ink-2">
      {children}
    </kbd>
  );
}

/** A price as plain text. Inside a button it sits after a thin divider. */
export function Cost({ cost, className }: { cost: number; className?: string }) {
  return <span className={cn('tnum font-medium', className)}>{costLabel(cost)}</span>;
}

/** Cost appended to a button label: "Render final | 8 credits". */
export function ButtonCost({ cost }: { cost: number }) {
  return (
    <>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-current opacity-40" />
      <span className="tnum font-medium">{costLabel(cost)}</span>
    </>
  );
}

const STATUS_META: Record<TakeStatus, { label: string; text: string }> = {
  queued: { label: 'Queued', text: 'text-ink-3' },
  generating: { label: 'Generating', text: 'text-ink-2' },
  ready: { label: 'Ready', text: 'text-ok' },
  failed: { label: 'Failed', text: 'text-bad' },
};

/** Empty, half, and full squares: the shape says it before the color does. */
function StatusSquare({ status }: { status: TakeStatus }) {
  return (
    <span aria-hidden className="relative h-2 w-2 shrink-0 border border-current">
      {status === 'generating' && <span className="absolute inset-x-0 bottom-0 h-1/2 bg-current" />}
      {(status === 'ready' || status === 'failed') && <span className="absolute inset-0 bg-current" />}
    </span>
  );
}

/** Status as words plus a small square: shape and text carry it, color confirms it. */
export function Status({ status, progress, className }: { status: TakeStatus; progress?: number; className?: string }) {
  const m = STATUS_META[status];
  const pct = status === 'generating' && progress !== undefined ? ` ${Math.round(progress * 100)}%` : '';
  return (
    <span className={cn('tnum inline-flex items-center gap-1.5 text-[13px] font-medium', m.text, className)}>
      <StatusSquare status={status} />
      {m.label}
      {pct}
    </span>
  );
}

/** Form label: sentence case, readable size — never a tiny all-caps tag. */
export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('text-sm font-semibold text-ink', className)}>
      {children}
    </label>
  );
}
