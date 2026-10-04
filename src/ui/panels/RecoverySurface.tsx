import { actions } from '@/store';
import { toast } from '@/store/toast';
import { NUDGE_LABELS, type Nudge, type Take } from '@/types';
import { Button, ButtonCost } from '@/ui/components/ui';
import { Glyph } from '@/ui/components/Glyph';

const NUDGES = Object.keys(NUDGE_LABELS) as Nudge[];

/** A failed take, recovered in place: plain explanation, free reroll, or a reroll with one change. */
export function RecoverySurface({ take }: { take: Take }) {
  return (
    <div className="flex flex-col gap-4 rounded-md border border-bad/60 bg-sheet p-4">
      <div role="alert">
        <p className="text-[15px] font-semibold text-bad">This take failed</p>
        <p className="mt-0.5 text-[15px] leading-snug text-ink-2">{take.error ?? 'Something went wrong while generating it.'}</p>
      </div>

      <Button
        variant="primary"
        leftIcon={<Glyph name="retry" />}
        onClick={() => {
          actions.retry(take.id);
          toast('Rerolling. Rerolls are free.', 'success');
        }}
      >
        Reroll
        <ButtonCost cost={0} />
      </Button>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink">Or reroll with one change</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {NUDGES.map((n) => (
            <Button
              key={n}
              size="sm"
              variant="secondary"
              className="border-edge font-medium"
              onClick={() => actions.applyNudge(take.id, n)}
            >
              {NUDGE_LABELS[n]}
            </Button>
          ))}
        </div>
      </fieldset>

      <p className="text-sm leading-snug text-ink-3">
        Rerolls never cost credits, and this failed take stays in your version history.
      </p>
    </div>
  );
}
