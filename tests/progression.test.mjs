import test from "node:test";
import assert from "node:assert/strict";

import {
  COLLAR_TAGS,
  DEFAULT_TRAVEL_ASSIGNMENT_ID,
  MODE_CONFIGS,
  PATROLS,
  RANKS,
  TRAVEL_ASSIGNMENTS,
  getDailyConfig,
  getRankForStampCount,
} from "../content.js";
import {
  HISTORY_LIMIT,
  LEGACY_BEST_SCORE_KEY,
  PROFILE_STORAGE_KEY,
  PROFILE_VERSION,
  countPawStamps,
  createDefaultProfile,
  loadProfile,
  normalizeProfile,
  updateProfile,
} from "../profile.js";
import {
  applyRun,
  equipCollarTag,
  evaluatePatrolObjectives,
  evaluateTravelObjectives,
  getProgressionSnapshot,
  isModeUnlocked,
  normalizeRunResult,
} from "../progression.js";

const NOW = "2026-07-09T10:15:00.000Z";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    dump() {
      return Object.fromEntries(values);
    },
  };
}

function qualifyingRun(patrolId, overrides = {}) {
  const statsByPatrol = {
    "regular-shift": { safetyRemaining: 3, switches: 3, barks: 12, guarded: 10 },
    "special-delivery": { accuracy: 0.92, barks: 12, friendsSpared: 5, guarded: 10 },
    "important-work-call": { quietResolutions: 2, perfectCrimes: 2, barks: 11, guarded: 9 },
    "chicken-emergency": { chickens: 2, superGuards: 5, barks: 14, guarded: 12 },
    "six-window-surge": { distinctWindowsGuarded: 6, guarded: 18, missed: 0, barks: 22 },
    "mystery-coat-incident": { coatRepelled: 1, missed: 0, patienceRemaining: 50, barks: 20, guarded: 14 },
  };
  return {
    mode: "campaign",
    patrolId,
    completed: true,
    score: 1500,
    durationSeconds: 90,
    stats: statsByPatrol[patrolId],
    ...overrides,
  };
}

test("campaign content defines six ordered cases with three unique Paw Stamps each", () => {
  assert.deepEqual(
    PATROLS.map((patrol) => patrol.id),
    [
      "regular-shift",
      "special-delivery",
      "important-work-call",
      "chicken-emergency",
      "six-window-surge",
      "mystery-coat-incident",
    ],
  );
  assert.ok(PATROLS.every((patrol) => patrol.objectives.length === 3));
  assert.equal(new Set(PATROLS.flatMap((patrol) => patrol.objectives.map((item) => item.id))).size, 18);
  assert.deepEqual(RANKS.map((rank) => rank.stampThreshold), [0, 3, 6, 10, 14, 18]);
  assert.equal(COLLAR_TAGS.length, 4);
  assert.ok(COLLAR_TAGS.every((tag) => tag.advantage && tag.tradeoff && tag.modifiers));
  assert.deepEqual(
    COLLAR_TAGS.find((tag) => tag.id === "hallway-sprinter").modifiers,
    {
      sneakyWindowMultiplier: 1.5,
      relocationAttentionCoolingBonus: 12,
      quietRecoveryMultiplier: 0.75,
    },
  );
  assert.equal(MODE_CONFIGS.endless.unlock.type, "campaignClears");
});

test("daily patrol metadata is deterministic for a date and varies across dates", () => {
  const first = getDailyConfig("2026-07-09");
  const again = getDailyConfig(new Date(2026, 6, 9, 23, 59, 59));
  const nextDay = getDailyConfig("2026-07-10");
  assert.deepEqual(first, again);
  assert.notEqual(first.seed, nextDay.seed);
  assert.ok(PATROLS.some((patrol) => patrol.id === first.patrolId));
  assert.ok(Object.isFrozen(first));
});

