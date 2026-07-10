import {
  COLLAR_TAGS,
  MODE_CONFIGS,
  PATROLS,
  RANKS,
  getCollarTag,
  getDailyConfig,
  getNextPatrol,
  getPatrol,
  getRankForStampCount,
} from "./content.js";
import {
  HISTORY_LIMIT,
  RUN_STAT_KEYS,
  countPawStamps,
  loadProfile,
  normalizeProfile,
  saveProfile,
  updateProfile,
} from "./profile.js";

const MODE_IDS = new Set(Object.keys(MODE_CONFIGS));
const PATROL_IDS = new Set(PATROLS.map((patrol) => patrol.id));

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value, fallback = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(0, number));
}

function integer(value, fallback = 0) {
  return Math.round(finiteNumber(value, fallback));
}

function timestamp(value, fallback = Date.now()) {
  const date = value instanceof Date ? value : new Date(value ?? fallback);
  if (Number.isFinite(date.getTime())) return date.toISOString();
  return new Date(fallback).toISOString();
}

function sourceMetric(source, stats, key, aliases = []) {
  for (const candidate of [key, ...aliases]) {
    if (stats[candidate] !== undefined) return stats[candidate];
    if (source[candidate] !== undefined) return source[candidate];
  }
  return 0;
}

export function normalizeRunResult(value, { now = Date.now() } = {}) {
  const source = plainObject(value);
  const inputStats = plainObject(source.stats);
  const requestedMode = source.mode;
  const patrolId = PATROL_IDS.has(source.patrolId) ? source.patrolId : null;
  const mode = MODE_IDS.has(requestedMode)
    ? requestedMode
    : patrolId ? "campaign" : "classic";
  const completed = source.completed === true
    || source.cleared === true
    || source.success === true
    || source.result === "complete";
  const endedAt = timestamp(source.endedAt, now);
  const stats = {};

  for (const key of RUN_STAT_KEYS) {
    const aliases = key === "guarded" ? ["guards"]
      : key === "missed" ? ["misses"]
        : key === "unnecessary" ? ["unnecessaryBarks"]
          : [];
    stats[key] = integer(sourceMetric(source, inputStats, key, aliases));
  }

  if (Array.isArray(inputStats.windowsGuarded) || Array.isArray(source.windowsGuarded)) {
    const windows = inputStats.windowsGuarded ?? source.windowsGuarded;
    stats.distinctWindowsGuarded = new Set(windows.map(String)).size;
  }

  const explicitAccuracy = inputStats.accuracy ?? source.accuracy;
  stats.accuracy = explicitAccuracy === undefined
    ? (stats.barks > 0 ? Math.max(0, (stats.barks - stats.unnecessary) / stats.barks) : 0)
    : Math.min(1, finiteNumber(explicitAccuracy, 0, 1));
  stats.bestCombo = integer(sourceMetric(source, inputStats, "bestCombo"));
  stats.safetyRemaining = finiteNumber(sourceMetric(source, inputStats, "safetyRemaining", ["safety"]));
  stats.patienceRemaining = finiteNumber(
    sourceMetric(source, inputStats, "patienceRemaining", ["patiencePercent", "patience"]),
  );

  const dailyDateKey = typeof source.dailyDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.dailyDateKey)
    ? source.dailyDateKey
    : mode === "daily" ? getDailyConfig(endedAt).dateKey : null;
  const score = integer(source.score);
  const durationSeconds = finiteNumber(source.durationSeconds ?? source.elapsed ?? source.duration);
  const id = typeof source.id === "string" && source.id.trim()
    ? source.id.slice(0, 160)
    : null;

  return {
    id,
    mode,
    patrolId,
    dailyDateKey,
    completed,
    score,
    durationSeconds,
    endedAt,
    stats,
  };
}

function readMetric(value, path) {
  if (typeof path !== "string" || !path) return undefined;
  return path.split(".").reduce((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return current[key];
  }, value);
}

function compare(left, operator, right) {
  if (!Number.isFinite(Number(left)) || !Number.isFinite(Number(right))) return false;
  const actual = Number(left);
  const target = Number(right);
  if (operator === ">=") return actual >= target;
  if (operator === ">") return actual > target;
  if (operator === "<=") return actual <= target;
  if (operator === "<") return actual < target;
  if (operator === "===") return actual === target;
  return false;
}

export function evaluateRule(rule, runResult) {
  const condition = plainObject(rule);
  if (condition.type === "completed") return runResult.completed === true;
  if (condition.type === "metric") {
    return compare(readMetric(runResult, condition.metric), condition.operator, condition.target);
  }
  if (condition.type === "all") {
    return Array.isArray(condition.rules)
      && condition.rules.length > 0
      && condition.rules.every((item) => evaluateRule(item, runResult));
  }
  if (condition.type === "any") {
    return Array.isArray(condition.rules)
      && condition.rules.some((item) => evaluateRule(item, runResult));
  }
  return false;
}

