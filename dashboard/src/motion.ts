// Motion gates. Every animation in the app checks these first.

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The pointer accent is desktop-only: a coarse pointer means there is no cursor
// to follow, and running it on touch is pure battery cost.
export const hasFinePointer = () =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;
