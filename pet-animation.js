/**
 * Pure frame selection for Charlie's Codex-compatible v2 pet atlas.
 *
 * The atlas itself is a static 8 x 11 WebP. Callers provide game time and this
 * module returns the authored source cell; it owns no timers, DOM, or drawing.
 */

export const PET_CELL_WIDTH = 192;
export const PET_CELL_HEIGHT = 208;

export const PET_ANIMATIONS = deepFreeze({
  idle: {
    row: 0,
    durations: [280, 110, 110, 140, 140, 320],
    reducedMotionColumn: 0,
  },
  "running-right": {
    row: 1,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    reducedMotionColumn: 0,
  },
  "running-left": {
    row: 2,
    durations: [120, 120, 120, 120, 120, 120, 120, 220],
    reducedMotionColumn: 0,
  },
  waving: {
    row: 3,
    durations: [140, 140, 140, 280],
    reducedMotionColumn: 2,
  },
  jumping: {
    row: 4,
    durations: [140, 140, 140, 140, 280],
    reducedMotionColumn: 2,
  },
  failed: {
    row: 5,
    durations: [140, 140, 140, 140, 140, 140, 140, 240],
    reducedMotionColumn: 4,
  },
  waiting: {
    row: 6,
    durations: [150, 150, 150, 150, 150, 260],
    reducedMotionColumn: 2,
  },
  running: {
    row: 7,
    durations: [120, 120, 120, 120, 120, 220],
    reducedMotionColumn: 3,
  },
  review: {
    row: 8,
    durations: [150, 150, 150, 150, 150, 280],
    reducedMotionColumn: 2,
  },
});

const NEUTRAL_FRAME = Object.freeze({
  state: "neutral",
  row: 0,
  column: 6,
  directionIndex: null,
  degrees: null,
});

/** Return an authored animation's complete cycle length in seconds. */
export function getPetAnimationDuration(state) {
  const animation = getAnimation(state);
  return animation.durations.reduce((total, duration) => total + duration, 0) / 1000;
}

/**
 * Select an authored animation cell for a game timestamp.
 *
 * `elapsedSeconds` and `startedAtSeconds` should share a clock. Animations loop
 * unless `{ loop: false }` is supplied, in which case the final cell is held.
 */
export function getPetAnimationFrame(
  state,
  elapsedSeconds,
  startedAtSeconds = 0,
  { loop = true, reducedMotion = false } = {},
) {
  const animation = getAnimation(state);

  if (reducedMotion) {
    return animationFrame(state, animation, animation.reducedMotionColumn);
  }

  const elapsed = finiteNumber(elapsedSeconds, 0);
  const startedAt = finiteNumber(startedAtSeconds, 0);
  const elapsedMilliseconds = Math.max(0, (elapsed - startedAt) * 1000);
  const durationMilliseconds = animation.durations.reduce(
    (total, duration) => total + duration,
    0,
  );

  if (!loop && elapsedMilliseconds >= durationMilliseconds) {
    const finalIndex = animation.durations.length - 1;
    return animationFrame(state, animation, finalIndex);
  }

  const cycleTime = loop
    ? elapsedMilliseconds % durationMilliseconds
    : elapsedMilliseconds;
  let boundary = 0;

  for (let index = 0; index < animation.durations.length; index += 1) {
    boundary += animation.durations[index];
    if (cycleTime < boundary) return animationFrame(state, animation, index);
  }

  // Floating-point timestamps can land a few ulps beyond the final boundary.
  // A non-looping animation still has a well-defined authored resting frame.
  return animationFrame(state, animation, animation.durations.length - 1);
}

/**
 * Map a vector from Charlie to a target onto the atlas' sixteen look cells.
 * North is zero degrees and direction indices advance clockwise.
 */
export function getPetLookFrame(dx, dy, { deadzone = 0 } = {}) {
  const horizontal = Number(dx);
  const vertical = Number(dy);
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) {
    return { ...NEUTRAL_FRAME };
  }

  const threshold = Math.max(0, finiteNumber(deadzone, 0));
  if (Math.hypot(horizontal, vertical) <= threshold) {
    return { ...NEUTRAL_FRAME };
  }

  const degrees = (Math.atan2(horizontal, -vertical) * 180 / Math.PI + 360) % 360;
  const directionIndex = Math.round(degrees / 22.5) % 16;

  return {
    state: "look",
    row: directionIndex < 8 ? 9 : 10,
    column: directionIndex % 8,
    directionIndex,
    degrees,
  };
}

function animationFrame(state, animation, frameIndex) {
  return {
    state,
    row: animation.row,
    column: frameIndex,
    frameIndex,
  };
}

function getAnimation(state) {
  const animation = PET_ANIMATIONS[state];
  if (!animation) throw new RangeError(`Unknown pet animation state: ${state}`);
  return animation;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}