export function evaluateObjective(objective, value, options = {}) {
  const run = normalizeRunResult(value, options);
  if (objective?.requiresClear !== false && !run.completed) return false;
  return evaluateRule(objective?.rule, run);
}

export function evaluatePatrolObjectives(patrolId, value, options = {}) {
  const patrol = getPatrol(patrolId);
  if (!patrol) return [];
  const run = normalizeRunResult({ ...plainObject(value), patrolId }, options);
  return patrol.objectives.map((objective) => ({
    objective,
    achieved: evaluateObjective(objective, run, options),
  }));
}

export function isPatrolUnlocked(profile, patrolId) {
  const normalized = normalizeProfile(profile);
  return normalized.campaign.unlockedPatrolIds.includes(patrolId);
}

export function isModeUnlocked(profile, modeId) {
  const config = MODE_CONFIGS[modeId];
  if (!config) return false;
  const normalized = normalizeProfile(profile);
  const rule = config.unlock;
  if (rule.type === "always") return true;
  if (rule.type === "stamps") return countPawStamps(normalized) >= rule.count;
  if (rule.type === "campaignClears") {
    return normalized.campaign.clearedPatrolIds.length >= rule.count;
  }
  return false;
}

export function getUnlockedModeIds(profile) {
  return Object.keys(MODE_CONFIGS).filter((modeId) => isModeUnlocked(profile, modeId));
}

function updatePatrolRecord(draft, run) {
  const old = plainObject(draft.campaign.bestByPatrol[run.patrolId]);
  const priorFastest = finiteNumber(old.fastestClearSeconds);
  const fastestClearSeconds = run.completed && run.durationSeconds > 0
    ? priorFastest > 0 ? Math.min(priorFastest, run.durationSeconds) : run.durationSeconds
    : priorFastest || null;
  draft.campaign.bestByPatrol[run.patrolId] = {
    attempts: integer(old.attempts) + 1,
    clears: integer(old.clears) + (run.completed ? 1 : 0),
    bestScore: Math.max(integer(old.bestScore), run.score),
    bestAccuracy: Math.max(finiteNumber(old.bestAccuracy, 0, 1), run.stats.accuracy),
    bestGuarded: Math.max(integer(old.bestGuarded), run.stats.guarded),
    bestCombo: Math.max(integer(old.bestCombo), run.stats.bestCombo),
    fastestClearSeconds,
    lastPlayedAt: run.endedAt,
  };
}

function accumulateLifetime(draft, run) {
  const lifetime = draft.lifetime;
  lifetime.runs += 1;
  lifetime.clears += run.completed ? 1 : 0;
  lifetime.failures += run.completed ? 0 : 1;
  lifetime.totalScore += run.score;
  lifetime.bestScore = Math.max(lifetime.bestScore, run.score);
  lifetime.secondsPlayed += run.durationSeconds;
  for (const key of RUN_STAT_KEYS) lifetime[key] += run.stats[key];

  const mode = lifetime.byMode[run.mode];
  mode.runs += 1;
  mode.clears += run.completed ? 1 : 0;
  mode.totalScore += run.score;
  mode.bestScore = Math.max(mode.bestScore, run.score);
  mode.secondsPlayed += run.durationSeconds;
  mode.longestSeconds = Math.max(mode.longestSeconds, run.durationSeconds);
}

function historyEntry(run, runNumber) {
  return {
    ...run,
    id: run.id ?? `${run.endedAt}:${run.mode}:${run.patrolId ?? "open"}:${runNumber}`,
  };
}

function setDifference(after, before) {
  const previous = new Set(before);
  return after.filter((item) => !previous.has(item));
}

