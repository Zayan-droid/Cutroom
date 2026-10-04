import { AnimatePresence, motion } from 'framer-motion';
import { useToasts, type ToastTone } from '@/store/toast';
import { cn } from '@/lib/cn';
import { tBase, tQuick } from '@/lib/motion';

const TONE: Record<ToastTone, { bar: string; label: string }> = {
  default: { bar: 'bg-paper/40', label: 'Note' },
  success: { bar: 'bg-ok', label: 'Done' },
  danger: { bar: 'bg-bad', label: 'Problem' },
};

/** Solid ink notes, bottom-left, announced politely to screen readers. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex flex-col items-start gap-2 sm:right-auto sm:max-w-sm"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: tBase }}
            exit={{ opacity: 0, transition: tQuick }}
            className="pointer-events-auto flex min-h-11 items-stretch overflow-hidden rounded-md bg-ink text-paper"
          >
            <span aria-hidden className={cn('w-1 shrink-0', TONE[t.tone].bar)} />
            <p className="px-3.5 py-2.5 text-sm leading-snug">
              <span className="sr-only">{TONE[t.tone].label}: </span>
              {t.text}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
