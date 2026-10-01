import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownRight, Film, Layers, GitBranch } from 'lucide-react';
import { useRail, type RailEntry } from '@/store';
import { StatusPill, CostChip } from '@/ui/components/ui';
import { tBase, tFast } from '@/lib/motion';
import { cn } from '@/lib/cn';

function RailRow({ entry, onSelect }: { entry: RailEntry; onSelect: (id: string) => void }) {
  const { take, depth, isActive, isAncestor } = entry;
  const Icon = take.kind === 'render' ? Film : Layers;
  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0, transition: tBase }}
      exit={{ opacity: 0, x: 6, transition: tFast }}
      onClick={() => onSelect(take.id)}
      style={{ paddingLeft: 8 + depth * 15 }}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-lg border py-2 pr-2 text-left transition-colors duration-200',
        isActive
          ? 'border-primary/50 bg-primary/10'
          : isAncestor
            ? 'border-transparent bg-white/[0.03] hover:bg-white/[0.06]'
            : 'border-transparent hover:bg-white/[0.05]',
      )}
    >
      {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />}
      <span
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-md',
          isActive ? 'bg-primary/20 text-primary' : 'bg-white/[0.05] text-fg-muted',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-[13px] font-medium', isActive ? 'text-fg' : 'text-fg-muted')}>
          {take.label ?? (take.kind === 'render' ? 'Render' : 'Draft')}
        </span>
        <StatusPill status={take.status} />
      </span>
      {take.kind === 'render' && take.cost > 0 && <CostChip cost={take.cost} />}
    </motion.button>
  );
}

export function VersionRail({ onSelect }: { onSelect: (id: string) => void }) {
  const rail = useRail();

  return (
    <motion.aside
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0, transition: tBase }}
      className="flex flex-col rounded-2xl border border-border bg-surface/50 backdrop-blur-md lg:h-[calc(100vh-140px)] lg:sticky lg:top-[100px]"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <GitBranch className="h-4 w-4 text-fg-muted" aria-hidden />
        <h2 className="text-sm font-semibold text-fg">Version rail</h2>
        <span className="ml-auto tnum rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-fg-muted">
          {rail.length}
        </span>
      </header>

      <div className="thin-scroll flex max-h-64 flex-col gap-1 overflow-y-auto p-2 lg:max-h-none lg:flex-1">
        <AnimatePresence initial={false}>
          {rail.map((entry) => (
            <RailRow key={entry.take.id} entry={entry} onSelect={onSelect} />
          ))}
        </AnimatePresence>
      </div>

      <footer className="border-t border-border px-4 py-2.5">
        <p className="text-[11px] leading-relaxed text-fg-subtle">
          Every take is kept. Branch from any good state — you never lose your way back.
        </p>
      </footer>
    </motion.aside>
  );
}
