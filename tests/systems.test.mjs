import test from "node:test";
import assert from "node:assert/strict";

import {
  AUDIBILITY,
  EVENT_CARDS,
  advanceQuietCompliance,
  applyRoomAttention,
  buildPatrolSchedule,
  buildTodaysPatrol,
  calculateBarkAudibility,
  chooseAdjacentWindow,
  chooseWindowInDifferentRoom,
  consumeCoverCharge,
  consumeSneakyBark,
  createCoverState,
  createListeningState,
  createSeededRng,
  decayRoomAttention,
  grantCoverCharges,
  handleAudibleViolation,
  handleCoveredBark,
  hashSeed,
  nextRandom,
  patrolSeedForDate,
  relocateDuringListening,
  resolveVisitorBehavior,
  selectEventCards,
  shuffle,
  startListening,
} from "../systems.js";

test("hashSeed and pure RNG steps are stable 32-bit values", () => {
  assert.equal(hashSeed("charlie"), hashSeed("charlie"));
  assert.notEqual(hashSeed("charlie"), hashSeed("Charlie"));
  assert.ok(Number.isInteger(hashSeed("charlie")));
  assert.ok(hashSeed("charlie") >= 0 && hashSeed("charlie") <= 0xffffffff);

  const first = nextRandom(12345);
  const replay = nextRandom(12345);
  assert.deepEqual(first, replay);
  assert.ok(first.value >= 0 && first.value < 1);
  assert.notEqual(first.state, 12345);
});

test("createSeededRng replays sequences and keeps different seeds distinct", () => {
  const left = createSeededRng("today's patrol");
  const right = createSeededRng("today's patrol");
  const other = createSeededRng("tomorrow's patrol");
  const leftSequence = Array.from({ length: 20 }, left);
  const rightSequence = Array.from({ length: 20 }, right);
  const otherSequence = Array.from({ length: 20 }, other);

  assert.deepEqual(leftSequence, rightSequence);
  assert.notDeepEqual(leftSequence, otherSequence);
  assert.ok(leftSequence.every((value) => value >= 0 && value < 1));
  assert.equal(left.getState(), right.getState());
});

test("daily seeds are stable across equivalent UTC dates", () => {
  const textSeed = patrolSeedForDate("2026-07-09");
  const dateSeed = patrolSeedForDate(new Date("2026-07-09T23:59:59Z"));
  assert.equal(textSeed, dateSeed);
  assert.notEqual(textSeed, patrolSeedForDate("2026-07-10"));
  assert.notEqual(textSeed, patrolSeedForDate("2026-07-09", "another-mode"));
  assert.throws(() => patrolSeedForDate("definitely-not-a-date"), /valid date/i);
});

test("shuffle is deterministic, non-mutating, and preserves every item", () => {
  const source = ["office", "living", "kitchen", "hall", "balcony"];
  const before = [...source];
  const first = shuffle(source, createSeededRng(42));
  const second = shuffle(source, createSeededRng(42));

  assert.deepEqual(first, second);
  assert.deepEqual(source, before);
  assert.deepEqual([...first].sort(), [...source].sort());
  assert.notDeepEqual(first, source);
});

test("event card selection is replayable, weighted, cloned, and optionally unique", () => {
  const cards = [
    { id: "a", weight: 1, nested: { untouched: true } },
    { id: "b", weight: 2 },
    { id: "disabled", weight: 0 },
  ];
  const unique = selectEventCards(cards, { count: 9, seed: 7 });
  const repeated = selectEventCards(cards, { count: 9, seed: 7, allowRepeats: true });

  assert.equal(unique.length, 2);
  assert.equal(new Set(unique.map(({ id }) => id)).size, 2);
  assert.equal(repeated.length, 9);
  assert.ok(repeated.every(({ id }) => id === "a" || id === "b"));
  assert.deepEqual(repeated, selectEventCards(cards, { count: 9, seed: 7, allowRepeats: true }));
  if (unique[0].nested) unique[0].nested.untouched = false;
  assert.equal(cards[0].nested.untouched, true);
});

