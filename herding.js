/**
 * Pure sheep-herding rules for Czech Cabin Duty.
 *
 * Horizontal positions are normalized from 0 (left fence post) to 1 (right
 * fence post). This module owns no DOM, clocks, timers, audio, or rendering;
 * callers provide elapsed time and the current clock value to every update.
 */

export const SHEEP_LANE = "sheep";

export const SHEEP_BLUEPRINTS = deepFreeze([
  { id: "ewe-alenka", name: "Alenka", stubborn: false, earTag: "yellow" },
  { id: "ewe-bara", name: "Bára", stubborn: false, earTag: "green" },
  { id: "ewe-dita", name: "Dita", stubborn: false, earTag: "blue" },
  { id: "ewe-marie", name: "Marie", stubborn: false, earTag: "orange" },
  { id: "ewe-zofka", name: "Žofka", stubborn: true, earTag: "red" },
  { id: "lamb-kaja", name: "Kája", stubborn: false, earTag: "white" },
]);

export const HERDING_CONFIG = deepFreeze({
  minX: 0.035,
  maxX: 0.965,
  sheepLane: SHEEP_LANE,
  settledZone: { min: 0.72, max: 0.93 },
  settledRequired: 4,
  settleHoldSeconds: 3,
  maxSettleMarks: 3,
  influenceRadius: 0.2,
  herdSpeed: 0.17,
  stubbornHerdSpeed: 0.135,
  focusRadiusBoost: 0.3,
  focusSpeedBoost: 0.4,
  wanderSpeed: 0.012,
  cohesionSpeed: 0.027,
  cohesionSlack: 0.19,
  barkRadius: 0.24,
  barkScatterSeconds: 0.72,
  barkScatterSpeed: 0.24,
  stubbornComplianceSeconds: 4,
  maxMovementSeconds: 1,
  maxSimulationStep: 0.05,
});

