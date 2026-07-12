import test from "node:test";
import assert from "node:assert/strict";

import {
  PET_ANIMATIONS,
  PET_CELL_HEIGHT,
  PET_CELL_WIDTH,
  getPetAnimationDuration,
  getPetAnimationFrame,
  getPetLookFrame,
} from "../pet-animation.js";

test("the Charlie v2 atlas contract exposes exact cell geometry and authored rows", () => {
  assert.equal(PET_CELL_WIDTH, 192);
  assert.equal(PET_CELL_HEIGHT, 208);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(PET_ANIMATIONS).map(([state, animation]) => [
        state,
        { row: animation.row, durations: animation.durations },
      ]),
    ),
    {
      idle: { row: 0, durations: [280, 110, 110, 140, 140, 320] },
      "running-right": { row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
      "running-left": { row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
      waving: { row: 3, durations: [140, 140, 140, 280] },
      jumping: { row: 4, durations: [140, 140, 140, 140, 280] },
      failed: { row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
      waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260] },
      running: { row: 7, durations: [120, 120, 120, 120, 120, 220] },
      review: { row: 8, durations: [150, 150, 150, 150, 150, 280] },
    },
  );
});

test("animation durations are reported in seconds", () => {
  assert.equal(getPetAnimationDuration("idle"), 1.1);
  assert.equal(getPetAnimationDuration("running-right"), 1.06);
  assert.equal(getPetAnimationDuration("waving"), 0.7);
  assert.equal(getPetAnimationDuration("jumping"), 0.84);
  assert.equal(getPetAnimationDuration("failed"), 1.22);
  assert.equal(getPetAnimationDuration("waiting"), 1.01);
  assert.equal(getPetAnimationDuration("running"), 0.82);
  assert.equal(getPetAnimationDuration("review"), 1.03);
});

test("looping animation changes frames at exact boundaries and wraps", () => {
  assert.deepEqual(getPetAnimationFrame("idle", 0), {
    state: "idle", row: 0, column: 0, frameIndex: 0,
  });
  assert.equal(getPetAnimationFrame("idle", 0.279).column, 0);
  assert.equal(getPetAnimationFrame("idle", 0.28).column, 1);
  assert.equal(getPetAnimationFrame("idle", 0.389).column, 1);
  assert.equal(getPetAnimationFrame("idle", 0.39).column, 2);
  assert.equal(getPetAnimationFrame("idle", 1.099).column, 5);
  assert.equal(getPetAnimationFrame("idle", 1.1).column, 0);
  assert.equal(getPetAnimationFrame("idle", 2.48).column, 1);
});

test("frame selection honors a start time and clamps elapsed time before it", () => {
  assert.equal(getPetAnimationFrame("waving", 10, 10).column, 0);
  assert.equal(getPetAnimationFrame("waving", 10.14, 10).column, 1);
  assert.equal(getPetAnimationFrame("waving", 9, 10).column, 0);
});

test("non-looping animation holds its final authored frame", () => {
  assert.equal(getPetAnimationFrame("jumping", 0.839, 0, { loop: false }).column, 4);
  assert.equal(getPetAnimationFrame("jumping", 0.84, 0, { loop: false }).column, 4);
  assert.equal(getPetAnimationFrame("jumping", 99, 0, { loop: false }).column, 4);
});

test("reduced motion returns a stable semantic frame for every state", () => {
  const expectedColumns = {
    idle: 0,
    "running-right": 0,
    "running-left": 0,
    waving: 2,
    jumping: 2,
    failed: 4,
    waiting: 2,
    running: 3,
    review: 2,
  };

  for (const [state, column] of Object.entries(expectedColumns)) {
    const early = getPetAnimationFrame(state, 0, 0, { reducedMotion: true });
    const late = getPetAnimationFrame(state, 300, 0, { reducedMotion: true });
    assert.equal(early.column, column, state);
    assert.deepEqual(late, early, state);
  }
});

test("unknown animation states fail clearly", () => {
  assert.throws(() => getPetAnimationDuration("zoomies"), /Unknown pet animation state: zoomies/);
  assert.throws(() => getPetAnimationFrame("zoomies", 0), /Unknown pet animation state: zoomies/);
});

test("look frames follow the exact sixteen-direction v2 mapping", () => {
  for (let index = 0; index < 16; index += 1) {
    const radians = index * 22.5 * Math.PI / 180;
    const frame = getPetLookFrame(Math.sin(radians), -Math.cos(radians));
    assert.equal(frame.directionIndex, index, `direction ${index}`);
    assert.equal(frame.row, index < 8 ? 9 : 10, `row for direction ${index}`);
    assert.equal(frame.column, index % 8, `column for direction ${index}`);
  }

  assert.deepEqual(getPetLookFrame(0, -10), {
    state: "look", row: 9, column: 0, directionIndex: 0, degrees: 0,
  });
  assert.deepEqual(getPetLookFrame(10, 0), {
    state: "look", row: 9, column: 4, directionIndex: 4, degrees: 90,
  });
  assert.deepEqual(getPetLookFrame(0, 10), {
    state: "look", row: 10, column: 0, directionIndex: 8, degrees: 180,
  });
  assert.deepEqual(getPetLookFrame(-10, 0), {
    state: "look", row: 10, column: 4, directionIndex: 12, degrees: 270,
  });
  assert.deepEqual(getPetLookFrame(10, -10), {
    state: "look", row: 9, column: 2, directionIndex: 2, degrees: 45,
  });
});

test("look direction rounds to the nearest 22.5 degree cell and wraps at north", () => {
  const justBeforeBoundary = getPetLookFrame(Math.sin(11.24 * Math.PI / 180), -Math.cos(11.24 * Math.PI / 180));
  const onBoundary = getPetLookFrame(Math.sin(11.25 * Math.PI / 180), -Math.cos(11.25 * Math.PI / 180));
  const nearWrap = getPetLookFrame(-0.001, -1);

  assert.equal(justBeforeBoundary.directionIndex, 0);
  assert.equal(onBoundary.directionIndex, 1);
  assert.equal(nearWrap.directionIndex, 0);
});

test("the deadzone and non-finite vectors return Charlie's neutral front frame", () => {
  const neutral = {
    state: "neutral", row: 0, column: 6, directionIndex: null, degrees: null,
  };
  assert.deepEqual(getPetLookFrame(3, 4, { deadzone: 5 }), neutral);
  assert.deepEqual(getPetLookFrame(0, 0), neutral);
  assert.deepEqual(getPetLookFrame(Number.NaN, 1), neutral);
});
