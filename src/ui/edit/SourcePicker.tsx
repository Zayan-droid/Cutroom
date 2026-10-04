import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import { planEdit, trimRange } from '@/edit/geometry';
import { summarizeRecipe } from '@/edit/recipe';
import type { EditRecipe, Take } from '@/types';
import { takeAsset } from '@/lib/download';
import { aspectFor, isVideoAsset, ratioLabel } from '@/lib/media';
import { fadeUp } from '@/lib/motion';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';
import { EditCanvas } from './EditCanvas';
import { useEditMedia } from './media';
import { fileKind, type FileMediaKind } from './files';

const KIND_NAMES: Record<Take['kind'], string> = {
  draft: 'Draft',
  render: 'Final render',
  edit: 'Edit',
};

/** Takes that have a picture to edit, newest first. */
export function editableTakes(takes: Take[]): Take[] {
  return takes.filter((take) => takeAsset(take) !== null).reverse();
}

/**
 * Choose what to edit: one of this session's finished takes, or a video or
 * image from the computer (button or drag and drop). Files never leave the device.
 */
export function SourcePicker({
  takes,
  onPickTake,
  onPickFile,
}: {
  takes: Take[];
  onPickTake: (take: Take) => void;
  onPickFile: (file: { name: string; url: string; media: FileMediaKind }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [dropping, setDropping] = useState(false);
  const titleId = useId();
  const listed = useMemo(() => editableTakes(takes), [takes]);

  const open = (file: File | undefined) => {
    if (!file) return;
    const media = fileKind(file.name, file.type);
    if (!media) {
      setError(`“${file.name}” isn't a video or image file. Choose an MP4, WebM, MOV, PNG, JPEG, or WebP file.`);
      return;
    }
    setError('');
    onPickFile({ name: file.name, url: URL.createObjectURL(file), media });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    open(e.dataTransfer.files[0]);
  };

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show">
      <section
        aria-labelledby={titleId}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={onDrop}
        className={cn('mt-8 flex flex-col gap-6 outline-dashed outline-2 outline-offset-8 transition-[outline-color]', dropping ? 'outline-ink' : 'outline-transparent')}
      >
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-rule pb-4">
          <div className="min-w-0 max-w-2xl">
            <h2 id={titleId} className="text-xl font-bold tracking-tight">
              Choose a clip
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-ink-2">
              Pick one of your takes, or open a video or image from your computer (or drop it here). Files stay on this
              device; nothing is uploaded.
            </p>
          </div>
          <div className="flex flex-col items-start gap-1">
            <Button variant="secondary" leftIcon={<Glyph name="plus" />} onClick={() => input.current?.click()}>
              Open a file
            </Button>
            <input
              ref={input}
              type="file"
              accept="video/*,image/*"
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              onChange={(e) => {
                open(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="-mt-2 text-sm text-bad">
            {error}
          </p>
        )}

        {listed.length === 0 ? (
          <div className="rounded-md border border-dashed border-edge p-6">
            <p className="text-[15px] font-semibold text-ink">No finished takes yet</p>
            <p className="mt-1 text-[15px] text-ink-2">
              Generate drafts in Video takes and they'll appear here, or open a file from your computer.
            </p>
          </div>
        ) : (
          <section aria-label="Your takes" className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink">Your takes</h3>
            <ul className="grid grid-cols-2 items-start gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
              {listed.map((take) => (
                <li key={take.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onPickTake(take)}
                    className="group flex w-full flex-col gap-2 text-left focus-visible:outline-offset-4"
                  >
                    <span className="block w-full outline outline-1 outline-offset-[3px] outline-transparent transition-[outline-color] duration-150 group-hover:outline-edge">
                      <PickThumb take={take} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink">
                        {take.label ?? KIND_NAMES[take.kind]}
                        {take.kind === 'render' && <span className="font-normal text-ink-3"> · final</span>}
                      </span>
                      <span className="block truncate text-[13px] text-ink-2">
                        {take.kind === 'edit' && take.edit ? summarizeRecipe(take.edit) : ratioLabel(take.intent.kind)}
                      </span>
                      <span className="mt-0.5 block truncate font-text text-[15px] italic text-ink-2">“{take.prompt}”</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </motion.div>
  );
}

/** A still frame of a take, at its format's shape. Edits are drawn through their recipe. */
function PickThumb({ take }: { take: Take }) {
  const url = takeAsset(take);
  if (!url) return null;
  if (take.kind === 'edit' && take.edit) return <EditThumb url={url} kind={isVideoAsset(url) ? 'video' : 'image'} recipe={take.edit} />;
  return (
    <span className="relative block w-full overflow-hidden bg-well" style={{ aspectRatio: aspectFor(take.intent.kind) }}>
      {isVideoAsset(url) ? (
        <video src={`${url}#t=0.5`} preload="metadata" muted playsInline aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

function EditThumb({ url, kind, recipe }: { url: string; kind: 'video' | 'image'; recipe: EditRecipe }) {
  const media = useEditMedia(url, kind);
  const plan = useMemo(() => (media.size ? planEdit(recipe, media.size) : null), [recipe, media.size]);
  useEffect(() => {
    const video = media.element;
    if (!(video instanceof HTMLVideoElement)) return;
    const range = trimRange(recipe.trim, media.duration);
    video.currentTime = range.start + Math.min(0.5, (range.end - range.start) / 2);
  }, [media.element, media.duration, recipe.trim]);
  return (
    <span className="relative block w-full overflow-hidden bg-well" style={{ aspectRatio: plan ? plan.width / plan.height : 1 }}>
      {plan && <EditCanvas source={media.element} size={media.size} plan={plan} renderer="2d" />}
    </span>
  );
}
