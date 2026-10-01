import { motion } from 'framer-motion';
import { Smartphone, ShoppingBag, Clapperboard } from 'lucide-react';
import { cn } from '@/lib/cn';
import { tSpring } from '@/lib/motion';
import type { IntentKind } from '@/types';

const OPTIONS: Array<{ kind: IntentKind; label: string; hint: string; Icon: typeof Smartphone }> = [
  { kind: 'social', label: 'Social', hint: 'Vertical short', Icon: Smartphone },
  { kind: 'ad', label: 'Ad', hint: 'Product spot', Icon: ShoppingBag },
  { kind: 'cinematic', label: 'Cinematic', hint: 'Widescreen clip', Icon: Clapperboard },
];

export function IntentSelector({
  value,
  onChange,
  size = 'md',
}: {
  value: IntentKind;
  onChange: (k: IntentKind) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Intent"
      className="inline-flex gap-1 rounded-xl border border-border bg-black/20 p-1"
    >
      {OPTIONS.map(({ kind, label, hint, Icon }) => {
        const active = value === kind;
        return (
          <button
            key={kind}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(kind)}
            title={hint}
            className={cn(
              'relative flex cursor-pointer items-center gap-2 rounded-lg font-medium transition-colors duration-200 ease-expo',
              size === 'md' ? 'px-3.5 py-2 text-sm' : 'px-2.5 py-1.5 text-[13px]',
              active ? 'text-white' : 'text-fg-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId="intent-active"
                transition={tSpring}
                className="absolute inset-0 rounded-lg bg-gradient-to-b from-primary to-primary-600 shadow-[0_6px_20px_-8px_rgba(236,72,153,0.7)]"
              />
            )}
            <Icon className="relative z-10 h-4 w-4" aria-hidden />
            <span className="relative z-10">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
