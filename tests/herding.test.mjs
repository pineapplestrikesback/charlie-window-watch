import test from "node:test";
import assert from "node:assert/strict";

import {
  HERDING_CONFIG,
  SHEEP_BLUEPRINTS,
  SHEEP_LANE,
  barkAtFlock,
  createFlock,
  getFlockStatus,
  updateFlock,
} from "../herding.js";

const QUIET_CONFIG = Object.freeze({
  wanderSpeed: 0,
  cohesionSpeed: 0,
});

function byId(state, id) {
  return state.sheep.find((sheep) => sheep.id === id);
}

function positionMap(state) {
  return Object.fromEntries(state.sheep.map(({ id, x }) => [id, x]));
}

test("exports a six-sheep normalized flock with one unmistakable stubborn ewe", () => {
  const flock = createFlock("czech-cabin");
  const status = getFlockStatus(flock);

  assert.equal(flock.sheep.length, 6);
  assert.equal(new Set(flock.sheep.map(({ id }) => id)).size, 6);
  assert.deepEqual(flock.sheep.map(({ id }) => id), SHEEP_BLUEPRINTS.map(({ id }) => id));
  assert.ok(flock.sheep.every(({ x }) => x >= 0 && x <= 1));
  assert.deepEqual(status.stubbornIds, ["ewe-zofka"]);
  assert.equal(byId(flock, "ewe-zofka").earTag, "red");
  assert.equal(SHEEP_LANE, "sheep");
  assert.equal(HERDING_CONFIG.settledRequired, 4);
  assert.equal(HERDING_CONFIG.settleHoldSeconds, 3);
  assert.equal(HERDING_CONFIG.maxSettleMarks, 3);
  assert.ok(Object.isFrozen(HERDING_CONFIG));
  assert.ok(Object.isFrozen(HERDING_CONFIG.settledZone));
  assert.ok(Object.isFrozen(SHEEP_BLUEPRINTS));
});

test("seeded and injected construction replay stable ids, x positions, and wander traits", () => {
  const first = createFlock("week-in-czechia");
  const replay = createFlock("week-in-czechia");
  const other = createFlock("different-cabin");

  assert.deepEqual(first, replay);
  assert.deepEqual(first.sheep.map(({ id }) => id), other.sheep.map(({ id }) => id));
  assert.notDeepEqual(positionMap(first), positionMap(other));

  const values = [0.1, 0.25, 0.7, 0.9, 0.42];
  const makeRng = () => {
    let index = 0;
    return () => values[(index++) % values.length];
  };
  const injected = createFlock({ seed: "unused-by-injected-rng", rng: makeRng() });
  const injectedReplay = createFlock({ seed: "unused-by-injected-rng", rng: makeRng() });
  assert.deepEqual(injected, injectedReplay);
});

test("initial position overrides are copied, clamped, and never mutated", () => {
  const positions = [0, 0.2, 0.4, 0.6, 0.8, 2];
  const before = [...positions];
  const flock = createFlock({
    seed: 7,
    initialPositions: positions,
    config: { minX: 0.05, maxX: 0.95 },
  });

  assert.deepEqual(positions, before);
  assert.equal(flock.sheep[0].x, 0.05);
  assert.equal(flock.sheep[5].x, 0.95);
});

test("ordinary sheep respond to Charlie's side only on the sheep lane", () => {
  const initialPositions = [0.3, 0.48, 0.62, 0.76, 0.9, 0.94];
  const base = createFlock({ seed: 1, initialPositions, config: QUIET_CONFIG });
  const snapshot = structuredClone(base);
  const onLane = updateFlock(base, {
    dt: 0.5,
    now: 0.5,
    charlieX: 0.2,
    charlieLane: SHEEP_LANE,
  });
  const windowLane = updateFlock(base, {
    dt: 0.5,
    now: 0.5,
    charlieX: 0.2,
    charlieLane: "windows",
  });
  const noCharlie = updateFlock(base, {
    dt: 0.5,
    now: 0.5,
    charlieLane: SHEEP_LANE,
  });

  assert.ok(byId(onLane, "ewe-alenka").x > byId(base, "ewe-alenka").x);
  assert.deepEqual(positionMap(windowLane), positionMap(noCharlie));
  assert.equal(byId(windowLane, "ewe-alenka").x, byId(base, "ewe-alenka").x);
  assert.deepEqual(base, snapshot);
});