test("mode records retain each daily best and the longest overtime watch", () => {
  let profile = createDefaultProfile({ now: NOW });
  for (const score of [720, 540]) {
    profile = applyRun(profile, {
      mode: "daily",
      dailyDateKey: "2026-07-09",
      score,
      durationSeconds: 90,
      completed: true,
    }, { now: NOW }).profile;
  }
  for (const durationSeconds of [42, 65, 51]) {
    profile = applyRun(profile, {
      mode: "endless",
      score: durationSeconds * 10,
      durationSeconds,
      completed: false,
    }, { now: NOW }).profile;
  }

  assert.equal(profile.daily.bestByDate["2026-07-09"], 720);
  assert.equal(profile.lifetime.byMode.endless.longestSeconds, 65);
  assert.equal(normalizeProfile(profile, { now: NOW }).lifetime.byMode.endless.longestSeconds, 65);
});

test("Travel Files are always unlocked and record runs without changing campaign awards", () => {
  const initial = createDefaultProfile({ now: NOW });
  assert.equal(isModeUnlocked(initial, "travel"), true);
  assert.deepEqual(initial.lifetime.byMode.travel, {
    runs: 0,
    clears: 0,
    totalScore: 0,
    bestScore: 0,
    secondsPlayed: 0,
    longestSeconds: 0,
  });

  const runResult = {
    mode: "travel",
    travelAssignmentId: DEFAULT_TRAVEL_ASSIGNMENT_ID,
    completed: true,
    score: 1800,
    durationSeconds: 105,
    stats: {
      guarded: 11,
      missed: 0,
      flockSettled: 3,
      bestFlockSize: 6,
      sheepBarks: 1,
    },
  };
  assert.deepEqual(
    evaluateTravelObjectives(DEFAULT_TRAVEL_ASSIGNMENT_ID, runResult, { now: NOW })
      .map((item) => item.achieved),
    [true, true, true],
  );

  const applied = applyRun(initial, runResult, { now: NOW });
  assert.equal(applied.awards.progressionEligible, false);
  assert.deepEqual(applied.awards.newlyAwardedStampIds, []);
  assert.equal(countPawStamps(applied.profile), 0);
  assert.deepEqual(applied.profile.campaign, initial.campaign);
  assert.equal(applied.profile.lifetime.byMode.travel.runs, 1);
  assert.equal(applied.profile.lifetime.byMode.travel.clears, 1);
  assert.equal(applied.profile.lifetime.flockSettled, 3);
  assert.equal(applied.profile.lifetime.bestFlockSize, 6);
  assert.equal(applied.profile.lifetime.sheepBarks, 1);
  assert.equal(applied.profile.history[0].mode, "travel");
  assert.equal(applied.profile.history[0].travelAssignmentId, DEFAULT_TRAVEL_ASSIGNMENT_ID);
  assert.equal(applied.profile.history[0].stats.bestFlockSize, 6);

  const second = applyRun(applied.profile, {
    ...runResult,
    completed: false,
    score: 900,
    durationSeconds: 60,
    stats: { flockSettled: 1, bestFlockSize: 4, sheepBarks: 2, missed: 1 },
  }, { now: "2026-07-09T10:20:00.000Z" }).profile;
  assert.equal(second.lifetime.flockSettled, 4);
  assert.equal(second.lifetime.bestFlockSize, 6, "best flock size is a high-water mark, not a sum");
  assert.equal(second.lifetime.sheepBarks, 3);
  assert.equal(second.lifetime.byMode.travel.runs, 2);
  assert.equal(second.lifetime.byMode.travel.longestSeconds, 105);
  assert.equal(TRAVEL_ASSIGNMENTS.length, 1);
});

test("travel orders require a completed duty even when their metrics qualify", () => {
  const results = evaluateTravelObjectives(DEFAULT_TRAVEL_ASSIGNMENT_ID, {
    mode: "travel",
    completed: false,
    stats: { flockSettled: 3, missed: 0 },
  }, { now: NOW });
  assert.deepEqual(results.map((item) => item.achieved), [false, false, false]);
  assert.deepEqual(evaluateTravelObjectives("unknown", {}, { now: NOW }), []);
});

