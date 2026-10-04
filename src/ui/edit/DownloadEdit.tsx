import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { EditRecipe } from '@/types';
import { downloadBlob } from '@/lib/download';
import { toast } from '@/store/toast';
import { Button } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { exportEdit, ExportError, isAbort } from './exportEdit';

type State = { phase: 'idle' } | { phase: 'working'; progress: number } | { phase: 'failed'; message: string };

/**
 * Bakes an edit into a file and saves it. Video exports play through once, so
 * progress is shown with a way to cancel; focus moves to Cancel while it runs
 * and back to the button after.
 */
export function DownloadEdit({
  url,
  kind,
  recipe,
  fileBase,
  label,
  variant = 'secondary',
  size = 'md',
  disabled,
  className,
}: {
  url: string;
  kind: 'video' | 'image';
  recipe: EditRecipe;
  /** File name without its extension, which comes from the format the browser records. */
  fileBase: string;
  label: string;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  disabled?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<State>({ phase: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (state.phase === 'working' && restoreFocus.current) cancelRef.current?.focus();
    if (state.phase !== 'working' && restoreFocus.current) {
      restoreFocus.current = false;
      startRef.current?.focus();
    }
  }, [state.phase]);

  const start = async () => {
    const own = new AbortController();
    controller.current = own;
    restoreFocus.current = document.activeElement === startRef.current;
    setState({ phase: 'working', progress: 0 });
    try {
      const file = await exportEdit({
        url,
        kind,
        recipe,
        signal: own.signal,
        onProgress: (progress) => setState({ phase: 'working', progress }),
      });
      const name = `${fileBase}.${file.extension}`;
      downloadBlob(file.blob, name);
      toast(`Downloading ${name}`, 'success');
      setState({ phase: 'idle' });
    } catch (error) {
      if (isAbort(error)) setState({ phase: 'idle' });
      else setState({ phase: 'failed', message: error instanceof ExportError ? error.message : "The file couldn't be made. Try again." });
    } finally {
      if (controller.current === own) controller.current = null;
    }
  };

  if (state.phase === 'working') {
    const pct = Math.round(state.progress * 100);
    return (
      <div className={className}>
        <div role="status" className="flex flex-col gap-2 rounded border border-edge bg-sheet p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="tnum text-[15px] font-semibold text-ink">
              {kind === 'video' ? (pct > 0 ? `Exporting · ${pct}%` : 'Preparing the export…') : 'Preparing the image…'}
            </p>
            <Button ref={cancelRef} size="sm" variant="quiet" className="-mr-1" onClick={() => controller.current?.abort()}>
              Cancel
            </Button>
          </div>
          {kind === 'video' && (
            <>
              <div
                role="progressbar"
                aria-label="Export progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-1 bg-ink/10"
              >
                <div className="h-full origin-left bg-mark transition-transform duration-100 ease-linear" style={{ transform: `scaleX(${state.progress})` }} />
              </div>
              <p className="text-[13px] leading-snug text-ink-2">The clip plays through once while it records, so this takes as long as the clip.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Button ref={startRef} variant={variant} size={size} disabled={disabled} onClick={start} leftIcon={<Glyph name="download" />} className="w-full">
        {label}
      </Button>
      {state.phase === 'failed' && (
        <p role="alert" className="mt-1.5 text-sm text-bad">
          {state.message}
        </p>
      )}
    </div>
  );
}
