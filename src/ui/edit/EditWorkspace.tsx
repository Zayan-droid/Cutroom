import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { createRecipe } from '@/edit/recipe';
import type { EditRecipe, Take } from '@/types';
import { actions, useProjectStore } from '@/store';
import { takeAsset } from '@/lib/download';
import { aspectFor, isVideoAsset } from '@/lib/media';
import { fadeUp } from '@/lib/motion';
import { Editor, type EditSource } from './Editor';
import { SourcePicker } from './SourcePicker';
import { fileEditBase, takeEditBase, takeTitle, type FileMediaKind } from './files';

/** What the Edit video workspace has open. Lives in App so switching tabs keeps unsaved work. */
export interface EditTarget {
  source: { kind: 'take'; takeId: string } | { kind: 'file'; name: string; url: string; media: FileMediaKind };
  /** The recipe being edited. */
  recipe: EditRecipe;
  /** The recipe it opened with (unsaved-change checks). */
  base: EditRecipe;
}

/** Turn "16 / 9" into 1.777… */
function aspectNumber(css: string): number {
  const [w, h] = css.split('/').map((part) => Number(part.trim()));
  return w / h;
}

export function EditWorkspace({
  target,
  onTarget,
  onPickTake,
  onSaved,
}: {
  target: EditTarget | null;
  onTarget: (target: EditTarget | null) => void;
  onPickTake: (take: Take) => void;
  onSaved: (takeId: string) => void;
}) {
  const takes = useProjectStore((s) => s.takes);
  const takeId = target?.source.kind === 'take' ? target.source.takeId : null;
  const take = takeId ? takes.find((t) => t.id === takeId) : undefined;
  const missing = target?.source.kind === 'take' && (!take || !takeAsset(take));

  // A take can disappear (new session); fall back to the picker.
  useEffect(() => {
    if (missing) onTarget(null);
  }, [missing, onTarget]);

  const source = useMemo<EditSource | null>(() => {
    if (!target) return null;
    if (target.source.kind === 'file') {
      const { name, url, media } = target.source;
      return { url, kind: media, title: name, aspectHint: 16 / 9, fileBase: (recipe) => fileEditBase(name, recipe) };
    }
    const url = take ? takeAsset(take) : null;
    if (!take || !url) return null;
    return {
      url,
      kind: isVideoAsset(url) ? 'video' : 'image',
      title: takeTitle(take),
      prompt: take.prompt,
      note: take.kind === 'draft' ? 'Drafts are quick, low-resolution previews. Render it first for the full-quality picture.' : undefined,
      aspectHint: aspectNumber(aspectFor(take.intent.kind)),
      fileBase: (recipe) => takeEditBase(take.prompt, recipe),
      save: (recipe) => {
        const id = actions.applyEdit(take.id, recipe);
        if (id) onSaved(id);
      },
    };
  }, [target, take, onSaved]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <motion.header variants={fadeUp} initial="hidden" animate="show" className="max-w-3xl">
        <h1 className="stretch-wide text-[32px] font-bold leading-tight tracking-tight sm:text-[40px]">Edit video</h1>
        {!source && (
          <p className="mt-2 text-lg leading-relaxed text-ink-2">
            Crop, reframe, upscale, or trim one of your takes or a clip from your computer. Edits are free, and the
            original is never changed.
          </p>
        )}
      </motion.header>

      {source && target ? (
        <Editor
          key={source.url}
          source={source}
          recipe={target.recipe}
          base={target.base}
          onChange={(recipe) => onTarget({ ...target, recipe })}
          onChooseSource={() => onTarget(null)}
        />
      ) : (
        <SourcePicker
          takes={takes}
          onPickTake={onPickTake}
          onPickFile={(file) => onTarget({ source: { kind: 'file', ...file }, recipe: createRecipe(), base: createRecipe() })}
        />
      )}
    </main>
  );
}