test("older profiles normalize Travel File history and additive sheep stats safely", () => {
  const migrated = normalizeProfile({
    version: 2,
    lastMode: "travel",
    history: [{
      mode: "travel",
      assignmentId: DEFAULT_TRAVEL_ASSIGNMENT_ID,
      completed: true,
      score: "700",
      durationSeconds: "80",
      endedAt: NOW,
      stats: { flockSettled: "2", bestFlockSize: "5", sheepBarks: -4 },
    }],
  }, { now: NOW });

  assert.equal(migrated.lastMode, "travel");
  assert.equal(migrated.history[0].travelAssignmentId, DEFAULT_TRAVEL_ASSIGNMENT_ID);
  assert.equal(migrated.history[0].stats.flockSettled, 2);
  assert.equal(migrated.history[0].stats.bestFlockSize, 5);
  assert.equal(migrated.history[0].stats.sheepBarks, 0);
  assert.equal(migrated.lifetime.byMode.travel.runs, 1);
  assert.equal(migrated.lifetime.byMode.travel.bestScore, 700);
  assert.equal(migrated.lifetime.bestFlockSize, 5);
  assert.deepEqual(migrated.campaign.unlockedPatrolIds, ["regular-shift"]);
  assert.equal(countPawStamps(migrated), 0);
});

test("new profiles start at the first patrol with no invented play history", () => {
  const profile = createDefaultProfile({ now: NOW });
  assert.equal(profile.version, PROFILE_VERSION);
  assert.equal(profile.createdAt, NOW);
  assert.equal(profile.bestScore, 0);
  assert.deepEqual(profile.campaign.unlockedPatrolIds, ["regular-shift"]);
  assert.deepEqual(profile.campaign.clearedPatrolIds, []);
  assert.deepEqual(profile.campaign.stampsByPatrol, {});
  assert.equal(profile.campaign.rankId, "self-appointed-security-officer");
  assert.equal(profile.lifetime.runs, 0);
  assert.deepEqual(profile.history, []);
});

test("loadProfile migrates the original high-score key without fabricating runs", () => {
  const storage = memoryStorage({ [LEGACY_BEST_SCORE_KEY]: "4312" });
  const profile = loadProfile(storage, { now: NOW });
  assert.equal(profile.bestScore, 4312);
  assert.equal(profile.lifetime.bestScore, 4312);
  assert.equal(profile.lifetime.byMode.classic.bestScore, 0, "migration must not invent mode history");
  assert.equal(profile.lifetime.runs, 0);
  assert.equal(profile.version, PROFILE_VERSION);
  assert.equal(JSON.parse(storage.getItem(PROFILE_STORAGE_KEY)).bestScore, 4312);
  assert.equal(storage.getItem(LEGACY_BEST_SCORE_KEY), "4312", "migration must not destroy the old key");
});

test("malformed and partial saves recover to a validated, internally consistent profile", () => {
  const brokenStorage = memoryStorage({
    [PROFILE_STORAGE_KEY]: "{this is not json",
    [LEGACY_BEST_SCORE_KEY]: "900",
  });
  const recovered = loadProfile(brokenStorage, { now: NOW });
  assert.equal(recovered.bestScore, 900);
  assert.deepEqual(recovered.campaign.unlockedPatrolIds, ["regular-shift"]);
  assert.doesNotThrow(() => JSON.parse(brokenStorage.getItem(PROFILE_STORAGE_KEY)));

  const partial = normalizeProfile({
    version: 1,
    highScore: "2200",
    selectedCollarTagId: "not-a-real-tag",
    progress: {
      cleared: ["regular-shift", "mystery-coat-incident"],
      stamps: {
        "regular-shift": ["regular-full-safety", "unknown-stamp"],
        "special-delivery": ["delivery-clear"],
        "mystery-coat-incident": ["coat-clear"],
      },
    },
    lifetime: { runs: -8, barks: "NaN" },
  }, { now: NOW });
  assert.equal(partial.version, PROFILE_VERSION);
  assert.equal(partial.bestScore, 2200);
  assert.deepEqual(partial.campaign.clearedPatrolIds, ["regular-shift", "special-delivery"]);
  assert.deepEqual(partial.campaign.unlockedPatrolIds, [
    "regular-shift",
    "special-delivery",
    "important-work-call",
  ]);
  assert.deepEqual(partial.campaign.stampsByPatrol["regular-shift"], [
    "regular-clear",
    "regular-full-safety",
  ]);
  assert.deepEqual(partial.campaign.stampsByPatrol["special-delivery"], ["delivery-clear"]);
  assert.equal(partial.campaign.stampsByPatrol["mystery-coat-incident"], undefined);
  assert.equal(partial.selectedCollarTagId, null);
  assert.equal(partial.lifetime.runs, 0);
  assert.equal(partial.lifetime.barks, 0);
});