test("Charlie can pressure from either side and Focus increases the positional response", () => {
  const base = createFlock({
    seed: 2,
    initialPositions: [0.3, 0.48, 0.62, 0.76, 0.9, 0.94],
    config: QUIET_CONFIG,
  });
  const pushedLeft = updateFlock(base, {
    dt: 0.4,
    now: 0.4,
    charlieX: 0.39,
    charlieLane: SHEEP_LANE,
  });
  const normal = updateFlock(base, {
    dt: 0.4,
    now: 0.4,
    charlieX: 0.2,
    charlieLane: SHEEP_LANE,
  });
  const focused = updateFlock(base, {
    dt: 0.4,
    now: 0.4,
    charlieX: 0.2,
    charlieLane: SHEEP_LANE,
    focusBoost: 1,
  });

  assert.ok(byId(pushedLeft, "ewe-alenka").x < byId(base, "ewe-alenka").x);
  assert.ok(
    byId(focused, "ewe-alenka").x - byId(base, "ewe-alenka").x
      > byId(normal, "ewe-alenka").x - byId(base, "ewe-alenka").x,
  );
});

test("the stubborn ewe ignores body pressure until a nearby bark makes her comply", () => {
  const base = createFlock({
    seed: 3,
    initialPositions: [0.05, 0.15, 0.25, 0.35, 0.5, 0.9],
    config: { ...QUIET_CONFIG, barkRadius: 0.11 },
  });
  const ignored = updateFlock(base, {
    dt: 0.5,
    now: 0.5,
    charlieX: 0.4,
    charlieLane: SHEEP_LANE,
  });
  assert.equal(byId(ignored, "ewe-zofka").x, byId(base, "ewe-zofka").x);

  const barked = barkAtFlock(base, { now: 0, charlieX: 0.4 });
  assert.deepEqual(getFlockStatus(barked).compliantStubbornIds, ["ewe-zofka"]);
  const complying = updateFlock(barked, {
    dt: 0.5,
    now: 0.5,
    charlieX: 0.4,
    charlieLane: SHEEP_LANE,
  });
  assert.ok(byId(complying, "ewe-zofka").x > byId(barked, "ewe-zofka").x);

  const expired = updateFlock(complying, {
    dt: 0.5,
    now: 5,
    charlieX: 0.4,
    charlieLane: SHEEP_LANE,
  });
  assert.equal(byId(expired, "ewe-zofka").x, byId(complying, "ewe-zofka").x);
  assert.deepEqual(getFlockStatus(expired).compliantStubbornIds, []);
});

test("barking scatters only nearby ordinary sheep away from Charlie", () => {
  const base = createFlock({
    seed: 4,
    initialPositions: [0.3, 0.4, 0.5, 0.68, 0.8, 0.94],
    config: { ...QUIET_CONFIG, barkRadius: 0.16 },
  });
  const snapshot = structuredClone(base);
  const barked = barkAtFlock(base, { now: 1, charlieX: 0.45 });
  const status = getFlockStatus(barked);

  assert.deepEqual(status.scatteringIds, ["ewe-alenka", "ewe-bara", "ewe-dita"]);
  assert.equal(byId(barked, "ewe-alenka").scatterDirection, -1);
  assert.equal(byId(barked, "ewe-dita").scatterDirection, 1);
  assert.equal(byId(barked, "ewe-marie").scatterUntil, null);
  assert.deepEqual(base, snapshot);

  const scattered = updateFlock(barked, {
    dt: 0.25,
    now: 1.25,
    charlieX: 0.45,
    charlieLane: "windows",
  });
  assert.ok(byId(scattered, "ewe-alenka").x < byId(barked, "ewe-alenka").x);
  assert.ok(byId(scattered, "ewe-dita").x > byId(barked, "ewe-dita").x);
  assert.equal(byId(scattered, "ewe-marie").x, byId(barked, "ewe-marie").x);
});

