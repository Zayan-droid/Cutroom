import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { TopBar } from './panels/TopBar';
import { LandScreen } from './panels/LandScreen';
import { PromptForm } from './panels/PromptForm';
import { DraftGrid } from './panels/DraftGrid';
import { Stage } from './panels/Stage';
import { VersionRail } from './panels/VersionRail';
import { CommandPalette } from './panels/CommandPalette';
import { Toaster } from './components/Toaster';
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

export function App() {
  const hasTakes = useHasTakes();
  const activeTake = useActiveTake();
  const activeId = useProjectStore((s) => s.activeTakeId);
  const drafts = useCurrentDrafts();
  const err = useStoreError();
  const avail = useAvailableCredits();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(activeId);

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

  const bindings = useMemo(() => {
    const navigate = (delta: number) => {
      if (drafts.length === 0) return;
      const ids = drafts.map((d) => d.id);
      const cur = activeId && ids.includes(activeId) ? ids.indexOf(activeId) : -1;
      const next = cur === -1 ? (delta > 0 ? 0 : ids.length - 1) : (cur + delta + ids.length) % ids.length;
      select(ids[next]);
    };
    return {
      'mod+k': () => setPaletteOpen((o) => !o),
      escape: () => {
        if (paletteOpen) setPaletteOpen(false);
        else if (inFocus) back();
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
          toast('Spun four variants.');
        }
      },
      arrowleft: () => navigate(-1),
      arrowright: () => navigate(1),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteOpen, inFocus, activeTake, avail, drafts, activeId]);

  useHotkeys(bindings);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-canvas min-h-full">
        <TopBar onOpenPalette={() => setPaletteOpen(true)} />

        {!hasTakes ? (
          <LandScreen />
        ) : (
          <main className="mx-auto max-w-[1400px] px-4 py-5">
            <div className="mb-5">
              <PromptForm variant="bar" onSubmitted={() => setFocusId(null)} />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0">
                <AnimatePresence mode="wait" initial={false}>
                  {inFocus && activeTake ? (
                    <Stage key="stage" take={activeTake} onBack={back} showBack={drafts.length > 0} />
                  ) : (
                    <DraftGrid key="grid" takes={drafts} activeId={activeId} onSelect={select} />
                  )}
                </AnimatePresence>
              </div>

              <VersionRail onSelect={select} />
            </div>
          </main>
        )}

        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <Toaster />
      </div>
    </MotionConfig>
  );
}
