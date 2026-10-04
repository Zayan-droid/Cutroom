import { useState, type ComponentProps } from 'react';
import { downloadBlob, takeAsset, takeFileName } from '@/lib/download';
import { toast } from '@/store/toast';
import type { Take } from '@/types';
import { Button } from './ui';
import { Glyph } from './Glyph';

/**
 * Saves a take's media with a descriptive filename. If the browser can't fetch
 * the file (offline, or a host that blocks cross-origin reads), it says so and
 * offers the file directly instead of failing silently.
 */
export function DownloadTake({
  take,
  label,
  variant = 'secondary',
  size = 'md',
  className,
}: {
  take: Take;
  label: string;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const url = takeAsset(take);
  if (!url) return null;

  const save = async () => {
    setState('busy');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const name = takeFileName(take, url, blob.type);
      downloadBlob(blob, name);
      setState('idle');
      toast(`Downloading ${name}`, 'success');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className={className}>
      <Button
        variant={variant}
        size={size}
        disabled={state === 'busy'}
        onClick={save}
        leftIcon={<Glyph name="download" />}
        className="w-full"
      >
        {state === 'busy' ? 'Preparing download…' : label}
      </Button>
      {state === 'failed' && (
        <p role="alert" className="mt-1.5 text-sm text-bad">
          This file couldn't be downloaded from here.{' '}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            download={takeFileName(take, url)}
            className="font-semibold text-ink underline underline-offset-2"
          >
            Open it in a new tab
          </a>{' '}
          to save it.
        </p>
      )}
    </div>
  );
}
