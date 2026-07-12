import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  COLLAR_TAGS,
  DEFAULT_TRAVEL_ASSIGNMENT_ID,
  MODE_CONFIGS,
  PATROLS,
  RANKS,
  REWARDS,
  TRAVEL_ASSIGNMENTS,
  formatDateKey,
  getDailyConfig,
  getTravelAssignment,
} from "../content.js";
import { DIRECTOR_CARDS, getDirectorCard } from "../events.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const gameSource = await readFile(path.join(projectRoot, "game.js"), "utf8");
const visitorTypes = new Set([
  "squirrel", "pigeon", "robot", "pirate", "leaves", "coat",
  "neighbour", "walker", "postie", "cleaner",
]);

test("the campaign contains six ordered patrols and eighteen unique objectives", () => {
  assert.equal(PATROLS.length, 6);
  assert.deepEqual(PATROLS.map((patrol) => patrol.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(PATROLS.map((patrol) => patrol.id)).size, PATROLS.length);
  const objectives = PATROLS.flatMap((patrol) => patrol.objectives);
  assert.equal(objectives.length, 18);
  assert.equal(new Set(objectives.map((objective) => objective.id)).size, objectives.length);
});

test("Czech Cabin Duty is a separate, always-unlocked Travel File", () => {
  assert.deepEqual(MODE_CONFIGS.travel.unlock, { type: "always" });
  assert.equal(MODE_CONFIGS.travel.progression, false);
  assert.equal(DEFAULT_TRAVEL_ASSIGNMENT_ID, "czech-cabin-duty");
  assert.equal(TRAVEL_ASSIGNMENTS.length, 1);

  const assignment = getTravelAssignment(DEFAULT_TRAVEL_ASSIGNMENT_ID);
  assert.equal(assignment, TRAVEL_ASSIGNMENTS[0]);
  assert.equal(assignment.title, "Czech Cabin Duty");
  assert.equal(assignment.subtitle, "The Sheep Situation");
  assert.match(assignment.tagline, /Two fences\. Six sheep\. Zero respect/i);
  assert.equal(assignment.durationSeconds, 105);
  assert.equal(assignment.arena, "cabin");
  assert.equal(assignment.sheepCount, 6);
  assert.ok(assignment.featuredVisitors.length >= 4);
  assert.deepEqual(
    assignment.travelOrders.map((order) => order.id),
    ["cabin-duty-complete", "cabin-flock-settled", "cabin-top-fence-secure"],
  );
  assert.ok(assignment.travelOrders.every((order) => order.requiresClear));
  assert.ok(Object.isFrozen(assignment));
  assert.equal(PATROLS.some((patrol) => patrol.id === assignment.id), false);
  assert.equal(getTravelAssignment("not-a-travel-file"), null);
});

test("every campaign director card and finale resolves", () => {
  for (const patrol of PATROLS) {
    for (const cardId of [...patrol.director.deck, patrol.director.finale]) {
      assert.ok(getDirectorCard(cardId), `${patrol.id} references missing event card ${cardId}`);
    }
  }
});

test("authored event spawns use known visitors and include the Mystery Coat boss", () => {
  const spawns = DIRECTOR_CARDS.flatMap((card) => card.events)
    .filter((event) => event.kind === "spawn");
  assert.ok(spawns.length >= 45, "Expected a substantial authored encounter library");
  for (const event of spawns) {
    assert.ok(visitorTypes.has(event.visitorType), `Unknown visitor ${event.visitorType}`);
    if (event.windowId !== undefined) assert.ok(event.windowId >= 0 && event.windowId <= 5);
  }
  assert.ok(spawns.some((event) => event.visitorType === "coat" && event.boss && event.hp >= 6));
});

test("rank, sidegrade, and reward thresholds are monotonic", () => {
  for (const collection of [RANKS, COLLAR_TAGS, REWARDS]) {
    const thresholds = collection.map((item) => item.stampThreshold);
    assert.deepEqual(thresholds, [...thresholds].sort((a, b) => a - b));
  }
  assert.equal(RANKS.at(-1).stampThreshold, 18);
  assert.equal(COLLAR_TAGS.length, 4);
});

test("photo rewards reference real local assets", async () => {
  const photoRewards = REWARDS.filter((reward) => reward.type === "photo");
  assert.ok(photoRewards.length >= 3);
  await Promise.all(photoRewards.map(async (reward) => {
    const info = await stat(path.join(projectRoot, reward.asset));
    assert.ok(info.isFile());
    assert.ok(info.size > 0);
  }));
});

test("Today's Patrol is deterministic for a date and changes over time", () => {
  const first = getDailyConfig("2026-07-09");
  const repeat = getDailyConfig("2026-07-09");
  const nextDay = getDailyConfig("2026-07-10");
  assert.deepEqual(first, repeat);
  assert.notEqual(first.seed, nextDay.seed);
  assert.equal(first.mode, "daily");
});

test("Today's Patrol follows the player's local calendar after midnight", () => {
  const localAfterMidnight = new Date(2026, 6, 10, 0, 30);
  assert.equal(formatDateKey(localAfterMidnight), "2026-07-10");
});

test("every declared Daily Patrol modifier is consumed by the game loop", () => {
  const modifierKeys = new Set();
  for (let day = 1; day <= 31; day += 1) {
    const config = getDailyConfig(`2026-07-${String(day).padStart(2, "0")}`);
    for (const key of Object.keys(config.twist)) {
      if (!["id", "label"].includes(key)) modifierKeys.add(key);
    }
  }
  assert.ok(modifierKeys.size >= 4, "Expected all four daily twist mechanics in the sample month");
  for (const key of modifierKeys) {
    assert.ok(
      gameSource.includes(`run.daily?.twist?.${key}`),
      `Daily twist modifier ${key} is declared but never used by game.js`,
    );
  }
});