test("objective evaluation requires a clear and computes legacy bark accuracy safely", () => {
  const run = normalizeRunResult({
    patrolId: "special-delivery",
    completed: true,
    barks: 10,
    unnecessary: 1,
    friendsSpared: 5,
  }, { now: NOW });
  assert.equal(run.mode, "campaign");
  assert.equal(run.stats.accuracy, 0.9);
  assert.deepEqual(
    evaluatePatrolObjectives("special-delivery", run, { now: NOW }).map((item) => item.achieved),
    [true, true, true],
  );
  assert.deepEqual(
    evaluatePatrolObjectives("special-delivery", { ...run, completed: false }, { now: NOW })
      .map((item) => item.achieved),
    [false, false, false],
  );
});

test("a qualifying clear awards each stamp once, unlocks the next case, and advances rank", () => {
  const initial = createDefaultProfile({ now: NOW });
  const first = applyRun(initial, qualifyingRun("regular-shift"), { now: NOW });
  assert.deepEqual(first.awards.newlyAwardedStampIds, [
    "regular-clear",
    "regular-full-safety",
    "regular-three-switches",
  ]);
  assert.deepEqual(first.awards.newlyUnlockedPatrolIds, ["special-delivery"]);
  assert.deepEqual(first.awards.newlyUnlockedCollarTagIds, ["velvet-voice"]);
  assert.equal(first.awards.rankChanged, true);
  assert.equal(first.profile.campaign.rankId, "certified-curtain-inspector");
  assert.equal(countPawStamps(first.profile), 3);

  const repeated = applyRun(first.profile, qualifyingRun("regular-shift", { score: 1600 }), { now: NOW });
  assert.deepEqual(repeated.awards.newlyAwardedStampIds, []);
  assert.deepEqual(repeated.awards.newlyUnlockedPatrolIds, []);
  assert.equal(countPawStamps(repeated.profile), 3);
  assert.equal(repeated.profile.lifetime.runs, 2, "each actual run still belongs in lifetime totals");
  assert.equal(initial.lifetime.runs, 0, "applyRun must not mutate its input profile");
});

test("locked patrol attempts accumulate lifetime stats but cannot skip campaign progression", () => {
  const initial = createDefaultProfile({ now: NOW });
  const result = applyRun(initial, qualifyingRun("mystery-coat-incident"), { now: NOW });
  assert.equal(result.awards.progressionEligible, false);
  assert.deepEqual(result.awards.newlyAwardedStampIds, []);
  assert.deepEqual(result.profile.campaign.clearedPatrolIds, []);
  assert.deepEqual(result.profile.campaign.unlockedPatrolIds, ["regular-shift"]);
  assert.equal(result.profile.lifetime.runs, 1);
  assert.equal(result.profile.lifetime.clears, 1);
});

