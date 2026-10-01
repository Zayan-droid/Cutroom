import { motion } from 'framer-motion';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { tPress } from '@/lib/motion';
import type { TakeStatus } from '@/types';
import { costLabel } from '@/lib/cost';

type ButtonVariant = 'primary' | 'accent' | 'subtle' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-primary to-primary-600 text-white shadow-[0_6px_24px_-8px_rgba(236,72,153,0.6)] hover:shadow-glow',
  accent:
    'bg-gradient-to-b from-accent to-accent-600 text-white shadow-[0_6px_24px_-8px_rgba(99,102,241,0.6)] hover:shadow-glow-accent',
  subtle: 'bg-white/[0.06] text-fg border border-border-strong hover:bg-white/[0.10]',
  ghost: 'bg-transparent text-fg-muted hover:text-fg hover:bg-white/[0.06]',
  danger: 'bg-danger-600/90 text-white hover:bg-danger-600',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-5 text-[15px] rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-xl justify-center',
};

interface ButtonProps extends Omit<ComponentPropsWithoutRef<typeof motion.button>, 'ref' | 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = 'subtle',
  size = 'md',
  loading = false,
  leftIcon,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <motion.button
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={tPress}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-medium tracking-tight',
        'transition-colors duration-200 ease-expo cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
    </motion.button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="tnum rounded-md border border-border-strong bg-white/[0.04] px-1.5 py-0.5 text-[11px] font-medium text-fg-muted">
      {children}
    </kbd>
  );
}

export function CostChip({ cost, className }: { cost: number; className?: string }) {
  const free = cost === 0;
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        free
          ? 'border-success/30 bg-success/10 text-success'
          : 'border-accent/30 bg-accent/10 text-accent',
        className,
      )}
    >
      {costLabel(cost)}
    </span>
  );
}

const STATUS_META: Record<TakeStatus, { label: string; dot: string; text: string }> = {
  queued: { label: 'Queued', dot: 'bg-fg-subtle', text: 'text-fg-subtle' },
  generating: { label: 'Generating', dot: 'bg-accent', text: 'text-accent' },
  ready: { label: 'Ready', dot: 'bg-success', text: 'text-success' },
  failed: { label: 'Failed', dot: 'bg-danger', text: 'text-danger' },
};

export function StatusPill({ status }: { status: TakeStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', m.text)}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          m.dot,
          (status === 'generating' || status === 'queued') && 'animate-pulse-soft',
        )}
      />
      {m.label}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} aria-hidden />;
}
