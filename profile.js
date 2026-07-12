import {
  COLLAR_TAGS,
  MODE_CONFIGS,
  PATROLS,
  TRAVEL_ASSIGNMENTS,
  getCollarTagsForStampCount,
  getPatrol,
  getRankForStampCount,
  getRewardsForStampCount,
} from "./content.js";

export const PROFILE_STORAGE_KEY = "charlie-window-watch-profile";
export const LEGACY_BEST_SCORE_KEY = "charlie-window-watch-best";
export const PROFILE_VERSION = 2;
export const HISTORY_LIMIT = 40;

export const RUN_STAT_KEYS = Object.freeze([
  "guarded",
  "missed",
  "switches",
  "barks",
  "unnecessary",
  "chickens",
  "coveredBarks",
  "perfectCrimes",
  "quietResolutions",
  "friendsSpared",
  "superGuards",
  "coatRepelled",
  "distinctWindowsGuarded",
  "flockSettled",
  "bestFlockSize",
  "sheepBarks",
]);

const MODE_IDS = new Set(Object.keys(MODE_CONFIGS));
const PATROL_IDS = new Set(PATROLS.map((patrol) => patrol.id));
const TRAVEL_ASSIGNMENT_IDS = new Set(TRAVEL_ASSIGNMENTS.map((assignment) => assignment.id));
const COLLAR_TAG_IDS = new Set(COLLAR_TAGS.map((tag) => tag.id));

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(0, number));
}

function integer(value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.round(finiteNumber(value, fallback, maximum));
}

function ratio(value, fallback = 0) {
  return Math.min(1, finiteNumber(value, fallback, 1));
}

function timestamp(value, fallback) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function nowTimestamp(now = Date.now()) {
  const date = now instanceof Date ? now : new Date(now);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function uniqueAllowed(values, allowed) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && allowed.has(value)))];
}

function emptyModeStats() {
  return { runs: 0, clears: 0, totalScore: 0, bestScore: 0, secondsPlayed: 0, longestSeconds: 0 };
}

function emptyLifetime() {
  return {
    runs: 0,
    clears: 0,
    failures: 0,
    totalScore: 0,
    bestScore: 0,
    secondsPlayed: 0,
    guarded: 0,
    missed: 0,
    switches: 0,
    barks: 0,
    unnecessary: 0,
    chickens: 0,
    coveredBarks: 0,
    perfectCrimes: 0,
    quietResolutions: 0,
    friendsSpared: 0,
    superGuards: 0,
    coatRepelled: 0,
    distinctWindowsGuarded: 0,
    flockSettled: 0,
    bestFlockSize: 0,
    sheepBarks: 0,
    byMode: Object.fromEntries(Object.keys(MODE_CONFIGS).map((mode) => [mode, emptyModeStats()])),
  };
}

export function createDefaultProfile({ now = Date.now(), legacyBestScore = 0 } = {}) {
  const at = nowTimestamp(now);
  const bestScore = integer(legacyBestScore);
  const lifetime = emptyLifetime();
  lifetime.bestScore = bestScore;
  return {
    version: PROFILE_VERSION,
    createdAt: at,
    updatedAt: at,
    bestScore,
    lastMode: "campaign",
    selectedCollarTagId: null,
    campaign: {
      unlockedPatrolIds: [PATROLS[0].id],
      clearedPatrolIds: [],
      stampsByPatrol: {},
      bestByPatrol: {},
      rankId: getRankForStampCount(0).id,
    },
    unlocks: {
      rewardIds: [],
      collarTagIds: [],
    },
    lifetime,
    daily: {
      completedDateKeys: [],
      bestByDate: {},
    },
    history: [],
  };
}

function sourceStamps(raw) {
  const source = plainObject(raw);
  const campaign = plainObject(source.campaign);
  const progress = plainObject(source.progress);
  const progressCampaign = plainObject(progress.campaign);
  return plainObject(
    campaign.stampsByPatrol
      ?? campaign.stamps
      ?? progressCampaign.stampsByPatrol
      ?? progressCampaign.stamps
      ?? progress.stampsByPatrol
      ?? progress.stamps,
  );
}

function sourceClears(raw) {
  const source = plainObject(raw);
  const campaign = plainObject(source.campaign);
  const progress = plainObject(source.progress);
  const progressCampaign = plainObject(progress.campaign);
  return campaign.clearedPatrolIds
    ?? campaign.cleared
    ?? progressCampaign.clearedPatrolIds
    ?? progressCampaign.cleared
    ?? progress.clearedPatrolIds
    ?? progress.cleared
    ?? [];
}

