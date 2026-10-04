import type { Transition, Variants } from 'framer-motion';

// Motion is functional and quick: things arrive, settle, and get out of the way.
// One ease-out curve, short durations, small distances, no springs or bounces.
// Exits are faster than entrances.
export const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1];

export const tQuick: Transition = { duration: 0.16, ease: EASE_OUT };
export const tBase: Transition = { duration: 0.24, ease: EASE_OUT };
/** Shared-element moves (a draft frame growing into the stage). */
export const tLayout: Transition = { duration: 0.32, ease: EASE_OUT };

/** Drafts arrive in order, one after another — the batch reads as a sequence. */
export const gridContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const gridItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: tBase },
  exit: { opacity: 0, transition: tQuick },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: tBase },
  exit: { opacity: 0, y: 4, transition: tQuick },
};

/** Version-history rows slide in from the panel edge. */
export const slideIn: Variants = {
  hidden: { opacity: 0, x: 8 },
  show: { opacity: 1, x: 0, transition: tBase },
  exit: { opacity: 0, transition: tQuick },
};