test("unattended sheep wander slowly and replay exactly from the same state", () => {
  const base = createFlock({
    seed: "slow-wander",
    initialPositions: [0.12, 0.28, 0.44, 0.6, 0.76, 0.9],
    config: { cohesionSpeed: 0, wanderSpeed: 0.015 },
  });
  const first = updateFlock(base, { dt: 1, now: 1, charlieX: 0.4, charlieLane: "windows" });
  const replay = updateFlock(base, { dt: 1, now: 1, charlieX: 0.4, charlieLane: "windows" });
  const deltas = first.sheep.map((sheep, index) => Math.abs(sheep.x - base.sheep[index].x));

  assert.deepEqual(first, replay);
  assert.ok(deltas.some((delta) => delta > 0));
  assert.ok(deltas.every((delta) => delta <= 0.015 + 1e-9));
});

test("cohesion gently pulls spread-out sheep toward the flock centroid", () => {
  const base = createFlock({
    seed: 5,
    initialPositions: [0.05, 0.08, 0.1, 0.12, 0.14, 0.95],
    config: { wanderSpeed: 0, cohesionSpeed: 0.1, cohesionSlack: 0.1 },
  });
  const before = getFlockStatus(base);
  const cohesive = updateFlock(base, { dt: 1, now: 1, charlieLane: "windows" });
  const after = getFlockStatus(cohesive);

  assert.ok(cohesive.sheep[0].x > base.sheep[0].x);
  assert.ok(cohesive.sheep[5].x < base.sheep[5].x);
  assert.ok(after.cohesion > before.cohesion);
});

test("the real six-position cabin control grid can herd and hold four sheep", () => {
  let flock = createFlock(123);
  let now = 0;
  const advance = (charlieX, seconds, charlieLane = SHEEP_LANE) => {
    const frames = Math.round(seconds / 0.05);
    for (let frame = 0; frame < frames; frame += 1) {
      now += 0.05;
      flock = updateFlock(flock, { dt: 0.05, now, charlieX, charlieLane });
    }
  };

  // These are game.js's six cabin-sector centers after canvas normalization.
  // Charlie walks behind the middle of the flock instead of micromanaging
  // arbitrary coordinates unavailable to keyboard/touch players.
  advance(0.356, 2);
  advance(0.498, 2);
  flock = barkAtFlock(flock, { now, charlieX: 0.64 });
  advance(0.64, 2);
  assert.equal(getFlockStatus(flock).settledCount, 4);

  advance(0.64, 3.1, "upper");
  assert.equal(getFlockStatus(flock).settleMarks, 1);
});

test("four sheep held in the marked zone for three seconds earn exactly one mark", () => {
  const flock = createFlock({
    seed: 6,
    now: 0,
    initialPositions: [0.74, 0.77, 0.82, 0.89, 0.2, 0.4],
    config: QUIET_CONFIG,
  });
  assert.equal(getFlockStatus(flock).settledCount, 4);
  assert.equal(flock.settledSince, 0);

  const almost = updateFlock(flock, { dt: 2.99, now: 2.99, charlieLane: "windows" });
  assert.equal(almost.settleMarks, 0);
  assert.ok(getFlockStatus(almost).settleProgress > 0.99);

  const earned = updateFlock(almost, { dt: 0.01, now: 3, charlieLane: "windows" });
  const status = getFlockStatus(earned);
  assert.equal(status.settleMarks, 1);
  assert.equal(status.needsRegroup, true);
  assert.equal(status.settleProgress, 0);
  assert.equal(earned.lastSettleAwardAt, 3);
});

test("a parked group cannot farm marks; regrouping rearms each persistent mark", () => {
  let flock = createFlock({
    seed: 7,
    now: 0,
    initialPositions: [0.74, 0.77, 0.82, 0.89, 0.2, 0.4],
    config: QUIET_CONFIG,
  });
  flock = updateFlock(flock, { dt: 3, now: 3 });
  flock = updateFlock(flock, { dt: 30, now: 33 });
  assert.equal(flock.settleMarks, 1);
  assert.equal(flock.completed, false);

  for (let targetMark = 2; targetMark <= 3; targetMark += 1) {
    const outAt = flock.lastUpdateAt + 0.1;
    flock = {
      ...flock,
      sheep: flock.sheep.map((sheep, index) => index === 0 ? { ...sheep, x: 0.6 } : sheep),
    };
    flock = updateFlock(flock, { dt: 0, now: outAt });
    assert.equal(flock.settleArmed, true);
    assert.equal(flock.settleMarks, targetMark - 1);

    const returnedAt = outAt + 0.1;
    flock = {
      ...flock,
      sheep: flock.sheep.map((sheep, index) => index === 0 ? { ...sheep, x: 0.74 } : sheep),
    };
    flock = updateFlock(flock, { dt: 0, now: returnedAt });
    flock = updateFlock(flock, { dt: 3, now: returnedAt + 3 });
    assert.equal(flock.settleMarks, targetMark);
  }

  assert.equal(flock.completed, true);
  assert.equal(getFlockStatus(flock).completed, true);
  const afterCompletion = updateFlock(flock, { dt: 100, now: flock.lastUpdateAt + 100 });
  assert.equal(afterCompletion.settleMarks, 3);
});

