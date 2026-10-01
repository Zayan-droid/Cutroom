import { AnimatePresence, motion } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import { tBase, tFast } from '@/lib/motion';
import { cn } from '@/lib/cn';

export interface AssistFields {
  subject: string;
  style: string;
  motion: string;
  mood: string;
}

const FIELDS: Array<{ key: keyof AssistFields; label: string; placeholder: string }> = [
  { key: 'subject', label: 'Subject', placeholder: 'A lone astronaut' },
  { key: 'style', label: 'Style', placeholder: 'Anamorphic, 35mm film' },
  { key: 'motion', label: 'Motion', placeholder: 'Slow dolly-in' },
  { key: 'mood', label: 'Mood', placeholder: 'Awe, quiet tension' },
];

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-10 rounded-lg border border-border bg-black/25 px-3 text-sm text-fg placeholder:text-fg-subtle/70',
          'transition-colors duration-200 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40',
        )}
      />
    </label>
  );
}

export function PromptAssist({
  open,
  fields,
  set,
  onSurprise,
}: {
  open: boolean;
  fields: AssistFields;
  set: (key: keyof AssistFields, value: string) => void;
  onSurprise: () => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="assist"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, transition: tBase }}
          exit={{ height: 0, opacity: 0, transition: tFast }}
          className="overflow-hidden"
        >
          <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                placeholder={f.placeholder}
                value={fields[f.key]}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onSurprise}
            className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            Surprise me
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
