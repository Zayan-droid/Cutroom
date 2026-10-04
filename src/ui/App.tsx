import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { TopBar, type Mode } from './panels/TopBar';
import { LandScreen } from './panels/LandScreen';
import { PromptForm, SHOT_INPUT_ID } from './panels/PromptForm';
import { DraftGrid } from './panels/DraftGrid';
import { Stage } from './panels/Stage';
import { EditStage } from './panels/EditStage';
import { VersionRail } from './panels/VersionRail';
import { Toaster } from './components/Toaster';
import { Kbd } from './components/ui';
import { useHotkeys } from './hooks/useHotkeys';
import {
  actions,
  useActiveTake,
  useAvailableCredits,
  useCurrentDrafts,
  useHasTakes,
  useProjectStore,
  useStoreError,
} from '@/store';
import { toast } from '@/store/toast';
import { quote } from '@/lib/cost';
import { ConnectedStoryMode } from './story/ConnectedStoryMode';
import { EditWorkspace, type EditTarget } from './edit/EditWorkspace';
import { cloneRecipe, createRecipe } from '@/edit/recipe';
import { takeAsset } from '@/lib/download';
import type { EditRecipe, Take } from '@/types';

export function App() {
  const hasTakes = useHasTakes();
  const activeTake = useActiveTake();
  const activeId = useProjectStore((s) => s.activeTakeId);
  const drafts = useCurrentDrafts();
  const err = useStoreError();
  const avail = useAvailableCredits();

  const [mode, setMode] = useState<Mode>('takes');
  const [focusId, setFocusId] = useState<string | null>(activeId);
  // The editor's open clip and unsaved recipe live here, so switching tabs never loses them.
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const openEditor = useCallback((take: Take) => {
    if (!takeAsset(take)) return;
    setEditTarget((current) => {
      if (current?.source.kind === 'take' && current.source.takeId === take.id) return current;
      const recipe = take.kind === 'edit' && take.edit ? cloneRecipe(take.edit) : createRecipe();
      return { source: { kind: 'take', takeId: take.id }, recipe, base: cloneRecipe(recipe) };
    });
    setMode('edit');
    window.scrollTo({ top: 0 });
  }, []);

  // A saved edit opens on the stage as the newest version (the store made it active).
  const onEditSaved = useCallback((id: string) => {
    const saved = useProjectStore.getState().takes.find((t) => t.id === id);
    const recipe = saved?.edit ? cloneRecipe(saved.edit) : createRecipe();
    setEditTarget({ source: { kind: 'take', takeId: id }, recipe, base: cloneRecipe(recipe) });
    setMode('takes');
    window.scrollTo({ top: 0 });
    toast('Saved as a new version in your history.', 'success');
  }, []);

  // Release a computer file's object URL once the editor moves on from it.
  const fileUrl = editTarget?.source.kind === 'file' ? editTarget.source.url : null;
  const lastFileUrl = useRef<string | null>(null);
  useEffect(() => {
    if (lastFileUrl.current && lastFileUrl.current !== fileUrl) URL.revokeObjectURL(lastFileUrl.current);
    lastFileUrl.current = fileUrl;
  }, [fileUrl]);

  // Follow programmatic active changes: render/nudge/retry focus the new take;
  // submit/remix clear it (activeId → null) so the draft grid shows.
  useEffect(() => setFocusId(activeId), [activeId]);

  // Surface store validation errors (insufficient credits, invalid take, …).
  useEffect(() => {
    if (err) toast(err.message, 'danger');
  }, [err]);

  const select = (id: string) => {
    actions.selectTake(id);
    setFocusId(id);
  };
  const back = () => setFocusId(null);

  const inFocus = focusId !== null && activeTake !== null;

  // Every action has a visible control; these keys are shortcuts to the same
  // controls, listed under the work area — there is no hidden command list.
  const bindings = useMemo<Record<string, () => void>>(() => {
    if (mode !== 'takes') return {} as Record<string, () => void>;
    const navigate = (delta: number) => {
      if (drafts.length === 0) return;
      const ids = drafts.map((d) => d.id);
      const cur = activeId && ids.includes(activeId) ? ids.indexOf(activeId) : -1;
      const next = cur === -1 ? (delta > 0 ? 0 : ids.length - 1) : (cur + delta + ids.length) % ids.length;
      select(ids[next]);
    };
    return {
      escape: () => {
        if (inFocus && drafts.length > 0) back();
      },
      r: () => {
        if (
          activeTake?.status === 'ready' &&
          activeTake.kind === 'draft' &&
          avail >= quote('render', activeTake.intent.kind)
        ) {
          actions.render();
        }
      },
      m: () => {
        if (activeTake?.status === 'ready') {
          actions.remix(activeTake.id);
          toast('Remixing: four new drafts are on the way.');
        }
      },
      n: () => document.getElementById(SHOT_INPUT_ID)?.focus(),
      e: () => {
        if (activeTake && takeAsset(activeTake)) openEditor(activeTake);
      },
      arrowleft: () => navigate(-1),
      arrowright: () => navigate(1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, inFocus, activeTake, avail, drafts, activeId, openEditor]);

  useHotkeys(bindings);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-full bg-paper text-ink">
        <TopBar mode={mode} onModeChange={setMode} />

        {mode === 'story' ? (
          <ConnectedStoryMode />
        ) : mode === 'edit' ? (
          <EditWorkspace target={editTarget} onTarget={setEditTarget} onPickTake={openEditor} onSaved={onEditSaved} />
        ) : !hasTakes ? (
          <LandScreen />
        ) : (
          <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-5 sm:px-6">
            <section aria-label="New prompt" className="mb-6 rounded-md border border-rule bg-sheet p-4">
              <PromptForm
                variant="bar"
                initialKind={drafts[0]?.intent.kind ?? activeTake?.intent.kind}
                onSubmitted={() => setFocusId(null)}
              />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                {/* Keyed per take: switching takes is a clean exit and entrance. Reusing one
                    Stage across takes strands its shared-layout frame and stalls the exit. */}
                <AnimatePresence mode="wait" initial={false}>
                  {inFocus && activeTake ? (
                    activeTake.kind === 'edit' && activeTake.edit ? (
                      <EditStage
                        key={`stage-${activeTake.id}`}
                        take={activeTake as Take & { edit: EditRecipe }}
                        onBack={back}
                        showBack={drafts.length > 0}
                        onEdit={openEditor}
                        onSelect={select}
                      />
                    ) : (
                      <Stage key={`stage-${activeTake.id}`} take={activeTake} onBack={back} showBack={drafts.length > 0} onEdit={openEditor} />
                    )
                  ) : (
                    <DraftGrid key="grid" takes={drafts} activeId={activeId} onSelect={select} />
                  )}
                </AnimatePresence>
                <ShortcutList />
              </div>

              <VersionRail onSelect={select} />
            </div>
          </main>
        )}

        <Toaster />
      </div>
    </MotionConfig>
  );
}

/** Plain, always-visible shortcut list for keyboard users (hidden on touch screens). */
function ShortcutList() {
  const keys: Array<[string[], string]> = [
    [['←', '→'], 'move between drafts'],
    [['Esc'], 'back to drafts'],
    [['R'], 'render'],
    [['M'], 'remix'],
    [['E'], 'edit video'],
    [['N'], 'new prompt'],
  ];
  return (
    <div className="mt-8 hidden flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule pt-4 text-[13px] text-ink-2 [@media(hover:hover)_and_(pointer:fine)]:flex">
      <span className="font-semibold text-ink">Keyboard</span>
      {keys.map(([k, what]) => (
        <span key={what} className="inline-flex items-center gap-1.5">
          {k.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          {what}
        </span>
      ))}
    </div>
  );
}
