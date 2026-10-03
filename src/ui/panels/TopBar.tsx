import { motion } from 'framer-motion';
import { Scissors, Coins, RotateCcw } from 'lucide-react';
import { actions, useAvailableCredits, useCredits, useHasTakes, useStoryStore } from '@/store';
import { Kbd } from '@/ui/components/ui';
import { tBase } from '@/lib/motion';

export function TopBar({ onOpenPalette, showActions = true }: { onOpenPalette: () => void; showActions?: boolean }) {
  const takeCredits = useCredits();
  const takeAvailable = useAvailableCredits();
  const storyCredits = useStoryStore((state) => state.credits);
  const credits = showActions ? takeCredits : storyCredits;
  const available = showActions ? takeAvailable : storyCredits;
  const reserved = credits - available;
  const hasTakes = useHasTakes();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-glow">
            <Scissors className="h-4 w-4 text-white" aria-hidden />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-fg">Cutroom</span>
          <span className="hidden text-xs text-fg-subtle sm:block">generation as editing</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {showActions && <button
            onClick={onOpenPalette}
            className="hidden cursor-pointer items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2 text-sm text-fg-muted transition-colors hover:border-border-strong hover:text-fg sm:flex"
          >
            <span>Search actions</span>
            <span className="flex items-center gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>}

          <div
            title={reserved > 0 ? `${available} available · ${reserved} held for a render in progress` : `${available} ${showActions ? '' : 'story '}credits available`}
            className="flex items-center gap-2 rounded-xl border border-border bg-white/[0.03] px-3 py-2"
          >
            <Coins className="h-4 w-4 text-warning" aria-hidden />
            <motion.span
              key={available}
              initial={{ y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: tBase }}
              className="tnum text-sm font-semibold text-fg"
            >
              {available}
            </motion.span>
            <span className="hidden text-xs text-fg-subtle sm:block">{showActions ? 'credits' : 'story credits'}</span>
            {reserved > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse-soft" aria-hidden />}
          </div>

          {showActions && hasTakes && (
            <button
              onClick={() => actions.reset()}
              title="Start a new session"
              aria-label="Start a new session"
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-border bg-white/[0.03] text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