test("clearing all cases can earn all 18 stamps, final rank, rewards, and Endless mode", () => {
  let profile = createDefaultProfile({ now: NOW });
  for (const patrol of PATROLS) {
    profile = applyRun(profile, qualifyingRun(patrol.id), { now: NOW }).profile;
  }
  const snapshot = getProgressionSnapshot(profile);
  assert.equal(snapshot.stampCount, 18);
  assert.equal(snapshot.maximumStampCount, 18);
  assert.equal(snapshot.rank.id, "supreme-window-warden");
  assert.equal(snapshot.nextRank, null);
  assert.equal(snapshot.stampsUntilNextRank, 0);
  assert.equal(snapshot.clearedPatrolIds.length, 6);
  assert.deepEqual(snapshot.unlockedCollarTagIds, COLLAR_TAGS.map((tag) => tag.id));
  assert.equal(isModeUnlocked(profile, "endless"), true);
  assert.ok(snapshot.unlockedModeIds.includes("daily"));
  assert.ok(snapshot.unlockedModeIds.includes("endless"));
  assert.equal(getRankForStampCount(999).id, "supreme-window-warden");
});

test("lifetime, mode totals, daily records, personal bests, and capped history accumulate", () => {
  let profile = createDefaultProfile({ now: NOW });
  profile = applyRun(profile, {
    mode: "classic",
    completed: true,
    score: 500,
    durationSeconds: 90,
    stats: { guarded: 7, barks: 10, missed: 1, switches: 2, chickens: 1 },
  }, { now: NOW }).profile;
  profile = applyRun(profile, {
    mode: "daily",
    dailyDateKey: "2026-07-09",
    completed: false,
    score: 800,
    durationSeconds: 45,
    stats: { guarded: 4, barks: 6, missed: 2, perfectCrimes: 1 },
  }, { now: NOW }).profile;

  assert.equal(profile.lifetime.runs, 2);
  assert.equal(profile.lifetime.clears, 1);
  assert.equal(profile.lifetime.failures, 1);
  assert.equal(profile.lifetime.totalScore, 1300);
  assert.equal(profile.lifetime.bestScore, 800);
  assert.equal(profile.lifetime.secondsPlayed, 135);
  assert.equal(profile.lifetime.guarded, 11);
  assert.equal(profile.lifetime.barks, 16);
  assert.equal(profile.lifetime.byMode.classic.runs, 1);
  assert.equal(profile.lifetime.byMode.daily.runs, 1);
  assert.equal(profile.daily.bestByDate["2026-07-09"], 800);
  assert.deepEqual(profile.daily.completedDateKeys, []);

  for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) {
    profile = applyRun(profile, {
      mode: "classic",
      score: index,
      durationSeconds: 1,
      completed: false,
    }, { now: new Date(Date.parse(NOW) + index * 1000) }).profile;
  }
  assert.equal(profile.history.length, HISTORY_LIMIT);
  assert.equal(profile.lifetime.runs, HISTORY_LIMIT + 5);
});

test("collar tags cannot be equipped early and updateProfile remains immutable", () => {
  const initial = createDefaultProfile({ now: NOW });
  assert.throws(() => equipCollarTag(initial, "velvet-voice", { now: NOW }), /still locked/);
  const unlocked = applyRun(initial, qualifyingRun("regular-shift"), { now: NOW }).profile;
  const equipped = equipCollarTag(unlocked, "velvet-voice", { now: NOW });
  assert.equal(equipped.selectedCollarTagId, "velvet-voice");
  assert.equal(unlocked.selectedCollarTagId, null);

  const updated = updateProfile(equipped, (draft) => {
    draft.bestScore = 9999;
    draft.lifetime.runs = -4;
    draft.lifetime.clears = 200;
  }, { now: "2026-07-09T11:00:00.000Z" });
  assert.equal(updated.bestScore, 9999);
  assert.equal(updated.lifetime.runs, 1, "history is the lower bound for a malformed run count");
  assert.equal(updated.lifetime.clears, 1, "clears cannot exceed runs");
  assert.equal(updated.lifetime.failures, 0);
  assert.equal(updated.updatedAt, "2026-07-09T11:00:00.000Z");
  assert.notEqual(updated, equipped);
});