test("patrol schedules and their expanded event times replay exactly", () => {
  const options = { cards: EVENT_CARDS, seed: 9988, count: 12, startAt: 1.5, interval: 4, jitter: 0.6 };
  const first = buildPatrolSchedule(options);
  const replay = buildPatrolSchedule(options);
  const other = buildPatrolSchedule({ ...options, seed: 9989 });

  assert.deepEqual(first, replay);
  assert.notDeepEqual(first, other);
  assert.equal(first.length, 12);
  assert.equal(first[0].at, 1.5);
  for (let index = 0; index < first.length; index += 1) {
    assert.ok(index === 0 || first[index].at > first[index - 1].at);
    assert.ok(first[index].events.length > 0);
    assert.ok(first[index].events.every((event) => event.at >= first[index].at));
    assert.ok(first[index].events.every((event) => event.cardId === first[index].cardId));
  }
});

test("Today's Patrol wrapper returns a reproducible dated schedule", () => {
  const first = buildTodaysPatrol({ date: "2026-07-09", count: 8 });
  const replay = buildTodaysPatrol({ date: new Date("2026-07-09T12:00:00Z"), count: 8 });
  const tomorrow = buildTodaysPatrol({ date: "2026-07-10", count: 8 });

  assert.deepEqual(first, replay);
  assert.equal(first.day, "2026-07-09");
  assert.notEqual(first.seed, tomorrow.seed);
  assert.notDeepEqual(first.schedule, tomorrow.schedule);
});

test("room environments map to LOUD, HEARD, and MUFFLED Attention", () => {
  const loud = calculateBarkAudibility({ environment: "video-call" });
  const heard = calculateBarkAudibility({ environment: "normal" });
  const muffled = calculateBarkAudibility({ environment: "tv" });
  const unknown = calculateBarkAudibility({ environment: "unknown" });

  assert.deepEqual([loud.classification, loud.attentionDelta], [AUDIBILITY.LOUD, 58]);
  assert.deepEqual([heard.classification, heard.attentionDelta], [AUDIBILITY.HEARD, 36]);
  assert.deepEqual([muffled.classification, muffled.attentionDelta], [AUDIBILITY.MUFFLED, 18]);
  assert.deepEqual([unknown.classification, unknown.attentionDelta], [AUDIBILITY.HEARD, 36]);
});

test("a cover charge covers exactly one bark regardless of its environment", () => {
  const cover = createCoverState({ source: "kettle", charges: 1, maxCharges: 2, expiresAt: 10 });
  const perfect = calculateBarkAudibility({
    environment: "video-call",
    cover,
    now: 2,
    barkId: "bark-1",
  });
  const next = calculateBarkAudibility({
    environment: "video-call",
    cover: perfect.cover,
    now: 2.1,
    barkId: "bark-2",
  });

  assert.equal(perfect.classification, AUDIBILITY.COVERED);
  assert.equal(perfect.attentionDelta, 0);
  assert.equal(perfect.coverConsumed, 1);
  assert.equal(perfect.cover.charges, 0);
  assert.equal(next.classification, AUDIBILITY.LOUD);
  assert.equal(next.attentionDelta, 58);
  assert.equal(next.coverConsumed, 0);
});

test("duplicate bark ids are idempotent and cannot double-spend cover", () => {
  const cover = createCoverState({ source: "loud-tv", charges: 2 });
  const first = consumeCoverCharge(cover, { now: 1, barkId: 77 });
  const duplicate = consumeCoverCharge(first.cover, { now: 1.01, barkId: 77 });
  const secondBark = consumeCoverCharge(duplicate.cover, { now: 1.02, barkId: 78 });

  assert.deepEqual({ covered: first.covered, consumed: first.consumed, charges: first.cover.charges }, {
    covered: true,
    consumed: 1,
    charges: 1,
  });
  assert.equal(duplicate.covered, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.consumed, 0);
  assert.equal(duplicate.cover.charges, 1);
  assert.equal(secondBark.cover.charges, 0);
});

test("cover grants cap, never go negative, and expire at the deadline", () => {
  let cover = grantCoverCharges(createCoverState({ charges: 0, maxCharges: 2 }), {
    source: "kettle",
    charges: 99,
    expiresAt: 5,
  });
  assert.equal(cover.charges, 2);
  cover = consumeCoverCharge(cover, { now: 1, barkId: 1 }).cover;
  cover = consumeCoverCharge(cover, { now: 2, barkId: 2 }).cover;
  const empty = consumeCoverCharge(cover, { now: 3, barkId: 3 });
  assert.equal(empty.covered, false);
  assert.equal(empty.cover.charges, 0);

  const expiring = createCoverState({ charges: 2, expiresAt: 5 });
  const expired = consumeCoverCharge(expiring, { now: 5, barkId: 1 });
  assert.equal(expired.covered, false);
  assert.equal(expired.cover.charges, 0);
});

