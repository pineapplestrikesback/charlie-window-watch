/**
 * Pure gameplay rules for Charlie: Window Watch.
 *
 * This module deliberately owns no timers, DOM, audio, storage, or rendering.
 * Callers provide the current time and state, then apply the returned state and
 * effects. That keeps campaign, daily, classic, and tests on the same rules.
 */

export const AUDIBILITY = Object.freeze({
  LOUD: "LOUD",
  HEARD: "HEARD",
  MUFFLED: "MUFFLED",
  COVERED: "COVERED",
});

export const DEFAULT_ACOUSTICS = deepFreeze({
  attentionByClass: {
    [AUDIBILITY.LOUD]: 58,
    [AUDIBILITY.HEARD]: 36,
    [AUDIBILITY.MUFFLED]: 18,
    [AUDIBILITY.COVERED]: 0,
  },
  environmentClass: {
    normal: AUDIBILITY.HEARD,
    quiet: AUDIBILITY.HEARD,
    "video-call": AUDIBILITY.LOUD,
    office: AUDIBILITY.LOUD,
    tv: AUDIBILITY.MUFFLED,
    "tv-on": AUDIBILITY.MUFFLED,
    kettle: AUDIBILITY.HEARD,
  },
  maxAttention: 100,
  shushThreshold: 100,
  attentionDecayOccupied: 4,
  attentionDecayEmpty: 14,
  maxPatience: 100,
  violationCost: 34,
  quietSeconds: 2.5,
  quietRecovery: 12,
  sneakySeconds: 5.5,
  maxCoverCharges: 2,
});

export const DEFAULT_WINDOWS = deepFreeze([
  { id: 0, roomId: 0, order: 0 },
  { id: 1, roomId: 1, order: 1 },
  { id: 2, roomId: 1, order: 2 },
  { id: 3, roomId: 1, order: 3 },
  { id: 4, roomId: 2, order: 4 },
  { id: 5, roomId: 2, order: 5 },
]);

export const DEFAULT_BEHAVIOR_CONFIG = deepFreeze({
  robotRebootSeconds: 1.35,
  parcelPirateDelay: 1.6,
  leafSpreadProgress: 0.65,
  maxLeafGeneration: 1,
});