function normalizeCampaign(raw) {
  const explicitClears = new Set(uniqueAllowed(sourceClears(raw), PATROL_IDS));
  const rawStamps = sourceStamps(raw);
  const knownStamps = {};

  for (const patrol of PATROLS) {
    const allowedObjectives = new Set(patrol.objectives.map((item) => item.id));
    const stamps = uniqueAllowed(rawStamps[patrol.id], allowedObjectives);
    knownStamps[patrol.id] = stamps;
    const clearObjective = patrol.objectives.find((item) => item.rule.type === "completed");
    if (clearObjective && stamps.includes(clearObjective.id)) explicitClears.add(patrol.id);
  }

  const clearedPatrolIds = [];
  for (const patrol of PATROLS) {
    if (!explicitClears.has(patrol.id)) break;
    clearedPatrolIds.push(patrol.id);
  }

  const unlockedPatrolIds = [PATROLS[0].id];
  for (const patrolId of clearedPatrolIds) {
    const index = PATROLS.findIndex((patrol) => patrol.id === patrolId);
    if (PATROLS[index + 1]) unlockedPatrolIds.push(PATROLS[index + 1].id);
  }

  const unlocked = new Set(unlockedPatrolIds);
  const stampsByPatrol = {};
  for (const patrol of PATROLS) {
    if (!unlocked.has(patrol.id) && !clearedPatrolIds.includes(patrol.id)) continue;
    const stamps = [...knownStamps[patrol.id]];
    if (clearedPatrolIds.includes(patrol.id)) {
      const clearObjective = patrol.objectives.find((item) => item.rule.type === "completed");
      if (clearObjective && !stamps.includes(clearObjective.id)) stamps.unshift(clearObjective.id);
    }
    if (stamps.length) {
      stampsByPatrol[patrol.id] = patrol.objectives
        .map((item) => item.id)
        .filter((objectiveId) => stamps.includes(objectiveId));
    }
  }

  return { clearedPatrolIds, unlockedPatrolIds, stampsByPatrol };
}

function normalizePatrolRecord(value, fallbackTimestamp) {
  const source = plainObject(value);
  const fastest = finiteNumber(source.fastestClearSeconds, 0);
  const attempts = integer(source.attempts);
  const clears = Math.min(attempts, integer(source.clears));
  return {
    attempts,
    clears,
    bestScore: integer(source.bestScore ?? source.score),
    bestAccuracy: ratio(source.bestAccuracy ?? source.accuracy),
    bestGuarded: integer(source.bestGuarded ?? source.guarded),
    bestCombo: integer(source.bestCombo),
    fastestClearSeconds: fastest > 0 ? fastest : null,
    lastPlayedAt: timestamp(source.lastPlayedAt, fallbackTimestamp),
  };
}

function normalizeRunStats(value) {
  const source = plainObject(value);
  const stats = {};
  for (const key of RUN_STAT_KEYS) stats[key] = integer(source[key]);
  stats.accuracy = ratio(source.accuracy);
  stats.bestCombo = integer(source.bestCombo);
  stats.safetyRemaining = finiteNumber(source.safetyRemaining);
  stats.patienceRemaining = finiteNumber(source.patienceRemaining);
  return stats;
}

function normalizeHistoryEntry(value, index, fallbackTimestamp) {
  const source = plainObject(value);
  const mode = MODE_IDS.has(source.mode) ? source.mode : "classic";
  const patrolId = PATROL_IDS.has(source.patrolId) ? source.patrolId : null;
  const requestedTravelAssignmentId = source.travelAssignmentId ?? source.assignmentId;
  const travelAssignmentId = mode === "travel" && TRAVEL_ASSIGNMENT_IDS.has(requestedTravelAssignmentId)
    ? requestedTravelAssignmentId
    : null;
  const endedAt = timestamp(source.endedAt, fallbackTimestamp);
  return {
    id: typeof source.id === "string" && source.id.trim()
      ? source.id.slice(0, 160)
      : `${endedAt}:${mode}:${patrolId ?? travelAssignmentId ?? "open"}:${index + 1}`,
    mode,
    patrolId,
    travelAssignmentId,
    dailyDateKey: typeof source.dailyDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.dailyDateKey)
      ? source.dailyDateKey
      : null,
    completed: source.completed === true || source.cleared === true,
    score: integer(source.score),
    durationSeconds: finiteNumber(source.durationSeconds),
    endedAt,
    stats: normalizeRunStats(source.stats),
  };
}

