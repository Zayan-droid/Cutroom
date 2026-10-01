import { motion } from 'framer-motion';
import { Sparkles, Clapperboard, GitBranch, type LucideIcon } from 'lucide-react';
import { PromptForm } from './PromptForm';
import { fadeUp, gridContainer, gridItem } from '@/lib/motion';

const STEPS: Array<{ Icon: LucideIcon; title: string; text: string }> = [
  { Icon: Sparkles, title: 'Draft', text: 'Four cheap previews, free. See the look before you spend a credit.' },
  { Icon: Clapperboard, title: 'Render', text: 'Commit the one you like — the only step that costs credits.' },
  { Icon: GitBranch, title: 'Branch', text: 'Remix, nudge, or reroll. Every take stays on the rail.' },
];

export function LandScreen() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-3xl flex-col items-center justify-center px-4 py-10">
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="mb-7 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1 text-xs font-medium text-fg-muted">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          Generation, reframed as editing
        </span>
        <h1 className="mt-4 text-balance text-3xl font-bold leading-tight tracking-tight text-fg sm:text-[40px]">
          Steer it. Preview it.{' '}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Commit once.
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          Describe what you want. Cutroom drafts four cheap takes, you pick a direction, and only the
          final render spends credits. Never gamble in the dark.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="show" className="w-full">
        <PromptForm variant="hero" />
      </motion.div>

      <motion.div
        variants={gridContainer}
        initial="hidden"
        animate="show"
        className="mt-8 grid w-full grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {STEPS.map(({ Icon, title, text }) => (
          <motion.div
            key={title}
            variants={gridItem}
            className="rounded-2xl border border-border bg-surface/40 p-4"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-fg">{title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">{text}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
