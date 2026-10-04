import { AnimatePresence, motion } from 'framer-motion';
import { tBase, tQuick } from '@/lib/motion';

export interface AssistFields {
  subject: string;
  style: string;
  motion: string;
  mood: string;
}

const FIELDS: Array<{ key: keyof AssistFields; label: string; hint: string; placeholder: string }> = [
  { key: 'subject', label: 'Subject', hint: 'Who or what is on screen', placeholder: 'A lone astronaut' },
  { key: 'style', label: 'Look', hint: 'Lens, film, lighting', placeholder: 'Anamorphic, 35mm, cold light' },
  { key: 'motion', label: 'Camera', hint: 'How the shot moves', placeholder: 'Slow dolly-in' },
  { key: 'mood', label: 'Mood', hint: 'How it should feel', placeholder: 'Quiet, uneasy' },
];

/** Optional structured direction. Each field feeds one part of the intent. */
export function PromptAssist({
  id,
  open,
  fields,
  set,
}: {
  id: string;
  open: boolean;
  fields: AssistFields;
  set: (key: keyof AssistFields, value: string) => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="assist"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0, transition: tBase }}
          exit={{ opacity: 0, transition: tQuick }}
          className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2"
        >
          {FIELDS.map((f) => (
            <label key={f.key} className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold text-ink">
                {f.label} <span className="font-normal text-ink-3">· {f.hint}</span>
              </span>
              <input
                value={fields[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="h-11 min-w-0 rounded border border-edge bg-field px-3 text-base text-ink placeholder:text-ink-3/80 transition-colors focus:border-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ink"
              />
            </label>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