export const EVENT_CARDS = deepFreeze([
  {
    id: "regular-scout",
    title: "Regular scout",
    weight: 3,
    events: [{ offset: 0, kind: "spawn", visitorType: "squirrel" }],
  },
  {
    id: "pigeon-party",
    title: "Pigeon party",
    weight: 2,
    events: [{ offset: 0, kind: "spawn", visitorType: "pigeon" }],
  },
  {
    id: "special-delivery",
    title: "Special delivery",
    weight: 2,
    events: [{ offset: 0, kind: "spawn", visitorType: "postie", friendly: true }],
  },
  {
    id: "reboot-required",
    title: "Reboot required",
    weight: 1.5,
    events: [{ offset: 0, kind: "spawn", visitorType: "robot" }],
  },
  {
    id: "leaf-creep",
    title: "Leaf creep",
    weight: 1.5,
    events: [{ offset: 0, kind: "spawn", visitorType: "leaves" }],
  },
  {
    id: "mystery-coat",
    title: "Mystery coat",
    weight: 1,
    events: [{ offset: 0, kind: "spawn", visitorType: "coat" }],
  },
]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function cloneData(value) {
  if (Array.isArray(value)) return value.map(cloneData);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
  }
  return value;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function nonNegativeInteger(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}

function roundMilliseconds(value) {
  return Math.round(value * 1000) / 1000;
}

/** Stable FNV-1a hash suitable for deriving a replayable 32-bit game seed. */
export function hashSeed(input) {
  const text = String(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** One pure Mulberry32 step. */
export function nextRandom(state) {
  const nextState = ((Number(state) >>> 0) + 0x6d2b79f5) >>> 0;
  let mixed = nextState;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { state: nextState, value };
}

/** Stateful convenience wrapper around nextRandom for shuffle/selection calls. */
export function createSeededRng(seed) {
  let state = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  const rng = () => {
    const result = nextRandom(state);
    state = result.state;
    return result.value;
  };
  rng.getState = () => state;
  return rng;
}

function isoDay(date) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new TypeError("A valid date or YYYY-MM-DD string is required");
  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function patrolSeedForDate(date, namespace = "charlie-window-watch") {
  return hashSeed(`${namespace}:${isoDay(date)}`);
}

function safeRngValue(rng) {
  const value = Number(rng());
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.9999999999999999, value));
}

/** Fisher-Yates copy; the input array is never mutated. */
export function shuffle(items, rng = createSeededRng(0)) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(safeRngValue(rng) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function weightedIndex(items, rng) {
  const weights = items.map((item) => Math.max(0, Number(item?.weight ?? 1) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return -1;
  let cursor = safeRngValue(rng) * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return index;
  }
  return weights.length - 1;
}

/** Weighted card draw with optional replacement. Returns cloned card data. */
export function selectEventCards(cards, options = {}) {
  const count = nonNegativeInteger(options.count, cards.length);
  const allowRepeats = Boolean(options.allowRepeats);
  const rng = options.rng ?? createSeededRng(options.seed ?? 0);
  const source = cards.filter((card) => Number(card?.weight ?? 1) > 0);
  const pool = [...source];
  const selected = [];

  while (selected.length < count && (allowRepeats ? source.length : pool.length)) {
    const candidates = allowRepeats ? source : pool;
    const index = weightedIndex(candidates, rng);
    if (index < 0) break;
    selected.push(cloneData(candidates[index]));
    if (!allowRepeats) pool.splice(index, 1);
  }
  return selected;
}

export function expandEventCard(card, options = {}) {
  const at = Number(options.at ?? 0) || 0;
  const instanceId = options.instanceId ?? `${card.id}:0`;
  return (card.events ?? []).map((event, index) => ({
    ...cloneData(event),
    id: `${instanceId}:event:${index}`,
    cardId: card.id,
    at: roundMilliseconds(at + (Number(event.offset) || 0)),
  }));
}

/** Build a complete, replayable card schedule from one seed. */
export function buildPatrolSchedule(options = {}) {
  const cards = options.cards ?? EVENT_CARDS;
  const seed = options.seed ?? 0;
  const rng = options.rng ?? createSeededRng(seed);
  const count = nonNegativeInteger(options.count, cards.length);
  const startAt = Math.max(0, Number(options.startAt ?? 2) || 0);
  const interval = Math.max(0, Number(options.interval ?? 6) || 0);
  const jitter = Math.max(0, Number(options.jitter ?? 0.75) || 0);
  const selected = selectEventCards(cards, {
    count,
    allowRepeats: options.allowRepeats ?? true,
    rng,
  });
  let at = startAt;

  return selected.map((card, index) => {
    if (index > 0) at += interval + ((safeRngValue(rng) * 2) - 1) * jitter;
    at = Math.max(0, at);
    const roundedAt = roundMilliseconds(at);
    const id = `${card.id}:${index}`;
    return {
      id,
      cardId: card.id,
      title: card.title ?? card.id,
      at: roundedAt,
      events: expandEventCard(card, { at: roundedAt, instanceId: id }),
    };
  });
}

export function buildTodaysPatrol(options = {}) {
  const day = isoDay(options.date);
  const seed = patrolSeedForDate(day, options.namespace);
  return {
    day,
    seed,
    schedule: buildPatrolSchedule({ ...options, seed }),
  };
}

export function createCoverState(options = {}) {
  const maxCharges = Math.max(1, nonNegativeInteger(
    options.maxCharges,
    DEFAULT_ACOUSTICS.maxCoverCharges,
  ));
  const expiresAt = options.expiresAt == null ? null : Number(options.expiresAt);
  return {
    source: options.source ?? null,
    charges: Math.min(maxCharges, nonNegativeInteger(options.charges)),
    maxCharges,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    lastBarkId: options.lastBarkId ?? null,
    lastBarkCovered: Boolean(options.lastBarkCovered),
  };
}

function expireCover(cover, now) {
  const normalized = createCoverState(cover);
  if (normalized.expiresAt != null && now >= normalized.expiresAt) {
    return { ...normalized, charges: 0 };
  }
  return normalized;
}

export function grantCoverCharges(cover, options = {}) {
  const now = Number(options.now ?? 0) || 0;
  const current = expireCover(cover ?? {}, now);
  const maxCharges = Math.max(1, nonNegativeInteger(
    options.maxCharges,
    current.maxCharges || DEFAULT_ACOUSTICS.maxCoverCharges,
  ));
  const amount = nonNegativeInteger(options.charges ?? options.amount, 1);
  const expiresAt = options.expiresAt == null ? current.expiresAt : Number(options.expiresAt);
  return {
    ...current,
    source: options.source ?? current.source,
    charges: Math.min(maxCharges, current.charges + amount),
    maxCharges,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  };
}

/**
 * Consume at most one cover charge for one bark. A repeated barkId is
 * idempotent, preventing duplicate input handlers from consuming twice.
 */
export function consumeCoverCharge(cover, options = {}) {
  const now = Number(options.now ?? 0) || 0;
  const barkId = options.barkId ?? null;
  const current = expireCover(cover ?? {}, now);
  if (barkId != null && current.lastBarkId === barkId) {
    return {
      cover: current,
      covered: current.lastBarkCovered,
      consumed: 0,
      duplicate: true,
    };
  }

  const covered = current.charges > 0;
  const next = {
    ...current,
    charges: covered ? current.charges - 1 : 0,
    lastBarkId: barkId,
    lastBarkCovered: covered,
  };
  return { cover: next, covered, consumed: covered ? 1 : 0, duplicate: false };
}

function classForEnvironment(environment, config) {
  if (environment && typeof environment === "object") {
    const requested = environment.classification;
    return Object.values(AUDIBILITY).includes(requested) && requested !== AUDIBILITY.COVERED
      ? requested
      : AUDIBILITY.HEARD;
  }
  return config.environmentClass[environment] ?? AUDIBILITY.HEARD;
}

/** Resolve one bark's class, Attention delta, and next cover-charge state. */
export function calculateBarkAudibility(options = {}, config = DEFAULT_ACOUSTICS) {
  const coverResult = consumeCoverCharge(options.cover, {
    now: options.now,
    barkId: options.barkId,
  });
  const classification = coverResult.covered
    ? AUDIBILITY.COVERED
    : classForEnvironment(options.environment ?? "normal", config);
  const intensity = Math.max(0, Number(options.intensity ?? 1) || 0);
  const attentionDelta = roundMilliseconds(
    Math.max(0, Number(config.attentionByClass[classification] ?? 0)) * intensity,
  );
  return {
    classification,
    attentionDelta,
    cover: coverResult.cover,
    coverConsumed: coverResult.consumed,
    duplicate: coverResult.duplicate,
    source: coverResult.covered ? coverResult.cover.source : options.environment ?? "normal",
  };
}

function roomAttention(room) {
  if (typeof room === "number") return room;
  return Number(room?.attention ?? 0) || 0;
}

function replaceRoomAttention(room, attention) {
  return typeof room === "number" ? attention : { ...(room ?? {}), attention };
}

/** Apply a bark result to exactly one room while preserving all other state. */
export function applyRoomAttention(rooms, roomId, audibility, config = DEFAULT_ACOUSTICS) {
  const current = rooms?.[roomId];
  if (current == null) throw new RangeError(`Unknown room: ${roomId}`);
  const before = clamp(roomAttention(current), 0, config.maxAttention);
  const after = clamp(before + Math.max(0, audibility.attentionDelta ?? 0), 0, config.maxAttention);
  const nextRooms = Array.isArray(rooms) ? [...rooms] : { ...rooms };
  nextRooms[roomId] = replaceRoomAttention(current, after);
  return {
    rooms: nextRooms,
    roomId,
    before,
    after,
    crossedThreshold: before < config.shushThreshold && after >= config.shushThreshold,
    atThreshold: after >= config.shushThreshold,
    classification: audibility.classification,
  };
}

export function decayRoomAttention(rooms, options = {}, config = DEFAULT_ACOUSTICS) {
  const dt = Math.max(0, Number(options.dt ?? 0) || 0);
  const occupiedRoomId = options.occupiedRoomId;
  const entries = Array.isArray(rooms) ? rooms.entries() : Object.entries(rooms);
  const next = Array.isArray(rooms) ? [...rooms] : { ...rooms };
  for (const [roomId, room] of entries) {
    const occupied = String(roomId) === String(occupiedRoomId);
    const rate = occupied ? config.attentionDecayOccupied : config.attentionDecayEmpty;
    const attention = Math.max(0, roomAttention(room) - Math.max(0, rate) * dt);
    next[roomId] = replaceRoomAttention(room, roundMilliseconds(attention));
  }
  return next;
}

export function createListeningState(options = {}) {
  const maxPatience = Math.max(1, Number(options.maxPatience ?? DEFAULT_ACOUSTICS.maxPatience) || 1);
  return {
    patience: clamp(options.patience ?? maxPatience, 0, maxPatience),
    maxPatience,
    active: null,
    sneaky: null,
    quietCompliances: nonNegativeInteger(options.quietCompliances),
    violations: nonNegativeInteger(options.violations),
    perfectCrimes: nonNegativeInteger(options.perfectCrimes),
  };
}

function normalizeListeningState(state) {
  const base = createListeningState(state);
  return {
    ...base,
    ...state,
    patience: clamp(state?.patience ?? base.patience, 0, state?.maxPatience ?? base.maxPatience),
    maxPatience: Math.max(1, Number(state?.maxPatience ?? base.maxPatience) || 1),
    active: state?.active ? { ...state.active } : null,
    sneaky: state?.sneaky ? { ...state.sneaky } : null,
  };
}

/** Start or retarget the owner's one global Listening state. */
export function startListening(state, options = {}) {
  const current = normalizeListeningState(state);
  if (options.roomId == null) throw new TypeError("roomId is required to start Listening");
  const now = Number(options.now ?? 0) || 0;
  const sameRoom = current.active?.roomId === options.roomId;
  const active = sameRoom && !options.restart
    ? current.active
    : { roomId: options.roomId, startedAt: now, quietSince: now };
  return {
    state: { ...current, active },
    outcome: sameRoom ? "already-listening" : current.active ? "retargeted" : "started",
    replacedRoomId: sameRoom ? null : current.active?.roomId ?? null,
  };
}

export function relocateDuringListening(state, options = {}, config = DEFAULT_ACOUSTICS) {
  const current = normalizeListeningState(state);
  const active = current.active;
  const toRoomId = options.toRoomId;
  if (!active) return { state: current, outcome: "not-listening", sneakyPrimed: false };
  if (toRoomId == null || toRoomId === active.roomId) {
    return { state: current, outcome: "same-room", sneakyPrimed: false };
  }
  const now = Number(options.now ?? 0) || 0;
  const sneakySeconds = Math.max(0, Number(options.sneakySeconds ?? config.sneakySeconds) || 0);
  const sneaky = {
    originRoomId: active.roomId,
    roomId: toRoomId,
    charges: 1,
    expiresAt: now + sneakySeconds,
  };
  return {
    state: { ...current, active: null, sneaky },
    outcome: "relocated",
    sneakyPrimed: true,
  };
}

export function advanceQuietCompliance(state, options = {}, config = DEFAULT_ACOUSTICS) {
  const current = normalizeListeningState(state);
  if (!current.active) return { state: current, outcome: "not-listening", remaining: 0 };
  const now = Number(options.now ?? 0) || 0;
  const required = Math.max(0, Number(options.quietSeconds ?? config.quietSeconds) || 0);
  const elapsed = Math.max(0, now - current.active.quietSince);
  if (elapsed < required) {
    return {
      state: current,
      outcome: "still-listening",
      remaining: roundMilliseconds(required - elapsed),
    };
  }
  const recovery = Math.max(0, Number(options.recovery ?? config.quietRecovery) || 0);
  return {
    state: {
      ...current,
      patience: Math.min(current.maxPatience, current.patience + recovery),
      active: null,
      quietCompliances: current.quietCompliances + 1,
    },
    outcome: "quiet-compliance",
    remaining: 0,
    recovered: Math.min(recovery, current.maxPatience - current.patience),
  };
}

export function handleCoveredBark(state, options = {}) {
  const current = normalizeListeningState(state);
  const now = Number(options.now ?? 0) || 0;
  if (!current.active || current.active.roomId !== options.roomId) {
    return { state: current, outcome: "covered-outside-listening", perfectCrime: false };
  }
  return {
    state: {
      ...current,
      active: { ...current.active, quietSince: now },
      perfectCrimes: current.perfectCrimes + 1,
    },
    outcome: "perfect-crime",
    perfectCrime: true,
  };
}

export function handleAudibleViolation(state, options = {}, config = DEFAULT_ACOUSTICS) {
  const current = normalizeListeningState(state);
  const now = Number(options.now ?? 0) || 0;
  if (!current.active || current.active.roomId !== options.roomId) {
    return { state: current, outcome: "audible-outside-listening", patienceLost: 0 };
  }
  const requestedCost = Math.max(0, Number(options.cost ?? config.violationCost) || 0);
  const patience = Math.max(0, current.patience - requestedCost);
  return {
    state: {
      ...current,
      patience,
      active: { ...current.active, quietSince: now },
      violations: current.violations + 1,
    },
    outcome: patience <= 0 ? "patience-depleted" : "audible-violation",
    patienceLost: current.patience - patience,
  };
}

export function consumeSneakyBark(state, options = {}) {
  const current = normalizeListeningState(state);
  const now = Number(options.now ?? 0) || 0;
  const sneaky = current.sneaky;
  const valid = sneaky
    && sneaky.charges > 0
    && now < sneaky.expiresAt
    && options.roomId === sneaky.roomId
    && options.roomId !== sneaky.originRoomId;
  if (!valid) {
    const expired = sneaky && now >= sneaky.expiresAt;
    return {
      state: expired ? { ...current, sneaky: null } : current,
      outcome: expired ? "sneaky-expired" : "no-sneaky-bark",
      awarded: false,
    };
  }
  return {
    state: { ...current, sneaky: null },
    outcome: "sneaky-bark",
    awarded: true,
  };
}

function windowRoom(windowItem) {
  return windowItem?.roomId ?? windowItem?.room;
}

function sortedWindows(windows) {
  return [...windows].sort((left, right) => {
    const leftOrder = Number(left.order ?? left.id);
    const rightOrder = Number(right.order ?? right.id);
    return leftOrder - rightOrder;
  });
}

function pickWindow(candidates, rng) {
  if (!candidates.length) return null;
  return candidates[Math.floor(safeRngValue(rng) * candidates.length)] ?? candidates[0];
}

export function getAvailableWindows(windows = DEFAULT_WINDOWS, occupiedWindowIds = []) {
  const occupied = new Set(occupiedWindowIds);
  return sortedWindows(windows).filter((windowItem) => !occupied.has(windowItem.id));
}

/** Pick only an immediate left/right neighbour in the physical flat order. */
export function chooseAdjacentWindow(windowId, options = {}) {
  const windows = sortedWindows(options.windows ?? DEFAULT_WINDOWS);
  const occupied = new Set(options.occupiedWindowIds ?? []);
  const index = windows.findIndex((windowItem) => windowItem.id === windowId);
  if (index < 0) return null;
  const candidates = [windows[index - 1], windows[index + 1]]
    .filter(Boolean)
    .filter((windowItem) => !occupied.has(windowItem.id));
  return pickWindow(candidates, options.rng ?? createSeededRng(options.seed ?? 0));
}

export function chooseWindowInDifferentRoom(windowId, options = {}) {
  const windows = options.windows ?? DEFAULT_WINDOWS;
  const current = windows.find((windowItem) => windowItem.id === windowId);
  if (!current) return null;
  const occupied = new Set(options.occupiedWindowIds ?? []);
  const candidates = sortedWindows(windows).filter((windowItem) => (
    windowItem.id !== windowId
    && windowRoom(windowItem) !== windowRoom(current)
    && !occupied.has(windowItem.id)
  ));
  return pickWindow(candidates, options.rng ?? createSeededRng(options.seed ?? 0));
}

function visitorType(visitor) {
  return visitor.visitorType ?? visitor.type ?? visitor.key;
}

function baseBehaviorResult(visitor) {
  return {
    visitor: {
      ...visitor,
      behavior: visitor.behavior ? { ...visitor.behavior } : {},
    },
    movedTo: null,
    spawns: [],
    outcome: "no-special-behavior",
  };
}

function destinationContext(context, visitor) {
  const occupied = new Set(context.occupiedWindowIds ?? []);
  occupied.delete(visitor.windowId);
  return {
    windows: context.windows ?? DEFAULT_WINDOWS,
    occupiedWindowIds: [...occupied],
    rng: context.rng ?? createSeededRng(context.seed ?? 0),
  };
}

/**
 * Resolve one special visitor event.
 *
 * Supported events are `spawned`, `barked`, `tick`, `ignored`, `missed`,
 * `passed`, and `departed`. The returned visitor/spawn directives are new
 * objects; inputs are never modified.
 */
export function resolveVisitorBehavior(visitor, event, context = {}) {
  const result = baseBehaviorResult(visitor);
  const nextVisitor = result.visitor;
  const type = visitorType(visitor);
  const eventData = typeof event === "string" ? { type: event } : (event ?? {});
  const eventType = eventData.type;
  const now = Number(eventData.now ?? context.now ?? 0) || 0;
  const config = { ...DEFAULT_BEHAVIOR_CONFIG, ...(context.config ?? {}) };
  const destinations = destinationContext(context, visitor);

  if (type === "squirrel" && eventType === "barked" && Number(visitor.hp ?? 1) > 0) {
    const target = chooseAdjacentWindow(visitor.windowId, destinations);
    if (target) {
      nextVisitor.windowId = target.id;
      result.movedTo = target.id;
      result.outcome = "squirrel-hopped";
    } else {
      result.outcome = "squirrel-cornered";
    }
    return result;
  }

  if (type === "pigeon" && eventType === "spawned") {
    if (nextVisitor.behavior.paired || nextVisitor.behavior.pairCreated) {
      result.outcome = "pigeon-already-paired";
      return result;
    }
    const available = getAvailableWindows(
      destinations.windows,
      [...destinations.occupiedWindowIds, visitor.windowId],
    );
    const target = pickWindow(available, destinations.rng);
    nextVisitor.behavior.pairCreated = true;
    if (target) {
      result.spawns.push({
        visitorType: "pigeon",
        windowId: target.id,
        delay: 0.35,
        behavior: { paired: true },
        reason: "pigeon-pair",
      });
      result.outcome = "pigeon-summoned-pair";
    } else {
      result.outcome = "pigeon-pair-blocked";
    }
    return result;
  }

  if (type === "robot") {
    const rebootAt = Number(nextVisitor.behavior.rebootAt);
    const hasReboot = Number.isFinite(rebootAt);
    if (eventType === "tick" && hasReboot && now >= rebootAt) {
      const before = Number(nextVisitor.hp ?? 0);
      nextVisitor.hp = Math.min(Number(nextVisitor.maxHp ?? before), before + 1);
      delete nextVisitor.behavior.rebootAt;
      result.outcome = nextVisitor.hp > before ? "robot-rebooted" : "robot-reboot-complete";
      return result;
    }
    if (eventType === "barked") {
      if (Number(nextVisitor.hp ?? 0) <= 0) {
        result.outcome = "robot-defeated";
        return result;
      }
      if (hasReboot && now < rebootAt) {
        delete nextVisitor.behavior.rebootAt;
        result.outcome = "robot-reboot-interrupted";
        return result;
      }
      if (hasReboot && now >= rebootAt) {
        nextVisitor.hp = Math.min(
          Number(nextVisitor.maxHp ?? nextVisitor.hp),
          Number(nextVisitor.hp ?? 0) + 1,
        );
      }
      nextVisitor.behavior.rebootAt = now + Math.max(0, config.robotRebootSeconds);
      result.outcome = hasReboot ? "robot-rebooted-and-rearmed" : "robot-reboot-armed";
      return result;
    }
    return result;
  }

  if (type === "postie" && ["passed", "departed"].includes(eventType)) {
    if (nextVisitor.behavior.parcelChainTriggered) {
      result.outcome = "parcel-chain-already-triggered";
      return result;
    }
    nextVisitor.behavior.parcelChainTriggered = true;
    result.spawns.push({
      visitorType: "pirate",
      windowId: visitor.windowId,
      delay: Math.max(0, config.parcelPirateDelay),
      reason: "parcel-chain",
      sourceId: visitor.id ?? null,
    });
    result.outcome = "parcel-pirate-scheduled";
    return result;
  }

  if (type === "leaves" && ["tick", "ignored", "missed"].includes(eventType)) {
    const generation = nonNegativeInteger(nextVisitor.behavior.generation);
    const progress = Number(eventData.progress ?? visitor.progress ?? 0) || 0;
    const ready = eventType !== "tick" || progress >= config.leafSpreadProgress;
    if (!ready) {
      result.outcome = "leaves-not-ready";
      return result;
    }
    if (nextVisitor.behavior.spreadDone || generation >= config.maxLeafGeneration) {
      result.outcome = "leaves-spread-limit";
      return result;
    }
    const target = chooseAdjacentWindow(visitor.windowId, destinations);
    if (!target) {
      result.outcome = "leaves-spread-blocked";
      return result;
    }
    nextVisitor.behavior.spreadDone = true;
    result.spawns.push({
      visitorType: "leaves",
      windowId: target.id,
      delay: 0.45,
      behavior: { generation: generation + 1 },
      reason: "leaf-spread",
    });
    result.outcome = "leaves-spread";
    return result;
  }

  if (type === "coat" && eventType === "barked" && Number(visitor.hp ?? 1) > 0) {
    const target = chooseWindowInDifferentRoom(visitor.windowId, destinations);
    if (target) {
      nextVisitor.windowId = target.id;
      result.movedTo = target.id;
      result.outcome = "coat-dodged-room";
    } else {
      result.outcome = "coat-cornered";
    }
    return result;
  }

  return result;
}
