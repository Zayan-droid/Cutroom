import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './ui';

/**
 * A small modal built on the native <dialog>: focus is trapped, Esc cancels,
 * and focus returns to the opener when it closes.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus(); // the safe choice gets initial focus
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel(); // click on the backdrop
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-md border border-ink/80 bg-sheet p-0 text-ink"
    >
      <div className="p-5">
        <h2 id="confirm-title" className="text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-3">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
