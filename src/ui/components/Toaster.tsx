import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useToasts, type ToastTone } from '@/store/toast';
import { tBase, tFast } from '@/lib/motion';

const ICON: Record<ToastTone, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  danger: AlertTriangle,
};

const TONE: Record<ToastTone, string> = {
  default: 'text-fg-muted',
  success: 'text-success',
  danger: 'text-danger',
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: tBase }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: tFast }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border-strong bg-surface-2/95 px-4 py-2.5 text-sm text-fg shadow-card backdrop-blur-md"
            >
              <Icon className={`h-4 w-4 ${TONE[t.tone]}`} aria-hidden />
              {t.text}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