test("per-room Attention is immutable, thresholded, and capped at 100", () => {
  const rooms = [{ attention: 10, label: "office" }, { attention: 80 }, { attention: 0 }];
  const audibility = calculateBarkAudibility({ environment: "normal" });
  const applied = applyRoomAttention(rooms, 1, audibility);

  assert.notEqual(applied.rooms, rooms);
  assert.notEqual(applied.rooms[1], rooms[1]);
  assert.equal(applied.rooms[0], rooms[0]);
  assert.equal(rooms[1].attention, 80);
  assert.equal(applied.before, 80);
  assert.equal(applied.after, 100);
  assert.equal(applied.crossedThreshold, true);
  assert.equal(applied.atThreshold, true);

  const again = applyRoomAttention(applied.rooms, 1, audibility);
  assert.equal(again.after, 100);
  assert.equal(again.crossedThreshold, false);
  assert.throws(() => applyRoomAttention(rooms, 9, audibility), /unknown room/i);
});

test("COVERED barks add no Attention and room decay respects occupancy", () => {
  const rooms = { office: { attention: 50 }, living: { attention: 50 }, kitchen: 4 };
  const covered = calculateBarkAudibility({ cover: { charges: 1 }, barkId: "safe" });
  const applied = applyRoomAttention(rooms, "office", covered);
  assert.equal(applied.after, 50);

  const decayed = decayRoomAttention(rooms, { dt: 1, occupiedRoomId: "office" });
  assert.equal(decayed.office.attention, 46);
  assert.equal(decayed.living.attention, 36);
  assert.equal(decayed.kitchen, 0);
  assert.equal(rooms.office.attention, 50);
});

test("Listening has exactly one active room and retargets without accumulating states", () => {
  const initial = createListeningState({ patience: 70 });
  const office = startListening(initial, { roomId: "office", now: 10 });
  const same = startListening(office.state, { roomId: "office", now: 11 });
  const kitchen = startListening(same.state, { roomId: "kitchen", now: 12 });

  assert.deepEqual(office.state.active, { roomId: "office", startedAt: 10, quietSince: 10 });
  assert.equal(same.outcome, "already-listening");
  assert.equal(same.state.active.startedAt, 10);
  assert.equal(kitchen.outcome, "retargeted");
  assert.equal(kitchen.replacedRoomId, "office");
  assert.deepEqual(kitchen.state.active, { roomId: "kitchen", startedAt: 12, quietSince: 12 });
  assert.equal(Array.isArray(kitchen.state.active), false);
});

test("relocating clears Listening and primes one time-limited Sneaky Bark", () => {
  const listening = startListening(createListeningState({ patience: 66 }), {
    roomId: 1,
    now: 5,
  }).state;
  const sameRoom = relocateDuringListening(listening, { toRoomId: 1, now: 6 });
  const moved = relocateDuringListening(listening, { toRoomId: 2, now: 6 });

  assert.equal(sameRoom.outcome, "same-room");
  assert.ok(sameRoom.state.active);
  assert.equal(moved.outcome, "relocated");
  assert.equal(moved.state.active, null);
  assert.equal(moved.state.patience, 66);
  assert.deepEqual(moved.state.sneaky, {
    originRoomId: 1,
    roomId: 2,
    charges: 1,
    expiresAt: 11.5,
  });

  const wrongRoom = consumeSneakyBark(moved.state, { roomId: 0, now: 7 });
  assert.equal(wrongRoom.awarded, false);
  const used = consumeSneakyBark(wrongRoom.state, { roomId: 2, now: 7 });
  assert.equal(used.awarded, true);
  assert.equal(used.state.sneaky, null);
  assert.equal(consumeSneakyBark(used.state, { roomId: 2, now: 7.1 }).awarded, false);
});