const DEFAULT_POSITIONS = Object.freeze([0.1, 0.245, 0.39, 0.535, 0.68, 0.855]);
const EPSILON = 1e-9;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hashSeed(input) {
  const text = String(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRng(seed) {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function safeRandom(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 0.9999999999999999);
}

function normalizeCreateOptions(seedOrOptions, additionalOptions) {
  if (seedOrOptions && typeof seedOrOptions === "object" && !Array.isArray(seedOrOptions)) {
    return { ...seedOrOptions };
  }
  return { ...additionalOptions, seed: seedOrOptions ?? additionalOptions.seed ?? 0 };
}

function normalizeConfig(overrides = {}) {
  const zoneOverrides = overrides.settledZone ?? {};
  const minX = clamp(overrides.minX ?? HERDING_CONFIG.minX, 0, 1);
  const maxX = clamp(overrides.maxX ?? HERDING_CONFIG.maxX, minX, 1);
  const zoneMin = clamp(
    zoneOverrides.min ?? HERDING_CONFIG.settledZone.min,
    minX,
    maxX,
  );
  const zoneMax = clamp(
    zoneOverrides.max ?? HERDING_CONFIG.settledZone.max,
    zoneMin,
    maxX,
  );

  return deepFreeze({
    ...HERDING_CONFIG,
    ...overrides,
    minX,
    maxX,
    settledZone: { min: zoneMin, max: zoneMax },
    settledRequired: Math.max(1, Math.min(SHEEP_BLUEPRINTS.length,
      Math.floor(finiteNumber(overrides.settledRequired, HERDING_CONFIG.settledRequired)))),
    settleHoldSeconds: Math.max(EPSILON,
      finiteNumber(overrides.settleHoldSeconds, HERDING_CONFIG.settleHoldSeconds)),
    maxSettleMarks: Math.max(1,
      Math.floor(finiteNumber(overrides.maxSettleMarks, HERDING_CONFIG.maxSettleMarks))),
    influenceRadius: Math.max(0,
      finiteNumber(overrides.influenceRadius, HERDING_CONFIG.influenceRadius)),
    barkRadius: Math.max(0, finiteNumber(overrides.barkRadius, HERDING_CONFIG.barkRadius)),
    maxMovementSeconds: Math.max(0,
      finiteNumber(overrides.maxMovementSeconds, HERDING_CONFIG.maxMovementSeconds)),
    maxSimulationStep: Math.max(EPSILON,
      finiteNumber(overrides.maxSimulationStep, HERDING_CONFIG.maxSimulationStep)),
  });
}

function configuredPosition(positions, blueprint, index, fallback) {
  if (Array.isArray(positions) && positions[index] != null) return positions[index];
  if (positions && typeof positions === "object" && positions[blueprint.id] != null) {
    return positions[blueprint.id];
  }
  return fallback;
}

function isInSettledZone(x, config) {
  return x + EPSILON >= config.settledZone.min && x - EPSILON <= config.settledZone.max;
}

function settledIds(sheep, config) {
  return sheep.filter(({ x }) => isInSettledZone(x, config)).map(({ id }) => id);
}

/**
 * Create the six-sheep flock.
 *
 * Both `createFlock(seed, options)` and `createFlock({ seed, rng, config })`
 * are supported. An injected rng is consumed only during construction, so the
 * resulting plain-data state remains replayable and serializable.
 */
export function createFlock(seedOrOptions = 0, additionalOptions = {}) {
  const options = normalizeCreateOptions(seedOrOptions, additionalOptions);
  const seed = options.seed ?? 0;
  const rng = typeof options.rng === "function" ? options.rng : seededRng(seed);
  const config = normalizeConfig(options.config);
  const now = finiteNumber(options.now, 0);
  const sheep = SHEEP_BLUEPRINTS.map((blueprint, index) => {
    const positionJitter = (safeRandom(rng) * 2 - 1) * 0.012;
    const requestedX = configuredPosition(
      options.initialPositions,
      blueprint,
      index,
      DEFAULT_POSITIONS[index] + positionJitter,
    );
    return {
      ...blueprint,
      x: clamp(requestedX, config.minX, config.maxX),
      wanderPhase: safeRandom(rng) * Math.PI * 2,
      wanderPeriod: 5.5 + safeRandom(rng) * 4.5,
      scatterUntil: null,
      scatterDirection: 0,
      complianceUntil: null,
      lastBarkedAt: null,
    };
  });
  const count = settledIds(sheep, config).length;
  const initiallySettled = count >= config.settledRequired;

  return {
    seed,
    config,
    sheep,
    settleMarks: 0,
    settleArmed: true,
    settledSince: initiallySettled ? now : null,
    lastSettleAwardAt: null,
    lastUpdateAt: now,
    completed: false,
  };
}

function normalizeFocusBoost(value) {
  if (value === true) return 1;
  if (value === false || value == null) return 0;
  return clamp(value, 0, 1);
}

function deterministicDirection(sheep, charlieX, index, zoneCenter) {
  const relative = sheep.x - charlieX;
  if (Math.abs(relative) > EPSILON) return Math.sign(relative);
  const towardZone = zoneCenter - sheep.x;
  if (Math.abs(towardZone) > EPSILON) return Math.sign(towardZone);
  return index % 2 === 0 ? -1 : 1;
}

function simulateMovement(sheep, config, action, duration, startAt) {
  if (duration <= 0) return sheep;
  const steps = Math.max(1, Math.ceil(duration / config.maxSimulationStep));
  const stepDt = duration / steps;
  const focusBoost = normalizeFocusBoost(action.focusBoost);
  const influenceRadius = config.influenceRadius * (1 + focusBoost * config.focusRadiusBoost);
  const speedBoost = 1 + focusBoost * config.focusSpeedBoost;
  const charlieX = clamp(action.charlieX, config.minX, config.maxX);
  const charliePresent = action.charlieX != null && Number.isFinite(Number(action.charlieX));
  const onSheepLane = action.charlieLane === config.sheepLane;
  const zoneCenter = (config.settledZone.min + config.settledZone.max) / 2;
  let moved = sheep.map((item) => ({ ...item }));

  for (let step = 0; step < steps; step += 1) {
    const stepNow = startAt + (step + 0.5) * stepDt;
    const centroid = moved.reduce((sum, item) => sum + item.x, 0) / moved.length;
    moved = moved.map((item, index) => {
      const distanceFromCharlie = Math.abs(item.x - charlieX);
      const isCompliant = !item.stubborn
        || (item.complianceUntil != null && stepNow < item.complianceUntil - EPSILON);
      const feelsPressure = charliePresent
        && onSheepLane
        && isCompliant
        && influenceRadius > 0
        && distanceFromCharlie <= influenceRadius;
      const isScattering = !item.stubborn
        && item.scatterUntil != null
        && stepNow < item.scatterUntil - EPSILON;
      let velocity = 0;

      if (isScattering) {
        velocity = item.scatterDirection * config.barkScatterSpeed;
      } else if (feelsPressure) {
        const pressure = 1 - distanceFromCharlie / influenceRadius;
        const direction = deterministicDirection(item, charlieX, index, zoneCenter);
        const speed = item.stubborn ? config.stubbornHerdSpeed : config.herdSpeed;
        velocity = direction * speed * speedBoost * (0.4 + pressure * 0.6);
      } else {
        const wanderWave = Math.sin((stepNow / item.wanderPeriod) * Math.PI * 2 + item.wanderPhase);
        velocity = wanderWave * config.wanderSpeed;
      }

      if (!isScattering) {
        const cohesionDelta = centroid - item.x;
        const excess = Math.max(0, Math.abs(cohesionDelta) - config.cohesionSlack);
        if (excess > 0) {
          velocity += Math.sign(cohesionDelta)
            * config.cohesionSpeed
            * Math.min(1, excess / Math.max(config.cohesionSlack, EPSILON));
        }
      }

      return {
        ...item,
        x: clamp(item.x + velocity * stepDt, config.minX, config.maxX),
      };
    });
  }

  return moved;
}

function updateSettleGoal(state, sheep, now) {
  const { config } = state;
  const count = settledIds(sheep, config).length;
  let settleMarks = state.settleMarks;
  let settleArmed = state.settleArmed;
  let settledSince = state.settledSince;
  let lastSettleAwardAt = state.lastSettleAwardAt;

  if (settleMarks >= config.maxSettleMarks) {
    return {
      settleMarks: config.maxSettleMarks,
      settleArmed: false,
      settledSince: null,
      lastSettleAwardAt,
      completed: true,
    };
  }

  if (count < config.settledRequired) {
    // Earned marks never disappear. Dropping below the threshold simply rearms
    // the next gentle hold attempt and clears its in-progress clock.
    settleArmed = true;
    settledSince = null;
  } else if (!settleArmed) {
    // One parked group can earn only one mark. Charlie must regroup at least
    // one sheep before another three-second hold can begin.
    settledSince = null;
  } else {
    if (settledSince == null) settledSince = now;
    if (now - settledSince + EPSILON >= config.settleHoldSeconds) {
      settleMarks += 1;
      settleArmed = false;
      settledSince = null;
      lastSettleAwardAt = now;
    }
  }

  return {
    settleMarks,
    settleArmed,
    settledSince,
    lastSettleAwardAt,
    completed: settleMarks >= config.maxSettleMarks,
  };
}

/** Advance wandering, positional herding, cohesion, and the settle objective. */
export function updateFlock(state, action = {}) {
  if (!state || !Array.isArray(state.sheep) || !state.config) {
    throw new TypeError("A flock state created by createFlock is required");
  }
  const dt = Math.max(0, finiteNumber(action.dt, 0));
  const fallbackNow = finiteNumber(state.lastUpdateAt, 0) + dt;
  const now = Math.max(finiteNumber(state.lastUpdateAt, 0), finiteNumber(action.now, fallbackNow));
  const movementSeconds = Math.min(dt, state.config.maxMovementSeconds);
  const movementStart = now - movementSeconds;
  const sheep = simulateMovement(state.sheep, state.config, action, movementSeconds, movementStart);
  const settleGoal = updateSettleGoal(state, sheep, now);

  return {
    ...state,
    sheep,
    ...settleGoal,
    lastUpdateAt: now,
  };
}

/**
 * Apply a bark on the sheep lane.
 *
 * Nearby ordinary sheep scatter briefly away from Charlie. A nearby stubborn
 * sheep does not teleport; it becomes position-herdable for a short window.
 */
export function barkAtFlock(state, action = {}) {
  if (!state || !Array.isArray(state.sheep) || !state.config) {
    throw new TypeError("A flock state created by createFlock is required");
  }
  const now = Math.max(finiteNumber(state.lastUpdateAt, 0), finiteNumber(action.now, state.lastUpdateAt));
  const charlieX = clamp(action.charlieX, state.config.minX, state.config.maxX);
  const hasCharlieX = action.charlieX != null && Number.isFinite(Number(action.charlieX));
  if (!hasCharlieX) return { ...state };

  const sheep = state.sheep.map((item, index) => {
    const distance = Math.abs(item.x - charlieX);
    if (distance > state.config.barkRadius + EPSILON) return item;

    if (item.stubborn) {
      return {
        ...item,
        complianceUntil: Math.max(
          finiteNumber(item.complianceUntil, -Infinity),
          now + state.config.stubbornComplianceSeconds,
        ),
        lastBarkedAt: now,
      };
    }

    const zoneCenter = (state.config.settledZone.min + state.config.settledZone.max) / 2;
    return {
      ...item,
      scatterUntil: Math.max(
        finiteNumber(item.scatterUntil, -Infinity),
        now + state.config.barkScatterSeconds,
      ),
      scatterDirection: deterministicDirection(item, charlieX, index, zoneCenter),
      lastBarkedAt: now,
    };
  });

  return { ...state, sheep, lastUpdateAt: now };
}

/** Compact rendering/objective summary derived from flock state. */
export function getFlockStatus(state) {
  if (!state || !Array.isArray(state.sheep) || !state.config) {
    throw new TypeError("A flock state created by createFlock is required");
  }
  const now = finiteNumber(state.lastUpdateAt, 0);
  const inZoneIds = settledIds(state.sheep, state.config);
  const centroid = state.sheep.reduce((sum, item) => sum + item.x, 0) / state.sheep.length;
  const deviations = state.sheep.map(({ x }) => Math.abs(x - centroid));
  const meanDeviation = deviations.reduce((sum, value) => sum + value, 0) / deviations.length;
  const availableHalfWidth = Math.max(EPSILON, (state.config.maxX - state.config.minX) / 2);
  const cohesion = clamp(1 - meanDeviation / availableHalfWidth, 0, 1);
  const holdElapsed = state.settledSince == null
    ? 0
    : clamp(now - state.settledSince, 0, state.config.settleHoldSeconds);

  return {
    total: state.sheep.length,
    settledCount: inZoneIds.length,
    inZoneIds,
    requiredSettled: state.config.settledRequired,
    settleMarks: state.settleMarks,
    maxSettleMarks: state.config.maxSettleMarks,
    settleArmed: state.settleArmed,
    needsRegroup: !state.settleArmed && !state.completed,
    settledFor: holdElapsed,
    settleProgress: state.settleArmed
      ? clamp(holdElapsed / state.config.settleHoldSeconds, 0, 1)
      : 0,
    completed: state.completed,
    centroid,
    cohesion,
    stubbornIds: state.sheep.filter(({ stubborn }) => stubborn).map(({ id }) => id),
    compliantStubbornIds: state.sheep
      .filter(({ stubborn, complianceUntil }) => stubborn
        && complianceUntil != null
        && now < complianceUntil - EPSILON)
      .map(({ id }) => id),
    scatteringIds: state.sheep
      .filter(({ stubborn, scatterUntil }) => !stubborn
        && scatterUntil != null
        && now < scatterUntil - EPSILON)
      .map(({ id }) => id),
  };
}