function sumHistory(history, selector) {
  return history.reduce((total, entry) => total + selector(entry), 0);
}

function normalizeModeStats(value, history, mode) {
  const source = plainObject(value);
  const modeHistory = history.filter((entry) => entry.mode === mode);
  const historyRuns = modeHistory.length;
  const historyClears = modeHistory.filter((entry) => entry.completed).length;
  const runs = Math.max(integer(source.runs, historyRuns), historyRuns);
  const clears = Math.min(runs, Math.max(integer(source.clears, historyClears), historyClears));
  return {
    runs,
    clears,
    totalScore: Math.max(
      integer(source.totalScore),
      sumHistory(modeHistory, (entry) => entry.score),
    ),
    bestScore: Math.max(
      integer(source.bestScore),
      Math.max(0, ...modeHistory.map((entry) => entry.score)),
    ),
    secondsPlayed: Math.max(
      finiteNumber(source.secondsPlayed),
      sumHistory(modeHistory, (entry) => entry.durationSeconds),
    ),
    longestSeconds: Math.max(
      finiteNumber(source.longestSeconds),
      Math.max(0, ...modeHistory.map((entry) => entry.durationSeconds)),
    ),
  };
}

function normalizeLifetime(value, history, legacyBestScore, profileBestScore) {
  const source = plainObject(value);
  const fallback = emptyLifetime();
  const byModeSource = plainObject(source.byMode);
  const historyRuns = history.length;
  const historyClears = history.filter((entry) => entry.completed).length;
  const runs = Math.max(integer(source.runs, historyRuns), historyRuns);
  const clears = Math.min(runs, Math.max(integer(source.clears, historyClears), historyClears));
  const lifetime = {
    runs,
    clears,
    failures: runs - clears,
    totalScore: Math.max(integer(source.totalScore), sumHistory(history, (entry) => entry.score)),
    bestScore: integer(
      Math.max(
        finiteNumber(source.bestScore),
        finiteNumber(profileBestScore),
        finiteNumber(legacyBestScore),
        Math.max(0, ...history.map((entry) => entry.score)),
      ),
    ),
    secondsPlayed: Math.max(
      finiteNumber(source.secondsPlayed),
      sumHistory(history, (entry) => entry.durationSeconds),
    ),
    byMode: {},
  };

  for (const key of RUN_STAT_KEYS) {
    lifetime[key] = key === "bestFlockSize"
      ? Math.max(integer(source[key]), 0, ...history.map((entry) => entry.stats[key]))
      : Math.max(
        integer(source[key]),
        sumHistory(history, (entry) => entry.stats[key]),
      );
  }
  for (const mode of Object.keys(MODE_CONFIGS)) {
    lifetime.byMode[mode] = normalizeModeStats(byModeSource[mode], history, mode);
  }
  return { ...fallback, ...lifetime };
}

function normalizeDaily(value) {
  const source = plainObject(value);
  const completedDateKeys = [...new Set(
    (Array.isArray(source.completedDateKeys) ? source.completedDateKeys : [])
      .filter((item) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item)),
  )].sort().slice(-120);
  const bestByDate = {};
  const entries = Object.entries(plainObject(source.bestByDate))
    .filter(([dateKey]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-120);
  for (const [dateKey, score] of entries) bestByDate[dateKey] = integer(score);
  return { completedDateKeys, bestByDate };
}

export function countPawStamps(profile) {
  const stamps = plainObject(plainObject(profile).campaign?.stampsByPatrol);
  return PATROLS.reduce((total, patrol) => {
    const allowed = new Set(patrol.objectives.map((item) => item.id));
    return total + uniqueAllowed(stamps[patrol.id], allowed).length;
  }, 0);
}