test("Sneaky Bark expires and can never be used back in the shushed room", () => {
  const listening = startListening(createListeningState(), { roomId: 0, now: 0 }).state;
  const moved = relocateDuringListening(listening, { toRoomId: 1, now: 1 }).state;
  const origin = consumeSneakyBark(moved, { roomId: 0, now: 2 });
  const expired = consumeSneakyBark(origin.state, { roomId: 1, now: 6.5 });
  assert.equal(origin.outcome, "no-sneaky-bark");
  assert.equal(expired.outcome, "sneaky-expired");
  assert.equal(expired.state.sneaky, null);
});

test("quiet compliance requires 2.5 seconds, then recovers Patience with a cap", () => {
  const listening = startListening(createListeningState({ patience: 92 }), {
    roomId: 1,
    now: 10,
  }).state;
  const early = advanceQuietCompliance(listening, { now: 12.49 });
  const complete = advanceQuietCompliance(early.state, { now: 12.5 });

  assert.equal(early.outcome, "still-listening");
  assert.equal(early.remaining, 0.01);
  assert.ok(early.state.active);
  assert.equal(complete.outcome, "quiet-compliance");
  assert.equal(complete.state.active, null);
  assert.equal(complete.state.patience, 100);
  assert.equal(complete.recovered, 8);
  assert.equal(complete.state.quietCompliances, 1);
});

test("a COVERED bark during Listening is a Perfect Crime but restarts quiet time", () => {
  const listening = startListening(createListeningState({ patience: 55 }), {
    roomId: "living",
    now: 2,
  }).state;
  const covered = handleCoveredBark(listening, { roomId: "living", now: 3.5 });
  const tooSoon = advanceQuietCompliance(covered.state, { now: 5.9 });
  const complete = advanceQuietCompliance(tooSoon.state, { now: 6 });

  assert.equal(covered.outcome, "perfect-crime");
  assert.equal(covered.state.patience, 55);
  assert.equal(covered.state.perfectCrimes, 1);
  assert.equal(covered.state.active.quietSince, 3.5);
  assert.equal(tooSoon.outcome, "still-listening");
  assert.equal(complete.outcome, "quiet-compliance");
});

test("audible Listening violations cost Patience, reset quiet time, and bottom at zero", () => {
  let state = startListening(createListeningState({ patience: 68 }), {
    roomId: "office",
    now: 1,
  }).state;
  const outside = handleAudibleViolation(state, { roomId: "kitchen", now: 2 });
  assert.equal(outside.patienceLost, 0);
  assert.equal(outside.state.patience, 68);

  const first = handleAudibleViolation(outside.state, { roomId: "office", now: 2 });
  assert.equal(first.outcome, "audible-violation");
  assert.equal(first.patienceLost, 34);
  assert.equal(first.state.patience, 34);
  assert.equal(first.state.active.quietSince, 2);

  const second = handleAudibleViolation(first.state, { roomId: "office", now: 2.1 });
  const third = handleAudibleViolation(second.state, { roomId: "office", now: 2.2 });
  assert.equal(second.outcome, "patience-depleted");
  assert.equal(second.state.patience, 0);
  assert.equal(third.state.patience, 0);
  assert.equal(third.patienceLost, 0);
  assert.equal(third.state.violations, 3);
});

test("squirrel hops only to an available adjacent window", () => {
  const squirrel = { id: 1, type: "squirrel", windowId: 2, hp: 1 };
  const before = structuredClone(squirrel);
  const hopped = resolveVisitorBehavior(squirrel, "barked", {
    occupiedWindowIds: [1],
    seed: 3,
  });
  const cornered = resolveVisitorBehavior({ ...squirrel, windowId: 0 }, "barked", {
    occupiedWindowIds: [1],
  });

  assert.equal(hopped.outcome, "squirrel-hopped");
  assert.equal(hopped.movedTo, 3);
  assert.equal(hopped.visitor.windowId, 3);
  assert.equal(cornered.outcome, "squirrel-cornered");
  assert.deepEqual(squirrel, before);
  assert.equal(chooseAdjacentWindow(0, { occupiedWindowIds: [1] }), null);
});

