import { AnimatePresence, motion } from 'framer-motion';
import { useRail, type RailEntry } from '@/store';
import { Cost, Status } from '@/ui/components/ui';
import { slideIn } from '@/lib/motion';
import { cn } from '@/lib/cn';

function Branch({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span aria-hidden className="flex shrink-0 self-stretch" style={{ paddingLeft: (depth - 1) * 14 }}>
      <span className="relative w-3.5">
        <span className="absolute left-1 top-0 h-1/2 w-2.5 border-b border-l border-edge" />
      </span>
    </span>
  );
}

function RailRow({ entry, index, onSelect }: { entry: RailEntry; index: number; onSelect: (id: string) => void }) {
  const { take, depth, isActive, isAncestor } = entry;
  const label = take.label ?? (take.kind === 'render' ? 'Render' : 'Draft');
  return (
    // No `layout` animation here: the panel is position: sticky, and layout
    // measurements taken while the page is scrolled leave rows offset.
    <motion.li variants={slideIn} initial="hidden" animate="show" exit="exit">
      <button
        type="button"
        onClick={() => onSelect(take.id)}
        aria-current={isActive ? 'true' : undefined}
        aria-label={`${label}, ${take.kind === 'render' ? 'final render' : 'draft'}, ${take.status}${isActive ? ', current' : ''}`}
        className={cn(
          'relative flex w-full items-stretch gap-2 py-2 pl-3 pr-3 text-left transition-colors duration-150',
          isActive ? 'bg-mark/[0.08]' : 'hover:bg-ink/[0.04]',
        )}
      >
        {isActive && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-mark" />}
        <span className="tnum w-6 shrink-0 pt-px text-[13px] text-ink-3">{String(index + 1).padStart(2, '0')}</span>
        <Branch depth={depth} />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-[15px]',
              isActive ? 'font-semibold text-ink' : isAncestor ? 'font-medium text-ink' : 'text-ink-2',
            )}
          >
            {label}
            {take.kind === 'render' && <span className="font-normal text-ink-3"> · final</span>}
          </span>
          <Status status={take.status} progress={take.progress} />
        </span>
        {take.kind === 'render' && take.cost > 0 && <Cost cost={take.cost} className="shrink-0 pt-px text-[13px] text-ink-2" />}
      </button>
    </motion.li>
  );
}

export function VersionRail({ onSelect }: { onSelect: (id: string) => void }) {
  const rail = useRail();

  return (
    <aside
      aria-labelledby="history-title"
      className="flex flex-col rounded-md border border-rule bg-sheet lg:sticky lg:top-[72px] lg:max-h-[calc(100vh-96px)] lg:self-start"
    >
      <header className="flex items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
        <h2 id="history-title" className="text-base font-bold">
          Version history
        </h2>
        <span className="tnum text-sm text-ink-2">
          {rail.length} {rail.length === 1 ? 'take' : 'takes'}
        </span>
      </header>

      <ol className="scroll-quiet max-h-72 divide-y divide-rule/70 overflow-y-auto overflow-x-hidden lg:max-h-none lg:flex-1">
        <AnimatePresence initial={false}>
          {rail.map((entry, i) => (
            <RailRow key={entry.take.id} entry={entry} index={i} onSelect={onSelect} />
          ))}
        </AnimatePresence>
      </ol>

      <footer className="border-t border-rule px-4 py-3">
        <p className="text-[13px] leading-snug text-ink-2">
          Nothing is deleted. Select any take to continue from it. Indented takes branched from the take they sit under.
        </p>
      </footer>
    </aside>
  );
}
