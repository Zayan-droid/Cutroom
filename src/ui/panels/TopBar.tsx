import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { actions, useAvailableCredits, useCredits, useProjectStore, useStoryStore } from '@/store';
import { BrandMark } from '@/ui/components/Glyph';
import { Button } from '@/ui/components/ui';
import { ConfirmDialog } from '@/ui/components/ConfirmDialog';
import { useTheme, type Theme } from '@/ui/hooks/useTheme';
import { cn } from '@/lib/cn';
import { tQuick } from '@/lib/motion';

export type Mode = 'takes' | 'edit' | 'story';

// Short names below 1024px keep three tabs, the credits, and the theme switch on screen at 320px.
const MODES: Array<{ id: Mode; label: string; short: string }> = [
  { id: 'takes', label: 'Video takes', short: 'Takes' },
  { id: 'edit', label: 'Edit video', short: 'Edit' },
  { id: 'story', label: 'Story studio', short: 'Story' },
];

export function TopBar({ mode, onModeChange }: { mode: Mode; onModeChange: (mode: Mode) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/80 bg-paper">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-1 px-4 sm:px-6">
        <div className="flex h-14 items-center gap-2.5">
          <BrandMark />
          <span className="stretch-wide text-[19px] font-bold tracking-tight">Cutroom</span>
        </div>

        {/* On phones the workspace tabs drop to a second row, which also holds the theme switch. */}
        <div className="order-last flex w-full items-center md:order-none md:w-auto">
          <nav aria-label="Workspace" className="-mx-1 flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-current={mode === m.id ? 'page' : undefined}
                aria-label={m.label}
                onClick={() => onModeChange(m.id)}
                className={cn(
                  'tap relative h-11 px-2 text-[15px] font-semibold transition-colors md:h-14',
                  mode === m.id ? 'text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                <span className="lg:hidden">{m.short}</span>
                <span className="hidden lg:inline">{m.label}</span>
                {mode === m.id && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[3px] bg-ink" />}
              </button>
            ))}
          </nav>
          <ThemeSwitch className="ml-auto sm:hidden" />
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <CreditReadout mode={mode} />
          <ThemeSwitch className="hidden sm:flex" />
          {mode === 'takes' && <NewSession />}
        </div>
      </div>
    </header>
  );
}

function CreditReadout({ mode }: { mode: Mode }) {
  const takeCredits = useCredits();
  const takeAvailable = useAvailableCredits();
  const storyCredits = useStoryStore((s) => s.credits);
  // Edits are part of the takes project, so the edit tab shows the same balance.
  const story = mode === 'story';
  const available = story ? storyCredits : takeAvailable;
  const held = story ? 0 : takeCredits - takeAvailable;

  return (
    <div className="flex items-baseline gap-1.5" aria-live="polite">
      <span className="text-sm text-ink-2">{story ? 'Story credits' : 'Credits'}</span>
      <span className="relative inline-block min-w-[2ch] overflow-hidden text-right">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={available}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: tQuick }}
            exit={{ y: 10, opacity: 0, transition: tQuick }}
            className="tnum inline-block text-lg font-bold"
          >
            {available}
          </motion.span>
        </AnimatePresence>
      </span>
      {held > 0 && (
        <span className="tnum text-[13px] font-medium text-warn">
          ({held} held<span className="hidden sm:inline"> for a render</span>)
        </span>
      )}
    </div>
  );
}

function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const options: Array<{ id: Theme; label: string }> = [
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  return (
    <div role="group" aria-label="Color theme" className={cn('flex rounded border border-edge', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={theme === o.id}
          onClick={() => setTheme(o.id)}
          className={cn(
            'h-8 px-2.5 text-[13px] font-semibold transition-colors first:rounded-l-sm last:rounded-r-sm',
            theme === o.id ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewSession() {
  const count = useProjectStore((s) => s.takes.length);
  const [confirming, setConfirming] = useState(false);
  if (count === 0) return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
        New session
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Start a new session?"
        confirmLabel={`Clear ${count} ${count === 1 ? 'take' : 'takes'}`}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          actions.reset();
        }}
      >
        This clears every take and its version history from this browser and resets the demo credit
        balance. It can't be undone.
      </ConfirmDialog>
    </>
  );
}
