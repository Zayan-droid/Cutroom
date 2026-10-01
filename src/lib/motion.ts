import type { Transition, Variants } from 'framer-motion';

// Signature easing from the design system: expo-out cubic-bezier(0.16,1,0.3,1).
// Entering uses ease-out; exits are quicker (see `exit` transitions below).
export const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const tBase: Transition = { duration: 0.42, ease: EASE_EXPO };
export const tFast: Transition = { duration: 0.22, ease: EASE_EXPO };
export const tSpring: Transition = { type: 'spring', stiffness: 90, damping: 20, mass: 0.9 };
export const tPress: Transition = { type: 'spring', stiffness: 400, damping: 26 };

/** Staggered reveal for a batch of drafts — feels alive, not popped-in at once. */
export const gridContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

export const gridItem: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: tBase },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: tFast },
};

/** A settle used when a take flips from generating → ready. */
export const settle: Variants = {
  initial: { opacity: 0, scale: 1.04 },
  animate: { opacity: 1, scale: 1, transition: tBase },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: tBase },
  exit: { opacity: 0, y: 6, transition: tFast },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: tSpring },
  exit: { opacity: 0, scale: 0.98, transition: tFast },
};

/** Subtle press feedback for interactive controls. */
export const pressable = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.97 },
  transition: tPress,
};
