import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, Sparkles, Clapperboard, Shuffle, RotateCcw, Plus,
  Film, Gauge, Maximize, Palette, Eraser, Captions, type LucideIcon,
} from 'lucide-react';
import { actions, useActiveTake, useAvailableCredits } from '@/store';
import { toast } from '@/store/toast';
import type { Intent, IntentKind } from '@/types';
import { quote } from '@/lib/cost';
import { tFast } from '@/lib/motion';
import { cn } from '@/lib/cn';

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: 'Actions' | 'Effects & apps';
  Icon: LucideIcon;
  disabled?: boolean;
  run: () => void;
}

const SURPRISES: Array<{ prompt: string; kind: IntentKind }> = [
  { prompt: 'A lone astronaut drifting past a neon ringed planet', kind: 'cinematic' },
  { prompt: 'Sleek wireless earbuds rotating on a marble pedestal', kind: 'ad' },
  { prompt: 'Skater landing a kickflip in golden-hour haze', kind: 'social' },
];

const intentOf = (prompt: string, kind: IntentKind): Intent => ({
  kind,
  subject: prompt,
  style: '',
  motion: '',
  mood: '',
});

const EFFECTS: Array<{ label: string; Icon: LucideIcon }> = [
  { label: 'Film grain', Icon: Film },
  { label: 'Slow motion', Icon: Gauge },
  { label: 'Upscale to 4K', Icon: Maximize },
  { label: 'Color grade', Icon: Palette },
  { label: 'Remove background', Icon: Eraser },
  { label: 'Auto captions', Icon: Captions },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const active = useActiveTake();
  const avail = useAvailableCredits();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const ready = active?.status === 'ready';
    const isDraft = active?.kind === 'draft';
    const renderCost = active ? quote('render', active.intent.kind) : 0;

    const wrap = (fn: () => void) => () => {
      fn();
      onClose();
    };

    const list: Command[] = [
      {
        id: 'surprise',
        label: 'Surprise me — draft now',
        hint: 'Free · 4 takes',
        group: 'Actions',
        Icon: Sparkles,
        run: wrap(() => {
          const s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
          actions.submitDraft(s.prompt, intentOf(s.prompt, s.kind));
        }),
      },
      {
        id: 'render',
        label: 'Render current take',
        hint: ready && isDraft ? `${renderCost} cr` : 'Select a ready draft',
        group: 'Actions',
        Icon: Clapperboard,
        disabled: !(ready && isDraft && avail >= renderCost),
        run: wrap(() => actions.render()),
      },
      {
        id: 'remix',
        label: 'Remix current take',
        hint: ready ? 'Free · 4 variants' : 'Select a ready take',
        group: 'Actions',
        Icon: Shuffle,
        disabled: !ready,
        run: wrap(() => {
          if (active) actions.remix(active.id);
          toast('Spun four variants.');
        }),
      },
      {
        id: 'reroll',
        label: 'Reroll failed take',
        hint: active?.status === 'failed' ? 'Free' : 'No failed take selected',
        group: 'Actions',
        Icon: RotateCcw,
        disabled: active?.status !== 'failed',
        run: wrap(() => {
          if (active) actions.retry(active.id);
          toast('Reroll — no charge.', 'success');
        }),
      },
      {
        id: 'reset',
        label: 'Start a new session',
        group: 'Actions',
        Icon: Plus,
        run: wrap(() => actions.reset()),
      },
      ...EFFECTS.map((e) => ({
        id: `fx-${e.label}`,
        label: e.label,
        hint: 'Effects library — P2',
        group: 'Effects & apps' as const,
        Icon: e.Icon,
        run: wrap(() => toast(`${e.label} — the effects library is out of scope (this is the palette shell).`)),
      })),
    ];
    return list;
  }, [active, avail, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => setIndex(0), [query]);

  const move = (delta: number) => {
    setIndex((i) => {
      let next = i;
      for (let step = 0; step < filtered.length; step++) {
        next = (next + delta + filtered.length) % filtered.length;
        if (!filtered[next]?.disabled) return next;
      }
      return i;
    });
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[index];
      if (cmd && !cmd.disabled) cmd.run();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let flat = -1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={tFast}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={tFast}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-strong bg-surface-2/95 shadow-card backdrop-blur-xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-fg-subtle" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search actions, effects, apps…"
                className="h-12 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-subtle/70 focus:outline-none"
              />
            </div>

            <div className="thin-scroll max-h-[54vh] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-fg-subtle">No matches.</p>
              )}
              {(['Actions', 'Effects & apps'] as const).map((group) => {
                const items = filtered.filter((c) => c.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group} className="mb-1">
                    <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
                      {group}
                    </p>
                    {items.map((c) => {
                      flat += 1;
                      const highlighted = flat === index;
                      return (
                        <button
                          key={c.id}
                          disabled={c.disabled}
                          onMouseMove={() => setIndex(filtered.indexOf(c))}
                          onClick={c.run}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                            c.disabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'cursor-pointer',
                            highlighted && !c.disabled ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]',
                          )}
                        >
                          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-fg-muted">
                            <c.Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="flex-1 text-sm font-medium text-fg">{c.label}</span>
                          {c.hint && <span className="text-xs text-fg-subtle">{c.hint}</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