export function normalizeProfile(raw, { now = Date.now(), legacyBestScore = 0 } = {}) {
  const source = plainObject(raw);
  const at = nowTimestamp(now);
  const createdAt = timestamp(source.createdAt, at);
  const updatedAt = timestamp(source.updatedAt, createdAt);
  const historySource = Array.isArray(source.history) ? source.history.slice(-HISTORY_LIMIT) : [];
  const history = historySource.map((entry, index) => normalizeHistoryEntry(entry, index, updatedAt));
  const campaignCore = normalizeCampaign(source);
  const campaignSource = plainObject(source.campaign ?? plainObject(source.progress).campaign);
  const bestByPatrol = {};
  const rawBestByPatrol = plainObject(campaignSource.bestByPatrol);

  for (const patrol of PATROLS) {
    if (rawBestByPatrol[patrol.id]) {
      bestByPatrol[patrol.id] = normalizePatrolRecord(rawBestByPatrol[patrol.id], updatedAt);
    }
  }

  const provisional = {
    campaign: { ...campaignCore },
  };
  const stampCount = countPawStamps(provisional);
  const unlockedRewards = getRewardsForStampCount(stampCount);
  const unlockedTags = getCollarTagsForStampCount(stampCount);
  const lifetime = normalizeLifetime(
    source.lifetime,
    history,
    legacyBestScore,
    source.bestScore ?? source.highScore ?? source.best,
  );
  const bestScore = integer(Math.max(
    finiteNumber(source.bestScore ?? source.highScore ?? source.best),
    finiteNumber(legacyBestScore),
    lifetime.bestScore,
    ...Object.values(bestByPatrol).map((record) => record.bestScore),
  ));
  lifetime.bestScore = Math.max(lifetime.bestScore, bestScore);

  const requestedTag = source.selectedCollarTagId ?? plainObject(source.loadout).collarTagId;
  const unlockedTagIds = unlockedTags.map((tag) => tag.id);
  const selectedCollarTagId = typeof requestedTag === "string"
    && COLLAR_TAG_IDS.has(requestedTag)
    && unlockedTagIds.includes(requestedTag)
    ? requestedTag
    : null;

  return {
    version: PROFILE_VERSION,
    createdAt,
    updatedAt,
    bestScore,
    lastMode: MODE_IDS.has(source.lastMode) ? source.lastMode : "campaign",
    selectedCollarTagId,
    campaign: {
      ...campaignCore,
      bestByPatrol,
      rankId: getRankForStampCount(stampCount).id,
    },
    unlocks: {
      rewardIds: unlockedRewards.map((reward) => reward.id),
      collarTagIds: unlockedTagIds,
    },
    lifetime,
    daily: normalizeDaily(source.daily),
    history,
  };
}

export function migrateProfile(raw, options = {}) {
  return normalizeProfile(raw, options);
}

function resolveStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function storageGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return Boolean(storage?.setItem);
  } catch {
    return false;
  }
}

function legacyBestFromStorage(storage) {
  return integer(storageGet(storage, LEGACY_BEST_SCORE_KEY));
}

export function loadProfile(storage, { now = Date.now(), persist = true } = {}) {
  const target = resolveStorage(storage);
  const serialized = storageGet(target, PROFILE_STORAGE_KEY);
  let raw = null;
  if (serialized !== null) {
    try {
      raw = JSON.parse(serialized);
    } catch {
      raw = null;
    }
  }
  const profile = normalizeProfile(raw, {
    now,
    legacyBestScore: legacyBestFromStorage(target),
  });
  if (persist && JSON.stringify(raw) !== JSON.stringify(profile)) {
    storageSet(target, PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }
  return profile;
}

export function saveProfile(profile, storage, { now = Date.now() } = {}) {
  const target = resolveStorage(storage);
  const normalized = normalizeProfile(profile, { now });
  const saved = normalizeProfile({ ...normalized, updatedAt: nowTimestamp(now) }, { now });
  storageSet(target, PROFILE_STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export function updateProfile(profile, updater, { now = Date.now() } = {}) {
  if (typeof updater !== "function") throw new TypeError("updateProfile requires an updater function");
  const base = normalizeProfile(profile, { now });
  const draft = JSON.parse(JSON.stringify(base));
  const returned = updater(draft);
  const candidate = returned && typeof returned === "object" ? returned : draft;
  return normalizeProfile({ ...candidate, updatedAt: nowTimestamp(now) }, { now });
}

export function resetProfile(storage, { now = Date.now(), preserveLegacyBest = true } = {}) {
  const target = resolveStorage(storage);
  const legacyBestScore = preserveLegacyBest ? legacyBestFromStorage(target) : 0;
  const profile = createDefaultProfile({ now, legacyBestScore });
  storageSet(target, PROFILE_STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function isKnownPatrolId(patrolId) {
  return Boolean(getPatrol(patrolId));
}