test("falling below four clears only current hold progress, never earned marks", () => {
  let flock = createFlock({
    seed: 8,
    now: 0,
    initialPositions: [0.74, 0.77, 0.82, 0.89, 0.2, 0.4],
    config: QUIET_CONFIG,
  });
  flock = updateFlock(flock, { dt: 3, now: 3 });
  flock = {
    ...flock,
    sheep: flock.sheep.map((sheep, index) => index === 0 ? { ...sheep, x: 0.6 } : sheep),
  };
  flock = updateFlock(flock, { dt: 0, now: 3.1 });

  const status = getFlockStatus(flock);
  assert.equal(status.settleMarks, 1);
  assert.equal(status.settledCount, 3);
  assert.equal(status.settledFor, 0);
  assert.equal(status.settleArmed, true);
  assert.equal(flock.settledSince, null);
});

test("movement clamps at both fence posts and long frame gaps cannot teleport sheep", () => {
  const base = createFlock({
    seed: 9,
    initialPositions: [0.04, 0.2, 0.4, 0.6, 0.8, 0.96],
    config: {
      ...QUIET_CONFIG,
      influenceRadius: 1,
      herdSpeed: 4,
      maxMovementSeconds: 0.25,
    },
  });
  const right = updateFlock(base, {
    dt: 50,
    now: 50,
    charlieX: 0.5,
    charlieLane: SHEEP_LANE,
  });

  assert.ok(right.sheep.every(({ x }) => x >= right.config.minX && x <= right.config.maxX));
  assert.equal(right.sheep[0].x, right.config.minX);
  assert.equal(right.sheep[5].x, right.config.maxX);
});

test("the reachable rightmost cabin position can peel sheep away from the right fence", () => {
  const rightmostCabinPosition = (1160 - 64) / (1280 - 128);
  const base = createFlock({
    seed: "right-fence-regression",
    initialPositions: Array(SHEEP_BLUEPRINTS.length).fill(0.965),
    config: QUIET_CONFIG,
  });

  const barked = barkAtFlock(base, { now: 0, charlieX: rightmostCabinPosition });
  const recovered = updateFlock(barked, {
    dt: 0.5,
    now: 0.5,
    charlieX: rightmostCabinPosition,
    charlieLane: SHEEP_LANE,
  });

  assert.ok(recovered.sheep.every(({ x }) => x < base.config.maxX));
});

test("status exposes objective, rendering, and momentary bark state without mutation", () => {
  const flock = createFlock({
    seed: 10,
    initialPositions: [0.74, 0.77, 0.2, 0.4, 0.55, 0.9],
    config: QUIET_CONFIG,
  });
  const snapshot = structuredClone(flock);
  const status = getFlockStatus(flock);

  assert.deepEqual(status.inZoneIds, ["ewe-alenka", "ewe-bara", "lamb-kaja"]);
  assert.equal(status.settledCount, 3);
  assert.equal(status.requiredSettled, 4);
  assert.equal(status.settleMarks, 0);
  assert.equal(status.maxSettleMarks, 3);
  assert.equal(status.completed, false);
  assert.ok(status.centroid > 0 && status.centroid < 1);
  assert.ok(status.cohesion >= 0 && status.cohesion <= 1);
  assert.deepEqual(flock, snapshot);
});

test("public operations reject values that are not flock states", () => {
  assert.throws(() => updateFlock(null, {}), /flock state/i);
  assert.throws(() => barkAtFlock({}, {}), /flock state/i);
  assert.throws(() => getFlockStatus({ sheep: [] }), /flock state/i);
});