test("a pigeon summons one paired pigeon without recursive pairing", () => {
  const pigeon = { id: 2, type: "pigeon", windowId: 1, hp: 1 };
  const first = resolveVisitorBehavior(pigeon, "spawned", {
    occupiedWindowIds: [1, 2, 3, 4, 5],
    seed: 2,
  });
  assert.equal(first.outcome, "pigeon-summoned-pair");
  assert.equal(first.spawns.length, 1);
  assert.equal(first.spawns[0].windowId, 0);
  assert.deepEqual(first.spawns[0].behavior, { paired: true });

  const child = resolveVisitorBehavior({
    type: "pigeon",
    windowId: 0,
    behavior: first.spawns[0].behavior,
  }, "spawned");
  assert.equal(child.outcome, "pigeon-already-paired");
  assert.deepEqual(child.spawns, []);
});

test("robot reboot can be armed, interrupted by a quick bark, or complete", () => {
  const robot = { id: 3, type: "robot", windowId: 4, hp: 1, maxHp: 2 };
  const armed = resolveVisitorBehavior(robot, { type: "barked", now: 10 });
  assert.equal(armed.outcome, "robot-reboot-armed");
  assert.equal(armed.visitor.behavior.rebootAt, 11.35);

  const interrupted = resolveVisitorBehavior(armed.visitor, { type: "barked", now: 11 });
  assert.equal(interrupted.outcome, "robot-reboot-interrupted");
  assert.equal(interrupted.visitor.behavior.rebootAt, undefined);

  const rearmed = resolveVisitorBehavior(robot, { type: "barked", now: 20 });
  const tooEarly = resolveVisitorBehavior(rearmed.visitor, { type: "tick", now: 21.349 });
  const rebooted = resolveVisitorBehavior(tooEarly.visitor, { type: "tick", now: 21.35 });
  assert.equal(tooEarly.outcome, "no-special-behavior");
  assert.equal(rebooted.outcome, "robot-rebooted");
  assert.equal(rebooted.visitor.hp, 2);
  assert.equal(rebooted.visitor.behavior.rebootAt, undefined);
});

test("postie departure schedules exactly one parcel pirate chain", () => {
  const postie = { id: 9, type: "postie", friendly: true, windowId: 5 };
  const first = resolveVisitorBehavior(postie, "departed");
  const duplicate = resolveVisitorBehavior(first.visitor, "passed");

  assert.equal(first.outcome, "parcel-pirate-scheduled");
  assert.deepEqual(first.spawns, [{
    visitorType: "pirate",
    windowId: 5,
    delay: 1.6,
    reason: "parcel-chain",
    sourceId: 9,
  }]);
  assert.equal(duplicate.outcome, "parcel-chain-already-triggered");
  assert.deepEqual(duplicate.spawns, []);
});

test("ignored leaves spread once after their progress threshold and stop by generation", () => {
  const leaves = { id: 10, type: "leaves", windowId: 4, hp: 1, progress: 0.64 };
  const early = resolveVisitorBehavior(leaves, "tick", { occupiedWindowIds: [4] });
  const ready = resolveVisitorBehavior({ ...leaves, progress: 0.65 }, "tick", {
    occupiedWindowIds: [4],
  });
  const repeated = resolveVisitorBehavior(ready.visitor, "ignored");
  const child = resolveVisitorBehavior({
    type: "leaves",
    windowId: ready.spawns[0].windowId,
    behavior: ready.spawns[0].behavior,
  }, "ignored");

  assert.equal(early.outcome, "leaves-not-ready");
  assert.equal(ready.outcome, "leaves-spread");
  assert.equal(ready.spawns.length, 1);
  assert.equal(ready.spawns[0].windowId, 3);
  assert.equal(repeated.outcome, "leaves-spread-limit");
  assert.equal(child.outcome, "leaves-spread-limit");
});

test("Mystery Coat dodges into a different room and respects occupied windows", () => {
  const coat = { id: 11, type: "coat", windowId: 2, hp: 3 };
  const dodged = resolveVisitorBehavior(coat, "barked", {
    occupiedWindowIds: [0, 1, 2, 3, 4],
  });
  const blocked = resolveVisitorBehavior(coat, "barked", {
    occupiedWindowIds: [0, 1, 2, 3, 4, 5],
  });

  assert.equal(dodged.outcome, "coat-dodged-room");
  assert.equal(dodged.movedTo, 5);
  assert.equal(chooseWindowInDifferentRoom(2, { occupiedWindowIds: [0, 4, 5] }), null);
  assert.equal(blocked.outcome, "coat-cornered");
});