export function applyRun(profile, value, { now = Date.now() } = {}) {
  const before = normalizeProfile(profile, { now });
  const run = normalizeRunResult(value, { now });
  const beforeStampCount = countPawStamps(before);
  const beforeRankId = before.campaign.rankId;
  const beforeStamps = new Set(Object.values(before.campaign.stampsByPatrol).flat());
  const beforePatrols = before.campaign.unlockedPatrolIds;
  const beforeRewards = before.unlocks.rewardIds;
  const beforeTags = before.unlocks.collarTagIds;
  const progressionEligible = run.mode === "campaign"
    && Boolean(run.patrolId)
    && before.campaign.unlockedPatrolIds.includes(run.patrolId);

  const next = updateProfile(before, (draft) => {
    draft.lastMode = run.mode;
    draft.bestScore = Math.max(draft.bestScore, run.score);
    accumulateLifetime(draft, run);
    draft.history.push(historyEntry(run, draft.lifetime.runs));
    draft.history = draft.history.slice(-HISTORY_LIMIT);

    if (run.mode === "daily" && run.dailyDateKey) {
      draft.daily.bestByDate[run.dailyDateKey] = Math.max(
        integer(draft.daily.bestByDate[run.dailyDateKey]),
        run.score,
      );
      if (run.completed && !draft.daily.completedDateKeys.includes(run.dailyDateKey)) {
        draft.daily.completedDateKeys.push(run.dailyDateKey);
      }
    }

    if (!progressionEligible) return;
    updatePatrolRecord(draft, run);
    const patrol = getPatrol(run.patrolId);
    const earned = evaluatePatrolObjectives(run.patrolId, run, { now })
      .filter((result) => result.achieved)
      .map((result) => result.objective.id);
    const existing = new Set(draft.campaign.stampsByPatrol[run.patrolId] ?? []);
    for (const objectiveId of earned) existing.add(objectiveId);
    draft.campaign.stampsByPatrol[run.patrolId] = patrol.objectives
      .map((objective) => objective.id)
      .filter((objectiveId) => existing.has(objectiveId));

    if (run.completed && !draft.campaign.clearedPatrolIds.includes(run.patrolId)) {
      draft.campaign.clearedPatrolIds.push(run.patrolId);
      const nextPatrol = getNextPatrol(run.patrolId);
      if (nextPatrol && !draft.campaign.unlockedPatrolIds.includes(nextPatrol.id)) {
        draft.campaign.unlockedPatrolIds.push(nextPatrol.id);
      }
    }
  }, { now });

  const afterStampCount = countPawStamps(next);
  const newStampIds = Object.values(next.campaign.stampsByPatrol)
    .flat()
    .filter((objectiveId) => !beforeStamps.has(objectiveId));
  const newRankId = next.campaign.rankId;
  const awards = {
    progressionEligible,
    newlyAwardedStampIds: newStampIds,
    newlyUnlockedPatrolIds: setDifference(next.campaign.unlockedPatrolIds, beforePatrols),
    newlyUnlockedRewardIds: setDifference(next.unlocks.rewardIds, beforeRewards),
    newlyUnlockedCollarTagIds: setDifference(next.unlocks.collarTagIds, beforeTags),
    previousStampCount: beforeStampCount,
    stampCount: afterStampCount,
    previousRankId: beforeRankId,
    rankId: newRankId,
    rankChanged: newRankId !== beforeRankId,
  };

  return { profile: next, run, awards };
}

export function applyRunToProfile(profile, runResult, options = {}) {
  return applyRun(profile, runResult, options).profile;
}

export function applyRunAndSave(storage, runResult, { now = Date.now() } = {}) {
  const current = loadProfile(storage, { now });
  const applied = applyRun(current, runResult, { now });
  const saved = saveProfile(applied.profile, storage, { now });
  return { ...applied, profile: saved };
}

export function equipCollarTag(profile, tagId, { now = Date.now() } = {}) {
  const normalized = normalizeProfile(profile, { now });
  if (tagId === null || tagId === undefined || tagId === "") {
    return updateProfile(normalized, (draft) => {
      draft.selectedCollarTagId = null;
    }, { now });
  }
  if (!getCollarTag(tagId)) throw new RangeError(`Unknown collar tag: ${tagId}`);
  if (!normalized.unlocks.collarTagIds.includes(tagId)) {
    throw new RangeError(`Collar tag is still locked: ${tagId}`);
  }
  return updateProfile(normalized, (draft) => {
    draft.selectedCollarTagId = tagId;
  }, { now });
}

export function getActiveCollarTag(profile) {
  const tagId = normalizeProfile(profile).selectedCollarTagId;
  return tagId ? getCollarTag(tagId) : null;
}

export function getProgressionSnapshot(profile) {
  const normalized = normalizeProfile(profile);
  const stampCount = countPawStamps(normalized);
  const rank = getRankForStampCount(stampCount);
  const nextRank = RANKS.find((candidate) => candidate.stampThreshold > stampCount) ?? null;
  return {
    stampCount,
    maximumStampCount: PATROLS.reduce((total, patrol) => total + patrol.objectives.length, 0),
    rank,
    nextRank,
    stampsUntilNextRank: nextRank ? nextRank.stampThreshold - stampCount : 0,
    unlockedPatrolIds: [...normalized.campaign.unlockedPatrolIds],
    clearedPatrolIds: [...normalized.campaign.clearedPatrolIds],
    unlockedModeIds: getUnlockedModeIds(normalized),
    unlockedRewardIds: [...normalized.unlocks.rewardIds],
    unlockedCollarTagIds: [...normalized.unlocks.collarTagIds],
    selectedCollarTag: normalized.selectedCollarTagId
      ? COLLAR_TAGS.find((tag) => tag.id === normalized.selectedCollarTagId) ?? null
      : null,
  };
}
