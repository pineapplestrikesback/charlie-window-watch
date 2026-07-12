import {
  COLLAR_TAGS,
  DEFAULT_TRAVEL_ASSIGNMENT_ID,
  MODE_CONFIGS,
  PATROLS,
  REWARDS,
  RANKS,
  TRAVEL_ASSIGNMENTS,
  getCollarTag,
  getCollarTagsForStampCount,
  getDailyConfig,
  getNextPatrol,
  getPatrol,
  getRankForStampCount,
  getRewardsForStampCount,
  getTravelAssignment,
} from "./content.js";
import { getDirectorCard, getDirectorCards } from "./events.js";
import { countPawStamps, loadProfile, saveProfile } from "./profile.js";
import {
  applyRun,
  equipCollarTag,
  evaluatePatrolObjectives,
  evaluateTravelObjectives,
  getProgressionSnapshot,
  isModeUnlocked,
  isPatrolUnlocked,
} from "./progression.js";
import {
  PET_CELL_HEIGHT,
  PET_CELL_WIDTH,
  getPetAnimationDuration,
  getPetAnimationFrame,
  getPetLookFrame,
} from "./pet-animation.js";
import {
  AUDIBILITY,
  DEFAULT_ACOUSTICS,
  applyRoomAttention,
  advanceQuietCompliance,
  buildPatrolSchedule,
  buildTodaysPatrol,
  calculateBarkAudibility,
  consumeSneakyBark,
  createCoverState,
  createListeningState,
  createSeededRng,
  decayRoomAttention,
  expandEventCard,
  grantCoverCharges,
  handleAudibleViolation,
  handleCoveredBark,
  relocateDuringListening,
  resolveVisitorBehavior,
  startListening,
} from "./systems.js";
import {
  barkAtFlock,
  createFlock,
  getFlockStatus,
  updateFlock,
} from "./herding.js";

const WIDTH = 1280;
const HEIGHT = 720;
const ROUND_SECONDS = 90;
const CHICKEN_GOAL = 5;
const MAX_PATIENCE = 100;
const CABIN_LANE_Y = Object.freeze({ upper: 382, lower: 520 });
const CABIN_FENCE_Y = Object.freeze({ upper: 176, lower: 558 });
const STORAGE = {
  best: "charlie-window-watch-best",
  sound: "charlie-window-watch-sound",
  motion: "charlie-window-watch-motion",
  relaxed: "charlie-window-watch-relaxed",
};

const SOUND_CUES = {
  bark: [
    { src: "assets/audio/bark-front-door-1.mp3", gain: 0.58, rate: [0.94, 1.06] },
    { src: "assets/audio/bark-front-door-2.mp3", gain: 0.58, rate: [0.92, 1.05] },
    { src: "assets/audio/bark-indoor-1.mp3", gain: 0.78, rate: [0.95, 1.08] },
    { src: "assets/audio/bark-indoor-2.mp3", gain: 0.78, rate: [0.93, 1.06] },
  ],
  shush: [
    { src: "assets/audio/shush-1.mp3", gain: 0.58, rate: [0.98, 1.02] },
    { src: "assets/audio/shush-2.mp3", gain: 0.55, rate: [0.97, 1.03] },
  ],
  success: [{ src: "assets/audio/guard-success.mp3", gain: 0.48 }],
  hit: [{ src: "assets/audio/bark-hit.mp3", gain: 0.28 }],
  danger: [{ src: "assets/audio/danger.mp3", gain: 0.34 }],
  chicken: [{ src: "assets/audio/chicken-crunch.mp3", gain: 0.68 }],
  powerUp: [{ src: "assets/audio/power-up.mp3", gain: 0.48 }],
  roomSwitch: [{ src: "assets/audio/room-switch.mp3", gain: 0.26 }],
  doorbell: [{ src: "assets/audio/doorbell.mp3", gain: 0.3 }],
  ui: [{ src: "assets/audio/ui-click.mp3", gain: 0.22 }],
};

const SOUND_URLS = [...new Set(Object.values(SOUND_CUES).flat().map(({ src }) => src))];

const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const canvasWrap = canvas.closest(".canvas-wrap");

const ui = {
  pageShell: $("pageShell"),
  start: $("startScreen"),
  briefing: $("briefingScreen"),
  patrolBook: $("patrolBookScreen"),
  patrolBriefing: $("patrolBriefingScreen"),
  result: $("resultScreen"),
  pause: $("pauseCurtain"),
  campaignButton: $("campaignButton"),
  startButton: $("startButton"),
  dailyButton: $("dailyButton"),
  travelButton: $("travelButton"),
  patrolBookButton: $("patrolBookButton"),
  howButton: $("howButton"),
  briefingBack: $("briefingBack"),
  beginButton: $("beginButton"),
  patrolBookClose: $("patrolBookClose"),
  patrolBriefingBack: $("patrolBriefingBack"),
  beginPatrolButton: $("beginPatrolButton"),
  restartButton: $("restartButton"),
  nextPatrolButton: $("nextPatrolButton"),
  bookFromResultButton: $("bookFromResultButton"),
  resumeButton: $("resumeButton"),
  immersiveExitButton: $("immersiveExitButton"),
  classicControlsButton: $("classicControlsButton"),
  relaxedToggle: $("relaxedToggle"),
  soundToggle: $("soundToggle"),
  motionToggle: $("motionToggle"),
  pauseSoundToggle: $("pauseSoundToggle"),
  pauseMotionToggle: $("pauseMotionToggle"),
  fullscreenButton: $("fullscreenButton"),
  pauseButton: $("pauseButton"),
  time: $("timeValue"),
  phase: $("phaseValue"),
  score: $("scoreValue"),
  bestLabel: $("bestLabel"),
  best: $("highScoreValue"),
  safety: $("safetyValue"),
  patience: $("patienceValue"),
  safetyLabel: $("safetyLabel"),
  patienceLabel: $("patienceLabel"),
  combo: $("comboValue"),
  chickenFill: $("chickenFill"),
  chickenValue: $("chickenValue"),
  chickenButton: $("chickenButton"),
  caption: $("caption"),
  toast: $("toast"),
  ownerBubble: $("ownerBubble"),
  ownerBubbleTitle: $("ownerBubbleTitle"),
  ownerBubbleText: $("ownerBubbleText"),
  ownerQuietProgress: $("ownerQuietProgress"),
  ownerChoiceHint: $("ownerChoiceHint"),
  announcement: $("announcement"),
  profileSummary: $("profileSummary"),
  profileRank: $("profileRank"),
  profileStamps: $("profileStamps"),
  bookRankTitle: $("bookRankTitle"),
  bookRankProgress: $("bookRankProgress"),
  bookStampCount: $("bookStampCount"),
  bookPatrolGrid: $("bookPatrolGrid"),
  bookLifetimeStats: $("bookLifetimeStats"),
  bookGallery: $("bookGallery"),
  patrolBriefingEyebrow: $("patrolBriefingEyebrow"),
  patrolBriefingTitle: $("patrolBriefingTitle"),
  patrolBriefingDescription: $("patrolBriefingDescription"),
  patrolSpecialRule: $("patrolSpecialRule"),
  patrolOrdersHeading: $("patrol-orders-heading"),
  patrolObjectives: $("patrolObjectives"),
  collarTagChoices: $("collarTagChoices"),
  collarTagFieldset: $("collarTagChoices")?.closest("fieldset") ?? null,
  currentPatrolLabel: $("currentPatrolLabel"),
  activeObjective: $("activeObjective"),
  resultPhoto: $("resultPhoto"),
  resultPet: $("resultPetCanvas"),
  resultMode: $("resultMode"),
  resultTitle: $("resultTitle"),
  resultSubtitle: $("resultSubtitle"),
  resultScore: $("resultScore"),
  resultGuards: $("resultGuards"),
  resultSwitches: $("resultSwitches"),
  resultBarks: $("resultBarks"),
  resultCombo: $("resultCombo"),
  resultObjectives: $("resultObjectives"),
  resultObjectivesHeading: $("result-objectives-heading"),
  resultReward: $("resultReward"),
  resultRankProgress: $("resultRankProgress"),
  resultRankLabel: $("resultRankLabel"),
  resultRankTitle: $("resultRankTitle"),
  prevWindow: $("prevWindowButton"),
  nextWindow: $("nextWindowButton"),
  switchFenceButton: $("switchFenceButton"),
  barkButton: $("barkButton"),
  actionDock: document.querySelector(".action-dock"),
  safetyMeter: $("safetyValue").closest('[role="meter"]'),
  patienceMeter: $("patienceValue").closest('[role="meter"]'),
  chickenMeter: $("chickenValue").closest('[role="progressbar"]'),
  header: document.querySelector(".site-header"),
  skipLink: document.querySelector(".skip-link"),
  threatRoster: $("gameStateSummary"),
};

const WINDOWS = [
  { id: 0, room: 0, x: 184, width: 160, label: "office window" },
  { id: 1, room: 1, x: 474, width: 126, label: "living room left window" },
  { id: 2, room: 1, x: 638, width: 126, label: "living room centre window" },
  { id: 3, room: 1, x: 802, width: 126, label: "living room right window" },
  { id: 4, room: 2, x: 1004, width: 126, label: "kitchen left window" },
  { id: 5, room: 2, x: 1160, width: 126, label: "kitchen right window" },
];

const CABIN_SECTORS = WINDOWS.map((windowItem, index) => ({
  ...windowItem,
  room: 0,
  label: `upper fence sector ${index + 1}`,
}));

const CABIN_SCHEDULE = Object.freeze([
  { at: 17, kind: "spawn", visitorType: "walker", friendly: true, windowId: 1 },
  { at: 25, kind: "spawn", visitorType: "squirrel", friendly: false, windowId: 4 },
  { at: 34, kind: "spawn", visitorType: "neighbour", friendly: true, windowId: 3 },
  { at: 41, kind: "spawn", visitorType: "pigeon", friendly: false, windowId: 0 },
  { at: 52, kind: "spawn", visitorType: "robot", friendly: false, windowId: 5 },
  { at: 62, kind: "spawn", visitorType: "walker", friendly: true, windowId: 2 },
  { at: 70, kind: "spawn", visitorType: "squirrel", friendly: false, windowId: 1 },
  { at: 79, kind: "spawn", visitorType: "pigeon", friendly: false, windowId: 4 },
  { at: 88, kind: "spawn", visitorType: "neighbour", friendly: true, windowId: 5 },
  { at: 89.4, kind: "spawn", visitorType: "robot", friendly: false, windowId: 0 },
  { at: 98, kind: "spawn", visitorType: "squirrel", friendly: false, windowId: 3 },
]);

const ROOMS = [
  { id: "office", name: "Office", left: 18, right: 370, centre: 184, windows: [0], floor: "#d9c8aa" },
  { id: "living", name: "Living room", left: 378, right: 902, centre: 638, windows: [1, 2, 3], floor: "#d8b995" },
  { id: "kitchen", name: "Kitchen", left: 910, right: 1262, centre: 1082, windows: [4, 5], floor: "#c5cdb5" },
];

const THREATS = [
  { key: "squirrel", label: "Squirrel scout", icon: "S", hp: 1, color: "#b84d37", behavior: "hop" },
  { key: "pigeon", label: "Pigeon lookout", icon: "P", hp: 1, color: "#7f4c75", behavior: "call-pair" },
  { key: "robot", label: "Runaway robot", icon: "R", hp: 2, color: "#335f73", behavior: "reboot" },
  { key: "pirate", label: "Parcel pirate", icon: "X", hp: 2, color: "#703d38", behavior: "retreat" },
  { key: "leaves", label: "Leaf monster", icon: "L", hp: 1, color: "#96722e", behavior: "spread" },
  { key: "coat", label: "Mystery coat", icon: "?", hp: 3, color: "#423f4e", behavior: "relocate" },
];

const FRIENDS = [
  { key: "neighbour", label: "Friendly neighbour", icon: "HI", color: "#2f7972", benefit: "tip" },
  { key: "walker", label: "Dog walker", icon: "♥", color: "#326e89", benefit: "chicken" },
  { key: "postie", label: "The postie", icon: "✉", color: "#3c6e62", benefit: "parcel" },
  { key: "cleaner", label: "Window cleaner", icon: "◇", color: "#286b72", benefit: "clean-window" },
];

const dogImage = new Image();
let dogReady = false;
dogImage.addEventListener("load", () => {
  dogReady = true;
  canvasWrap.dataset.petAtlas = `${dogImage.naturalWidth}x${dogImage.naturalHeight}`;
});
dogImage.addEventListener("error", () => {
  dogReady = false;
  canvasWrap.dataset.petAtlas = "error";
});
dogImage.src = "assets/pets/charlie/spritesheet-v2-46865c3d5305.webp";

const safeGet = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

const safeSet = (key, value) => {
  try { localStorage.setItem(key, String(value)); } catch { /* storage is optional */ }
};

const boolSetting = (key, fallback) => safeGet(key, fallback ? "1" : "0") !== "0";
const settings = {
  sound: boolSetting(STORAGE.sound, true),
  motion: boolSetting(STORAGE.motion, !matchMedia("(prefers-reduced-motion: reduce)").matches),
  relaxed: boolSetting(STORAGE.relaxed, false),
};

let profile = loadProfile();
let bestScore = Math.max(profile.bestScore, Number.parseInt(safeGet(STORAGE.best, "0"), 10) || 0);
let pendingRun = {
  mode: "campaign",
  patrolId: profile.campaign.unlockedPatrolIds.at(-1) ?? PATROLS[0].id,
  collarTagId: profile.selectedCollarTagId,
  seed: null,
};
let lastAwards = null;
let patrolBriefingReturn = "book";
let patrolBookReturn = "title";
let screen = "title";
let game = null;
let lastFrame = performance.now();
let toastTimer = 0;
let audioContext = null;
let masterGain = null;
let soundLoadPromise = null;
let soundLoadState = "idle";
let lastSoundCue = null;
let lastSoundMode = "none";
const audioBuffers = new Map();
const activeSounds = new Set();
const failedSoundUrls = new Set();
const lastSoundChoice = new Map();
let previousFocus = null;
let resultAnimationStartedAt = 0;
let immersiveClassicControls = false;
const canvasGestures = new Map();
let activeDragPointer = null;
const fullscreenState = {
  fallback: false,
  scrollY: 0,
  nativeActive: false,
  transitioning: false,
  silentExit: false,
  ignoreEscapeUntil: 0,
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const choose = (items) => items[Math.floor(Math.random() * items.length)];
const roomForWindow = (windowId) => WINDOWS[windowId].room;
const currentWindow = () => WINDOWS[game?.selectedWindow ?? 2];
const isCabinRun = (run = game?.run) => run?.arena === "cabin" || run?.mode === "travel";
const activeSectors = (run = game?.run) => isCabinRun(run) ? CABIN_SECTORS : WINDOWS;
const currentTarget = () => activeSectors()[game?.selectedWindow ?? 2];
const targetLabel = (windowId) => activeSectors()[windowId]?.label ?? `sector ${Number(windowId) + 1}`;
const cabinNormalizedX = (x = game?.charlieX ?? WIDTH / 2) => clamp((Number(x) - 64) / (WIDTH - 128), 0, 1);
const cabinCanvasX = (x = 0.5) => 64 + clamp(Number(x) || 0, 0, 1) * (WIDTH - 128);
const flockOrderPercent = (status = game?.flockStatus) => {
  if (!status) return 0;
  const formation = clamp(status.settledCount / Math.max(1, status.requiredSettled), 0, 1);
  const hold = clamp(status.settleProgress ?? 0, 0, 1);
  return Math.round((formation * 0.8 + hold * 0.2) * 100);
};

function setPetReaction(state, options = {}) {
  if (!game) return;
  const duration = options.duration ?? getPetAnimationDuration(state);
  game.petReaction = {
    state,
    startedAt: game.elapsed,
    until: game.elapsed + duration,
  };
}

function resolvePetPose() {
  const idle = (source = "idle") => ({
    ...getPetAnimationFrame("idle", game?.elapsed ?? 0, 0, {
      loop: true,
      reducedMotion: !settings.motion,
    }),
    source,
  });
  if (!game || !settings.motion) return idle("reduced-motion");

  const travelDistance = game.targetX - game.charlieX;
  const verticalTravel = (game.targetY ?? game.charlieY ?? 0) - (game.charlieY ?? game.targetY ?? 0);
  if (Math.hypot(travelDistance, verticalTravel) > 1.2) {
    const state = Math.abs(travelDistance) < Math.abs(verticalTravel)
      ? "running"
      : travelDistance >= 0 ? "running-right" : "running-left";
    return {
      ...getPetAnimationFrame(state, game.elapsed, game.movementStartedAt, { loop: true }),
      source: "movement",
    };
  }

  if (game.petReaction && game.elapsed < game.petReaction.until) {
    return {
      ...getPetAnimationFrame(
        game.petReaction.state,
        game.elapsed,
        game.petReaction.startedAt,
        { loop: false },
      ),
      source: "reaction",
    };
  }

  if (!isCabinRun() && game.listening.active) {
    return {
      ...getPetAnimationFrame("waiting", game.elapsed, game.listening.active.startedAt, { loop: true }),
      source: "shush",
    };
  }

  if (game.superUntil > game.elapsed) {
    return {
      ...getPetAnimationFrame("running", game.elapsed, game.superStartedAt, { loop: true }),
      source: "super-sniffer",
    };
  }

  const selectedEntity = game.entities
    .filter((entity) => entity.windowId === game.selectedWindow)
    .sort((left, right) => right.progress - left.progress)[0];
  const selectedTarget = activeSectors()[selectedEntity?.windowId ?? game.selectedWindow];
  const lookTarget = selectedEntity
    ? {
      x: selectedTarget.x,
      y: isCabinRun() ? 30 + selectedEntity.progress * 120 : 18 + selectedEntity.progress * 92,
      source: "visitor",
    }
    : game.lookTarget && game.elapsed < game.lookTarget.until
      ? { ...game.lookTarget, source: "pointer" }
      : null;
  if (lookTarget) {
    return {
      ...getPetLookFrame(lookTarget.x - game.charlieX, lookTarget.y - (game.charlieY ?? 484), { deadzone: 18 }),
      source: lookTarget.source,
    };
  }

  return idle();
}

const formatTime = (seconds) => {
  const total = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function resolveRunConfig(options = {}) {
  const mode = options.mode ?? "classic";
  const daily = mode === "daily" ? getDailyConfig(options.date ?? new Date()) : null;
  const travelAssignment = mode === "travel"
    ? getTravelAssignment(options.travelAssignmentId ?? options.assignmentId ?? DEFAULT_TRAVEL_ASSIGNMENT_ID)
      ?? TRAVEL_ASSIGNMENTS[0]
    : null;
  const patrolId = travelAssignment ? null : options.patrolId ?? daily?.patrolId ?? PATROLS[0].id;
  const patrol = travelAssignment ?? getPatrol(patrolId) ?? PATROLS[0];
  const seed = Number.isFinite(options.seed)
    ? options.seed >>> 0
    : travelAssignment ? 0xc2ec4a : daily?.seed ?? ((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
  const collarTag = travelAssignment ? null : getCollarTag(options.collarTagId) ?? null;
  const duration = mode === "endless"
    ? Number.POSITIVE_INFINITY
    : mode === "classic" ? ROUND_SECONDS : mode === "daily" ? MODE_CONFIGS.daily.durationSeconds : patrol.durationSeconds;
  return {
    mode,
    patrol,
    patrolId: travelAssignment ? null : patrol.id,
    travelAssignmentId: travelAssignment?.id ?? null,
    travelAssignment,
    arena: travelAssignment?.arena ?? "flat",
    seed,
    daily,
    collarTag,
    tagModifiers: collarTag?.modifiers ?? {},
    roomConditions: patrol.roomConditions ?? {},
    duration,
  };
}

function baseRoomEnvironment(run, roomIndex) {
  if (run.patrol.id !== "important-work-call") return "normal";
  return ["video-call", "tv", "normal"][roomIndex];
}

function createScheduledEvents(run) {
  if (isCabinRun(run)) return CABIN_SCHEDULE.map((event, index) => ({ id: `cabin-${index + 1}`, ...event }));
  if (run.mode === "classic" || run.mode === "endless") {
    return [
      { id: "classic-call", kind: "condition", at: 18, roomId: 0, environment: "video-call", duration: 9 },
      { id: "classic-tv", kind: "condition", at: 42, roomId: 1, environment: "tv", duration: 7, coverCharges: 1 },
      { id: "classic-kettle", kind: "condition", at: 66, roomId: 2, environment: "kettle", duration: 6, coverCharges: 2 },
    ];
  }

  const cardPool = getDirectorCards(run.patrol.director.deck);
  const count = Math.max(4, cardPool.length);
  const schedule = buildPatrolSchedule({
    cards: cardPool,
    count,
    allowRepeats: count > cardPool.length,
    seed: run.seed,
    startAt: 3,
    interval: Math.max(10, (run.duration - 26) / Math.max(1, count - 1)),
    jitter: 2,
  });
  const events = schedule.flatMap((entry) => entry.events);
  const finale = getDirectorCard(run.patrol.director.finale);
  if (finale) {
    events.push(...expandEventCard(finale, {
      at: Math.max(10, run.duration - 15),
      instanceId: `${finale.id}:finale`,
    }));
  }
  return events.sort((left, right) => left.at - right.at);
}

function newGame(options = {}) {
  const run = resolveRunConfig(options);
  const rng = createSeededRng(run.seed);
  const chickenGoal = run.daily?.twist?.chickenChargeRequired
    ?? run.tagModifiers.chickenChargeRequired
    ?? CHICKEN_GOAL;
  const duration = run.duration;
  const listening = createListeningState({ patience: MAX_PATIENCE, maxPatience: MAX_PATIENCE });
  const cabin = isCabinRun(run);
  const flock = cabin ? createFlock(run.seed, { sheepCount: run.travelAssignment?.sheepCount ?? 6 }) : null;
  const flockStatus = flock ? getFlockStatus(flock) : null;
  return {
    run,
    rng,
    relaxed: settings.relaxed,
    duration,
    elapsed: 0,
    timeLeft: duration,
    score: 0,
    combo: 1,
    bestCombo: 1,
    safety: 3,
    patience: cabin ? flockOrderPercent(flockStatus) : listening.patience,
    listening,
    chicken: 0,
    chickenGoal,
    superUntil: 0,
    superStartedAt: 0,
    spawnIn: 1.2,
    nextDirectorAt: 4,
    nextId: 1,
    nextBarkId: 1,
    entities: [],
    flock,
    flockStatus,
    flockActive: !cabin,
    pendingSpawns: [],
    scheduledEvents: createScheduledEvents(run),
    eventCursor: 0,
    effects: [],
    rooms: ROOMS.map((room, index) => ({
      id: room.id,
      attention: 0,
      noise: 0,
      baseEnvironment: baseRoomEnvironment(run, index),
      environment: baseRoomEnvironment(run, index),
      environmentUntil: 0,
      cover: createCoverState(),
    })),
    selectedRoom: 1,
    selectedWindow: 2,
    charlieLane: cabin ? "lower" : null,
    charlieX: WINDOWS[2].x,
    targetX: WINDOWS[2].x,
    charlieY: cabin ? CABIN_LANE_Y.lower : 586,
    targetY: cabin ? CABIN_LANE_Y.lower : 586,
    facing: 1,
    moving: 0,
    movementStartedAt: 0,
    petReaction: null,
    petPose: null,
    lookTarget: null,
    barkUntil: 0,
    barkCooldown: 0,
    warning: null,
    sneaky: null,
    lastAudibility: null,
    lastAudibilityUntil: 0,
    listeningGraceUntil: 0,
    shake: 0,
    guarded: 0,
    missed: 0,
    switches: 0,
    barks: 0,
    correctBarks: 0,
    unnecessary: 0,
    coveredBarks: 0,
    friendBarks: 0,
    friendsSpared: 0,
    chickens: 0,
    quietResolutions: 0,
    perfectCrimes: 0,
    violations: 0,
    superGuards: 0,
    coatRepelled: 0,
    flockSettled: 0,
    bestFlockSize: flockStatus?.settledCount ?? flockStatus?.inZoneCount ?? 0,
    sheepBarks: 0,
    cabinTutorialShown: false,
    distinctWindowsGuarded: new Set(),
    discoveredVisitors: new Set(),
    parcelsDelivered: 0,
    bossActive: false,
    bossDefeated: false,
    ended: false,
    result: null,
    resultSuccess: false,
  };
}

function ensureAudio() {
  if (!settings.sound) return null;
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.88;
    masterGain.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function stopAllSounds() {
  for (const source of activeSounds) {
    try { source.stop(); } catch { /* a source may already have ended */ }
  }
  activeSounds.clear();
}

function loadSounds() {
  if (!settings.sound) return Promise.resolve([]);
  const ac = ensureAudio();
  if (!ac) return Promise.resolve([]);
  if (soundLoadPromise) return soundLoadPromise;

  soundLoadState = "loading";
  soundLoadPromise = Promise.allSettled(SOUND_URLS.map(async (src) => {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const bytes = await response.arrayBuffer();
    const buffer = await ac.decodeAudioData(bytes.slice(0));
    audioBuffers.set(src, buffer);
    return src;
  })).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") failedSoundUrls.add(SOUND_URLS[index]);
    });
    soundLoadState = failedSoundUrls.size === 0
      ? "ready"
      : audioBuffers.size > 0 ? "partial" : "failed";
    return results;
  });
  return soundLoadPromise;
}

function chooseCueOption(cue) {
  const options = (SOUND_CUES[cue] ?? []).filter(({ src }) => audioBuffers.has(src));
  if (!options.length) return null;
  const previous = lastSoundChoice.get(cue);
  const choices = options.length > 1 ? options.filter(({ src }) => src !== previous) : options;
  const option = choose(choices.length ? choices : options);
  lastSoundChoice.set(cue, option.src);
  return option;
}

function connectWithPan(node, pan = 0) {
  if (!audioContext || !masterGain) return;
  if (typeof audioContext.createStereoPanner === "function") {
    const panner = audioContext.createStereoPanner();
    panner.pan.value = clamp(pan, -0.72, 0.72);
    node.connect(panner).connect(masterGain);
  } else {
    node.connect(masterGain);
  }
}

function playSample(cue, { pan = 0, delay = 0, gainMultiplier = 1 } = {}) {
  const ac = ensureAudio();
  if (!ac) return false;
  const option = chooseCueOption(cue);
  if (!option) {
    void loadSounds();
    return false;
  }

  const source = ac.createBufferSource();
  const volume = ac.createGain();
  const [minRate, maxRate] = option.rate ?? [1, 1];
  source.buffer = audioBuffers.get(option.src);
  source.playbackRate.value = minRate + Math.random() * (maxRate - minRate);
  volume.gain.value = option.gain * gainMultiplier;
  source.connect(volume);
  connectWithPan(volume, pan);
  source.addEventListener("ended", () => activeSounds.delete(source), { once: true });
  activeSounds.add(source);
  source.start(ac.currentTime + delay);
  lastSoundCue = cue;
  lastSoundMode = "sample";
  return true;
}

function markSynth(cue) {
  lastSoundCue = cue;
  lastSoundMode = "synth";
}

function tone({ start = 240, end = 120, duration = 0.16, type = "sine", gain = 0.08, delay = 0, pan = 0 }) {
  const ac = ensureAudio();
  if (!ac) return;
  const now = ac.currentTime + delay;
  const oscillator = ac.createOscillator();
  const volume = ac.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(start, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, end), now + duration);
  volume.gain.setValueAtTime(0.0001, now);
  volume.gain.exponentialRampToValueAtTime(gain, now + 0.012);
  volume.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(volume);
  connectWithPan(volume, pan);
  oscillator.addEventListener("ended", () => activeSounds.delete(oscillator), { once: true });
  activeSounds.add(oscillator);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function panForWindow(windowId) {
  const x = WINDOWS[windowId]?.x ?? WIDTH / 2;
  return clamp(((x / WIDTH) * 1.4) - 0.7, -0.68, 0.68);
}

function playBark(windowId) {
  const pan = panForWindow(windowId);
  if (playSample("bark", { pan, gainMultiplier: 0.92 + Math.random() * 0.13 })) return;
  markSynth("bark");
  tone({ start: 185, end: 82, duration: 0.17, type: "sawtooth", gain: 0.09, pan });
  tone({ start: 115, end: 65, duration: 0.2, type: "square", gain: 0.035, delay: 0.025, pan });
}

function playSuccess() {
  if (playSample("success")) return;
  markSynth("success");
  tone({ start: 390, end: 620, duration: 0.13, gain: 0.06 });
  tone({ start: 520, end: 820, duration: 0.16, gain: 0.05, delay: 0.11 });
}

function playHit(windowId) {
  playSample("hit", { pan: panForWindow(windowId) });
}

function playAlert(windowId) {
  const pan = panForWindow(windowId);
  if (playSample("danger", { pan })) return;
  markSynth("danger");
  tone({ start: 150, end: 110, duration: 0.22, type: "triangle", gain: 0.07, pan });
}

function playShush(roomIndex) {
  const pan = [-0.3, 0, 0.3][roomIndex] ?? 0;
  if (playSample("shush", { pan })) return;
  markSynth("shush");
  tone({ start: 220, end: 145, duration: 0.26, type: "triangle", gain: 0.045, pan });
}

function playChicken() {
  const crunch = playSample("chicken", { gainMultiplier: 0.95 });
  const sparkle = playSample("powerUp", { delay: 0.04, gainMultiplier: 0.9 });
  if (crunch || sparkle) {
    lastSoundCue = "chicken";
    lastSoundMode = "sample";
    return;
  }
  markSynth("chicken");
  tone({ start: 330, end: 660, duration: 0.18, gain: 0.07 });
  tone({ start: 440, end: 880, duration: 0.2, gain: 0.06, delay: 0.13 });
}

function playRoomSwitch(roomIndex) {
  if (playSample("roomSwitch", { pan: [-0.32, 0, 0.32][roomIndex] ?? 0 })) return;
  markSynth("roomSwitch");
  tone({ start: 280, end: 360, duration: 0.09, gain: 0.025 });
}

function playDoorbell(windowId) {
  if (playSample("doorbell", { pan: panForWindow(windowId) })) return;
  markSynth("doorbell");
  tone({ start: 620, end: 620, duration: 0.12, gain: 0.04, pan: panForWindow(windowId) });
  tone({ start: 820, end: 820, duration: 0.16, gain: 0.035, delay: 0.13, pan: panForWindow(windowId) });
}

function playUi() {
  if (playSample("ui")) return;
  markSynth("ui");
  tone({ start: 460, end: 510, duration: 0.055, gain: 0.018 });
}

function getAudioState() {
  return {
    contextState: audioContext?.state ?? "uninitialized",
    loadState: soundLoadState,
    loaded: audioBuffers.size,
    total: SOUND_URLS.length,
    failed: [...failedSoundUrls],
    active: activeSounds.size,
    lastCue: lastSoundCue,
    lastMode: lastSoundMode,
  };
}

function announce(message, assertive = false) {
  ui.caption.textContent = message;
  ui.announcement.setAttribute("aria-live", assertive ? "assertive" : "polite");
  ui.announcement.textContent = "";
  requestAnimationFrame(() => { ui.announcement.textContent = message; });
}

function showToast(message, kind = "good") {
  ui.toast.textContent = message;
  ui.toast.dataset.kind = kind;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 1450);
}

function nativeFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

function isNativeGameFullscreen() {
  return nativeFullscreenElement() === ui.pageShell;
}

function isFocusMode() {
  return fullscreenState.fallback;
}

function isGameFullscreen() {
  return isNativeGameFullscreen() || isFocusMode();
}

function compactImmersiveViewport() {
  return window.innerWidth <= 620 || (window.innerHeight <= 620 && window.innerWidth <= 1024);
}

function isImmersiveMode() {
  return ui.pageShell.classList.contains("is-immersive-mode");
}

function isDeclutteredRendering() {
  return screen === "playing" || screen === "paused" || isGameFullscreen();
}

function syncImmersiveMode() {
  if (!isGameFullscreen()) immersiveClassicControls = false;
  const immersive = isGameFullscreen()
    && ["playing", "paused"].includes(screen)
    && compactImmersiveViewport()
    && !immersiveClassicControls;
  ui.pageShell.classList.toggle("is-immersive-mode", immersive);
  document.body.classList.toggle("is-immersive-play", immersive);
  ui.pauseButton.setAttribute("aria-label", immersive ? "Pause and options" : "Pause game");
  ui.immersiveExitButton.hidden = !isGameFullscreen();
  ui.classicControlsButton.hidden = !immersive;
  if (immersive) {
    requestAnimationFrame(syncCanvasCamera);
  } else {
    resetCanvasGesture();
    if (isCabinRun() && game) syncCanvasCamera();
    else {
      canvasWrap.style.removeProperty("--camera-x");
      delete canvasWrap.dataset.cameraFactor;
    }
  }
}

function syncFullscreenUI() {
  const active = isGameFullscreen();
  ui.pageShell.classList.toggle("is-fullscreen-mode", active);
  ui.pageShell.classList.toggle("is-focus-mode", fullscreenState.fallback);
  document.body.classList.toggle("is-fullscreen-lock", fullscreenState.fallback);
  ui.fullscreenButton.setAttribute("aria-pressed", String(active));
  ui.fullscreenButton.setAttribute("aria-label", active ? "Exit full-screen play mode" : "Enter full-screen play mode");
  ui.fullscreenButton.title = active ? "Exit full screen" : "Full screen";
  ui.fullscreenButton.querySelector("span").textContent = active ? "×" : "⛶";
  syncImmersiveMode();
  if (active && ["playing", "paused"].includes(screen)) {
    requestAnimationFrame(() => canvas.focus({ preventScroll: true }));
  }
}

function enterFocusMode() {
  if (isGameFullscreen()) return;
  fullscreenState.fallback = true;
  fullscreenState.scrollY = window.scrollY;
  syncFullscreenUI();
  announce("Full-screen focus mode on. Your browser toolbar may remain visible on this device.");
}

async function exitGameFullscreen({ announceExit = true } = {}) {
  if (isFocusMode()) {
    fullscreenState.fallback = false;
    syncFullscreenUI();
    window.scrollTo(0, fullscreenState.scrollY);
    if (announceExit) announce("Full-screen play mode off.");
    return;
  }
  if (!isNativeGameFullscreen()) return;
  fullscreenState.silentExit = !announceExit;
  fullscreenState.transitioning = true;
  try {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen();
    } else if (typeof document.webkitExitFullscreen === "function") {
      await document.webkitExitFullscreen();
    }
  } catch {
    fullscreenState.silentExit = false;
  } finally {
    fullscreenState.transitioning = false;
  }
}

async function toggleFullscreen() {
  if (isGameFullscreen()) {
    await exitGameFullscreen();
    return;
  }
  fullscreenState.transitioning = true;
  try {
    if (typeof ui.pageShell.requestFullscreen === "function") {
      await ui.pageShell.requestFullscreen();
    } else if (typeof ui.pageShell.webkitRequestFullscreen === "function") {
      await ui.pageShell.webkitRequestFullscreen();
    } else {
      enterFocusMode();
    }
  } catch {
    enterFocusMode();
  } finally {
    fullscreenState.transitioning = false;
  }
}

function handleFullscreenChange() {
  const wasNative = fullscreenState.nativeActive;
  fullscreenState.nativeActive = isNativeGameFullscreen();
  if (wasNative && !fullscreenState.nativeActive) {
    fullscreenState.ignoreEscapeUntil = performance.now() + 300;
  }
  syncFullscreenUI();
  if (!wasNative && fullscreenState.nativeActive) {
    announce("Full-screen play mode on.");
  } else if (wasNative && !fullscreenState.nativeActive) {
    const silent = fullscreenState.silentExit;
    fullscreenState.silentExit = false;
    if (!silent) announce("Full-screen play mode off.");
  }
}

function setSwitch(button, value, label, key) {
  button.setAttribute("aria-checked", String(value));
  button.setAttribute("aria-label", `${label}: ${value ? "on" : "off"}`);
  const stateLabel = button.querySelector(".switch-state");
  if (stateLabel) stateLabel.textContent = value ? "On" : "Off";
  safeSet(key, value ? "1" : "0");
}

function syncSettings() {
  [ui.soundToggle, ui.pauseSoundToggle].forEach((button) => setSwitch(button, settings.sound, "Sound", STORAGE.sound));
  [ui.motionToggle, ui.pauseMotionToggle].forEach((button) => setSwitch(button, settings.motion, "Motion effects", STORAGE.motion));
  setSwitch(ui.relaxedToggle, settings.relaxed, "Relaxed mode", STORAGE.relaxed);
  document.body.dataset.motion = settings.motion ? "on" : "off";
}

function setLayer(name) {
  const layers = {
    title: ui.start,
    briefing: ui.briefing,
    book: ui.patrolBook,
    patrolBriefing: ui.patrolBriefing,
    result: ui.result,
    paused: ui.pause,
  };
  for (const [key, element] of Object.entries(layers)) element.hidden = key !== name;
  const activeLayer = layers[name] ?? null;
  if (activeLayer) {
    activeLayer.scrollTop = 0;
    activeLayer.querySelectorAll(".result-card, .result-card__copy").forEach((element) => {
      element.scrollTop = 0;
    });
  }
  screen = name === null ? "playing" : name;
  document.body.dataset.screen = screen;
  const playSurface = screen === "playing" || screen === "paused";
  ui.fullscreenButton.hidden = screen !== "playing";
  if (!playSurface && isGameFullscreen()) void exitGameFullscreen({ announceExit: false });
  syncImmersiveMode();
  const blocked = screen !== "playing";
  const modalBlocked = ["briefing", "book", "patrolBriefing", "paused", "result"].includes(screen);
  ui.actionDock.inert = blocked;
  canvas.inert = blocked;
  ui.header.inert = modalBlocked;
  ui.skipLink.inert = modalBlocked;
  ui.pauseButton.disabled = screen !== "playing";
  ui.relaxedToggle.disabled = screen === "playing" || screen === "paused";
  canvasWrap.classList.toggle("game-active", screen === "playing" || screen === "paused");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function rankProgress(snapshot) {
  if (!snapshot.nextRank) return { value: 1, maximum: 1, percent: 100, label: "Highest rank achieved" };
  const currentFloor = snapshot.rank.stampThreshold;
  const span = snapshot.nextRank.stampThreshold - currentFloor;
  const value = snapshot.stampCount - currentFloor;
  return {
    value,
    maximum: span,
    percent: span > 0 ? value / span * 100 : 100,
    label: `${snapshot.stampsUntilNextRank} stamps to ${snapshot.nextRank.title}`,
  };
}

function setRankProgress(element, snapshot) {
  if (!element) return;
  const progress = rankProgress(snapshot);
  element.setAttribute("aria-valuemin", "0");
  element.setAttribute("aria-valuemax", String(progress.maximum));
  element.setAttribute("aria-valuenow", String(progress.value));
  element.setAttribute("aria-valuetext", progress.label);
  const fill = element.querySelector(".rank-progress__fill");
  if (fill) fill.style.width = `${progress.percent}%`;
}

function campaignResumePatrol(snapshot) {
  const campaignComplete = snapshot.clearedPatrolIds.length >= PATROLS.length;
  return campaignComplete ? PATROLS[0] : PATROLS.find(
    (patrol) => snapshot.unlockedPatrolIds.includes(patrol.id) && !snapshot.clearedPatrolIds.includes(patrol.id),
  ) ?? getPatrol(snapshot.unlockedPatrolIds.at(-1)) ?? PATROLS[0];
}

function syncCareerUI() {
  const snapshot = getProgressionSnapshot(profile);
  ui.profileRank.textContent = snapshot.rank.title;
  ui.profileStamps.textContent = `${snapshot.stampCount} / ${snapshot.maximumStampCount}`;
  ui.bookRankTitle.textContent = snapshot.rank.title;
  ui.bookStampCount.textContent = `${snapshot.stampCount} / ${snapshot.maximumStampCount}`;
  ui.resultRankLabel.textContent = snapshot.nextRank ? "Next rank" : "Top rank";
  ui.resultRankTitle.textContent = snapshot.nextRank?.title ?? snapshot.rank.title;
  setRankProgress(ui.bookRankProgress, snapshot);
  setRankProgress(ui.resultRankProgress, snapshot);
  const campaignComplete = snapshot.clearedPatrolIds.length >= PATROLS.length;
  const nextPatrol = campaignResumePatrol(snapshot);
  pendingRun.patrolId = nextPatrol.id;
  ui.campaignButton.querySelector("span").textContent = campaignComplete
    ? "Replay campaign"
    : `Continue · Case ${String(nextPatrol.number).padStart(2, "0")}`;
  const dailyUnlocked = isModeUnlocked(profile, "daily");
  ui.dailyButton.disabled = !dailyUnlocked;
  ui.dailyButton.title = dailyUnlocked ? "Play today's deterministic patrol" : "Earn 3 Paw Stamps to unlock Today's Patrol";
}

function renderPatrolBook() {
  const snapshot = getProgressionSnapshot(profile);
  syncCareerUI();
  ui.bookPatrolGrid.innerHTML = PATROLS.map((patrol) => {
    const unlocked = isPatrolUnlocked(profile, patrol.id);
    const cleared = profile.campaign.clearedPatrolIds.includes(patrol.id);
    const earned = new Set(profile.campaign.stampsByPatrol[patrol.id] ?? []);
    const stampMarkup = patrol.objectives.map((objective) => (
      `<span class="paw-stamp ${earned.has(objective.id) ? "is-earned" : ""}" title="${escapeHtml(objective.label)}" aria-label="${earned.has(objective.id) ? "Earned" : "Unearned"}: ${escapeHtml(objective.label)}">${earned.has(objective.id) ? "●" : "○"}</span>`
    )).join("");
    const state = cleared ? "completed" : unlocked ? "available" : "locked";
    return `<button class="patrol-book-entry patrol-card is-${state}" type="button" data-patrol-id="${patrol.id}" ${unlocked ? "" : "disabled"}>
      <span class="patrol-card__number">Case ${String(patrol.number).padStart(2, "0")}</span>
      <strong>${escapeHtml(patrol.shortTitle)}</strong>
      <small>${escapeHtml(patrol.subtitle)}</small>
      <span class="patrol-card__stamps" aria-label="${earned.size} of 3 stamps earned">${stampMarkup}</span>
      <span class="patrol-card__state">${cleared ? "Filed" : unlocked ? "Open case" : "Complete the previous case"}</span>
    </button>`;
  }).join("");

  const endlessUnlocked = isModeUnlocked(profile, "endless");
  ui.bookPatrolGrid.insertAdjacentHTML("beforeend", `<button class="patrol-book-entry patrol-card patrol-card--endless ${endlessUnlocked ? "is-available" : "is-locked"}" type="button" data-mode="endless" ${endlessUnlocked ? "" : "disabled"}>
    <span class="patrol-card__number">Overtime</span><strong>Endless Watch</strong>
    <small>Escalating thirty-second phases with no clock-out time.</small>
    <span class="patrol-card__state">${endlessUnlocked ? "Begin overtime" : "Close all six cases to unlock"}</span>
  </button>`);

  const lifetime = profile.lifetime;
  ui.bookLifetimeStats.innerHTML = `
    <div><dt>Patrols</dt><dd>${lifetime.runs.toLocaleString()}</dd></div>
    <div><dt>Threats guarded</dt><dd>${lifetime.guarded.toLocaleString()}</dd></div>
    <div><dt>Sneaky switches</dt><dd>${lifetime.switches.toLocaleString()}</dd></div>
    <div><dt>Perfect crimes</dt><dd>${lifetime.perfectCrimes.toLocaleString()}</dd></div>
    <div><dt>Chicken servings</dt><dd>${lifetime.chickens.toLocaleString()}</dd></div>
    <div><dt>Total barks</dt><dd>${lifetime.barks.toLocaleString()}</dd></div>
    <div><dt>Daily reports</dt><dd>${profile.daily.completedDateKeys.length.toLocaleString()}</dd></div>
    <div><dt>Longest overtime</dt><dd>${formatTime(lifetime.byMode.endless.longestSeconds)}</dd></div>`;

  const unlockedRewards = new Set(snapshot.unlockedRewardIds);
  ui.bookGallery.innerHTML = REWARDS.map((reward) => {
    const unlocked = unlockedRewards.has(reward.id);
    const content = unlocked && reward.type === "photo"
      ? `<img src="${reward.asset}" alt="Unlocked Charlie personnel photograph"><span>${escapeHtml(reward.label)}</span>`
      : `<span class="gallery-reward__seal" aria-hidden="true">${unlocked ? "★" : "?"}</span><span>${unlocked ? escapeHtml(reward.label) : `${reward.stampThreshold} stamps`}</span>`;
    return `<article class="gallery-reward ${unlocked ? "is-unlocked" : "is-locked"}" aria-label="${unlocked ? "Unlocked" : "Locked"}: ${escapeHtml(reward.label)}">${content}</article>`;
  }).join("");
}

function openPatrolBook(options = {}) {
  const requested = options instanceof Event ? {} : options;
  previousFocus = document.activeElement;
  patrolBookReturn = requested.returnTo ?? "title";
  renderPatrolBook();
  setLayer("book");
  ui.patrolBook.focus({ preventScroll: true });
  ui.patrolBookClose.focus({ preventScroll: true });
  announce("Charlie's Patrol Book opened.");
}

function closePatrolBook() {
  playUi();
  const returnToResult = patrolBookReturn === "result" && game?.ended;
  setLayer(returnToResult ? "result" : "title");
  syncCareerUI();
  const fallback = returnToResult ? ui.bookFromResultButton : ui.patrolBookButton;
  const focusTarget = previousFocus?.isConnected && !previousFocus.closest("[hidden]") ? previousFocus : fallback;
  focusTarget.focus();
}

function specialRuleFor(run) {
  if (run.mode === "travel") return ["Two-fence duty", "Use position to guide ordinary sheep, bark only for the tagged stubborn ewe, and switch upward whenever the cabin fence needs Charlie."];
  if (run.mode === "endless") return ["Overtime rules", "Threat combinations intensify every thirty seconds. The watch ends only when Safety or Patience runs out."];
  if (run.mode === "daily") return [run.daily.twist.label, "Today's visitor schedule and modifier are deterministic for this date."];
  const rules = {
    "regular-shift": ["Standard household rules", "Learn the Attention, Listening, Sneaky Bark, quiet-compliance, and chicken systems."],
    "special-delivery": ["Check the uniform", "Posties leave parcels; parcel pirates follow. Friendly visitors now reward restraint."],
    "important-work-call": ["Camera on", "Office barks are LOUD. Television and kettle events provide limited full cover."],
    "chicken-emergency": ["Protein-powered policing", "Stubborn threats reward deliberate chicken timing and Super Sniffer guards."],
    "six-window-surge": ["Read the whole flat", "Authored waves pressure every window, and the owner starts following repeated escapes."],
    "mystery-coat-incident": ["Case finale", "The coat changes rooms after every surviving bark, and the owner follows Charlie's sound."],
  };
  return rules[run.patrol.id] ?? ["Classic household rules", "Ninety seconds, six windows, and no suspicious business."];
}

function renderCollarChoices(selectedId) {
  const unlocked = new Set(getProgressionSnapshot(profile).unlockedCollarTagIds);
  const choices = [
    { id: "", name: "Official issue", description: "Charlie's dependable everyday setup.", advantage: "No modifier", tradeoff: "No tradeoff" },
    ...COLLAR_TAGS,
  ];
  ui.collarTagChoices.innerHTML = choices.map((tag) => {
    const available = tag.id === "" || unlocked.has(tag.id);
    const checked = (selectedId ?? "") === tag.id;
    return `<label class="collar-tag-card ${checked ? "is-selected" : ""} ${available ? "" : "is-locked"}">
      <input type="radio" name="collar-tag" value="${tag.id}" ${checked ? "checked" : ""} ${available ? "" : "disabled"}>
      <span class="collar-tag-card__icon" aria-hidden="true">${tag.id ? "◆" : "C"}</span>
      <span><strong>${escapeHtml(tag.name)}</strong><small>${available ? `${escapeHtml(tag.advantage)} ${escapeHtml(tag.tradeoff)}` : `Unlocks at ${tag.stampThreshold} Paw Stamps.`}</small></span>
    </label>`;
  }).join("");
}

function openPatrolBriefing(options = {}) {
  const mode = options.mode ?? "campaign";
  const daily = mode === "daily" ? getDailyConfig(options.date ?? new Date()) : null;
  const travelAssignment = mode === "travel"
    ? getTravelAssignment(options.travelAssignmentId ?? options.assignmentId ?? DEFAULT_TRAVEL_ASSIGNMENT_ID)
      ?? TRAVEL_ASSIGNMENTS[0]
    : null;
  const patrolId = travelAssignment ? null : options.patrolId ?? daily?.patrolId ?? PATROLS[0].id;
  const patrol = travelAssignment ?? getPatrol(patrolId) ?? PATROLS[0];
  pendingRun = {
    mode,
    patrolId: travelAssignment ? null : patrol.id,
    travelAssignmentId: travelAssignment?.id ?? null,
    collarTagId: travelAssignment ? null : profile.selectedCollarTagId,
    seed: options.seed ?? daily?.seed ?? null,
    date: daily?.dateKey,
  };
  patrolBriefingReturn = options.returnTo ?? "title";
  const backToBook = patrolBriefingReturn === "book";
  ui.patrolBriefingBack.textContent = backToBook ? "← Patrol Book" : "← Title";
  ui.patrolBriefingBack.setAttribute("aria-label", backToBook ? "Return to Patrol Book" : "Return to title screen");
  const modeLabel = mode === "campaign" ? `Case file ${String(patrol.number).padStart(2, "0")}` : mode === "travel" ? "Travel File 01 · Czechia" : MODE_CONFIGS[mode]?.label ?? "Patrol briefing";
  ui.patrolBriefingEyebrow.textContent = modeLabel;
  ui.patrolBriefingTitle.textContent = mode === "endless" ? "Overtime Watch" : mode === "daily" ? `Today's Report · ${daily.dateKey}` : patrol.title;
  ui.patrolBriefingDescription.textContent = mode === "endless" ? MODE_CONFIGS.endless.description : mode === "daily" ? `${patrol.briefing} Today's twist: ${daily.twist.label}.` : mode === "travel" ? `${patrol.briefing} ${patrol.tagline}` : patrol.briefing;
  ui.patrolOrdersHeading.textContent = mode === "travel" ? "Travel orders" : "Paw-stamp orders";
  const earned = new Set(profile.campaign.stampsByPatrol[patrol.id] ?? []);
  ui.patrolObjectives.innerHTML = mode === "campaign"
    ? patrol.objectives.map((objective) => `<li class="${earned.has(objective.id) ? "is-earned" : ""}"><span class="objective-stamp" aria-hidden="true">${earned.has(objective.id) ? "●" : "○"}</span><span><strong>${escapeHtml(objective.label)}</strong><small>${escapeHtml(objective.description)}</small></span></li>`).join("")
    : mode === "travel"
      ? patrol.travelOrders.map((order) => `<li><span class="objective-stamp" aria-hidden="true">◎</span><span><strong>${escapeHtml(order.label)}</strong><small>${escapeHtml(order.description)}</small></span></li>`).join("")
    : `<li><span class="objective-stamp" aria-hidden="true">◎</span><span><strong>${mode === "endless" ? "Stay on watch" : "Secure today's route"}</strong><small>${mode === "endless" ? "Build the longest possible overtime record." : "Complete the seeded patrol and improve today's local best."}</small></span></li>`;
  const [ruleTitle, ruleText] = specialRuleFor(resolveRunConfig(pendingRun));
  ui.patrolSpecialRule.innerHTML = `<span class="book-label">Special condition</span><strong>${escapeHtml(ruleTitle)}</strong><p>${escapeHtml(ruleText)}</p>`;
  if (ui.collarTagFieldset) ui.collarTagFieldset.hidden = mode === "travel";
  if (mode !== "travel") renderCollarChoices(profile.selectedCollarTagId);
  ui.beginPatrolButton.firstChild.textContent = mode === "travel" ? "Begin cabin duty " : "Begin this patrol ";
  setLayer("patrolBriefing");
  ui.patrolBriefing.focus({ preventScroll: true });
  ui.patrolBriefingBack.focus({ preventScroll: true });
  announce(`${ui.patrolBriefingTitle.textContent} briefing opened.`);
}

function closePatrolBriefing() {
  playUi();
  if (patrolBriefingReturn === "book") openPatrolBook();
  else {
    setLayer("title");
    ui.campaignButton.focus();
  }
}

function openBriefing() {
  ensureAudio();
  void loadSounds();
  playUi();
  previousFocus = document.activeElement;
  setLayer("briefing");
  ui.briefingBack.focus({ preventScroll: true });
}

function closeBriefing() {
  playUi();
  setLayer("title");
  (previousFocus || ui.howButton).focus();
}

function startRound(options = pendingRun) {
  const requested = options instanceof Event ? pendingRun : options;
  stopAllSounds();
  ensureAudio();
  void loadSounds();
  pendingRun = { ...pendingRun, ...requested };
  game = newGame(pendingRun);
  lastFrame = performance.now();
  ui.ownerBubble.hidden = true;
  ui.toast.hidden = true;
  setLayer(null);
  syncHUD();
  updateRoomUI();
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
  window.setTimeout(() => {
    if (screen === "playing") window.scrollTo(0, 0);
  }, 120);
  window.setTimeout(() => {
    if (screen === "playing") window.scrollTo(0, 0);
  }, 420);
  const label = game.run.mode === "campaign" ? game.run.patrol.title : game.run.mode === "travel" ? game.run.travelAssignment.title : MODE_CONFIGS[game.run.mode]?.label ?? "Patrol";
  announce(isCabinRun()
    ? `${game.relaxed ? "Relaxed " : ""}${label} started. Charlie is at the sheep fence. Move left and right to apply herding pressure, then use Up Arrow when the upper fence needs defending.`
    : `${game.relaxed ? "Relaxed " : ""}${label} started. Charlie is in the living room, watching the centre window.`);
  canvas.focus({ preventScroll: true });
}

function replayCurrentRun() {
  if (!game) {
    startRound(pendingRun);
    return;
  }
  startRound({
    mode: game.run.mode,
    patrolId: game.run.patrolId,
    travelAssignmentId: game.run.travelAssignmentId,
    collarTagId: game.run.collarTag?.id ?? null,
    seed: ["daily", "travel"].includes(game.run.mode) ? game.run.seed : null,
    date: game.run.daily?.dateKey ?? null,
  });
}

function pauseGame() {
  if (screen !== "playing" || !game || game.ended) return;
  stopAllSounds();
  previousFocus = document.activeElement;
  setLayer("paused");
  ui.pause.focus({ preventScroll: true });
  ui.resumeButton.focus({ preventScroll: true });
  announce("Patrol paused.");
}

function resumeGame() {
  if (screen !== "paused") return;
  playUi();
  lastFrame = performance.now();
  setLayer(null);
  canvas.focus({ preventScroll: true });
  announce("Patrol resumed.");
}

function buildRunResult(success) {
  const barks = game.barks;
  return {
    mode: game.run.mode,
    patrolId: game.run.patrolId,
    travelAssignmentId: game.run.travelAssignmentId,
    dailyDateKey: game.run.daily?.dateKey ?? null,
    completed: success,
    score: Math.max(0, Math.round(game.score)),
    durationSeconds: game.elapsed,
    stats: {
      guarded: game.guarded,
      missed: game.missed,
      switches: game.switches,
      barks,
      unnecessary: game.unnecessary,
      chickens: game.chickens,
      coveredBarks: game.coveredBarks,
      perfectCrimes: game.perfectCrimes,
      quietResolutions: game.quietResolutions,
      friendsSpared: game.friendsSpared,
      superGuards: game.superGuards,
      coatRepelled: game.coatRepelled,
      flockSettled: game.flockStatus?.settleMarks ?? game.flockSettled,
      bestFlockSize: game.bestFlockSize,
      sheepBarks: game.sheepBarks,
      distinctWindowsGuarded: game.distinctWindowsGuarded.size,
      windowsGuarded: [...game.distinctWindowsGuarded],
      accuracy: barks > 0 ? game.correctBarks / barks : 0,
      bestCombo: game.bestCombo,
      safetyRemaining: game.safety,
      patienceRemaining: game.patience,
    },
  };
}

function renderProgressionResults(runResult, awards) {
  const snapshot = getProgressionSnapshot(profile);
  const modeLabels = {
    campaign: `Case ${String(game.run.patrol.number).padStart(2, "0")} · ${game.run.patrol.title}`,
    travel: `Travel File · ${game.run.travelAssignment?.title ?? "Czech Cabin Duty"}`,
    classic: "Classic Patrol",
    daily: `Today's Patrol · ${game.run.daily?.dateKey ?? ""}`,
    endless: "Overtime Watch",
  };
  ui.resultMode.textContent = modeLabels[game.run.mode] ?? "Patrol report";
  ui.resultObjectivesHeading.textContent = game.run.mode === "travel" ? "Travel orders" : "Paw-stamp orders";

  if (game.run.mode === "campaign") {
    const results = evaluatePatrolObjectives(game.run.patrolId, runResult);
    const newlyEarned = new Set(awards.newlyAwardedStampIds);
    ui.resultObjectives.innerHTML = results.map(({ objective, achieved }) => `<div class="result-objective ${achieved ? "is-earned" : ""}">
      <span aria-hidden="true">${achieved ? "●" : "○"}</span><p><strong>${escapeHtml(objective.label)}${newlyEarned.has(objective.id) ? " · NEW" : ""}</strong><small>${escapeHtml(objective.description)}</small></p>
    </div>`).join("");
  } else if (game.run.mode === "travel") {
    const results = evaluateTravelObjectives(game.run.travelAssignmentId, runResult);
    ui.resultObjectives.innerHTML = results.map(({ objective, achieved }) => `<div class="result-objective ${achieved ? "is-earned" : ""}">
      <span aria-hidden="true">${achieved ? "●" : "○"}</span><p><strong>${escapeHtml(objective.label)}</strong><small>${escapeHtml(objective.description)}</small></p>
    </div>`).join("");
  } else if (game.run.mode === "daily") {
    const dateKey = game.run.daily?.dateKey ?? runResult.dailyDateKey;
    const dailyBest = profile.daily.bestByDate[dateKey] ?? runResult.score;
    ui.resultObjectives.innerHTML = `<p>${runResult.completed ? "Today's route is filed." : "Today's route ended early."} Best for ${escapeHtml(dateKey)}: <strong>${dailyBest.toLocaleString()}</strong>.</p>`;
  } else if (game.run.mode === "endless") {
    const longest = profile.lifetime.byMode.endless.longestSeconds;
    ui.resultObjectives.innerHTML = `<p>Overtime survived: <strong>${formatTime(game.elapsed)}</strong>. Longest watch: <strong>${formatTime(longest)}</strong>.</p>`;
  } else {
    const classicBest = profile.lifetime.byMode.classic.bestScore;
    ui.resultObjectives.innerHTML = `<p>Classic patrol recorded. Classic best: <strong>${classicBest.toLocaleString()}</strong>.</p>`;
  }

  if (game.run.mode === "campaign") {
    const rewardLabels = awards.newlyUnlockedRewardIds
      .map((rewardId) => REWARDS.find((reward) => reward.id === rewardId)?.label)
      .filter(Boolean);
    const messages = [];
    if (awards.newlyAwardedStampIds.length) messages.push(`${awards.newlyAwardedStampIds.length} new Paw Stamp${awards.newlyAwardedStampIds.length === 1 ? "" : "s"}`);
    if (awards.newlyUnlockedPatrolIds.length) messages.push("New case file opened");
    if (awards.rankChanged) messages.push(`Promoted to ${snapshot.rank.title}`);
    if (rewardLabels.length) messages.push(`Unlocked: ${rewardLabels.join(", ")}`);
    ui.resultReward.innerHTML = `<span aria-hidden="true">${messages.length ? "★" : "✦"}</span><p><strong>${messages[0] ?? "Patrol recorded"}</strong><small>${messages.slice(1).join(" · ") || `${snapshot.stampCount} of ${snapshot.maximumStampCount} Paw Stamps filed.`}</small></p>`;
  } else if (game.run.mode === "travel") {
    const travelBest = profile.lifetime.byMode.travel.bestScore;
    const marks = runResult.stats.flockSettled;
    ui.resultReward.innerHTML = `<span aria-hidden="true">✦</span><p><strong>Travel report filed · ${travelBest.toLocaleString()}</strong><small>${marks} of 3 Flock Settled marks · ${runResult.stats.sheepBarks} sheep-side bark${runResult.stats.sheepBarks === 1 ? "" : "s"}.</small></p>`;
  } else if (game.run.mode === "daily") {
    const dateKey = game.run.daily?.dateKey ?? runResult.dailyDateKey;
    const dailyBest = profile.daily.bestByDate[dateKey] ?? runResult.score;
    ui.resultReward.innerHTML = `<span aria-hidden="true">✦</span><p><strong>Today's best · ${dailyBest.toLocaleString()}</strong><small>${profile.daily.completedDateKeys.includes(dateKey) ? "Daily report filed." : "The route remains open for another attempt."}</small></p>`;
  } else if (game.run.mode === "endless") {
    ui.resultReward.innerHTML = `<span aria-hidden="true">✦</span><p><strong>Longest watch · ${formatTime(profile.lifetime.byMode.endless.longestSeconds)}</strong><small>Overtime score: ${runResult.score.toLocaleString()}.</small></p>`;
  } else {
    const classicBest = profile.lifetime.byMode.classic.bestScore;
    ui.resultReward.innerHTML = `<span aria-hidden="true">✦</span><p><strong>Classic best · ${classicBest.toLocaleString()}</strong><small>No campaign stamps—just the original shift.</small></p>`;
  }
  setRankProgress(ui.resultRankProgress, snapshot);

  const next = game.run.mode === "campaign" ? getNextPatrol(game.run.patrolId) : null;
  ui.nextPatrolButton.hidden = false;
  ui.nextPatrolButton.disabled = false;
  delete ui.nextPatrolButton.dataset.travelAssignmentId;
  if (next && isPatrolUnlocked(profile, next.id)) {
    ui.nextPatrolButton.dataset.nextPatrolId = next.id;
    ui.nextPatrolButton.dataset.nextMode = "campaign";
    ui.nextPatrolButton.firstChild.textContent = `Next case · ${next.shortTitle} `;
  } else if (game.run.mode === "campaign" && !next && isModeUnlocked(profile, "endless")) {
    ui.nextPatrolButton.dataset.nextPatrolId = PATROLS.at(-1).id;
    ui.nextPatrolButton.dataset.nextMode = "endless";
    ui.nextPatrolButton.firstChild.textContent = "Begin Overtime Watch ";
  } else if (game.run.mode === "travel") {
    ui.nextPatrolButton.dataset.nextPatrolId = "";
    ui.nextPatrolButton.dataset.nextMode = "travel";
    ui.nextPatrolButton.dataset.travelAssignmentId = game.run.travelAssignmentId;
    ui.nextPatrolButton.firstChild.textContent = "Review Travel File ";
  } else {
    delete ui.nextPatrolButton.dataset.travelAssignmentId;
    ui.nextPatrolButton.dataset.nextPatrolId = campaignResumePatrol(snapshot).id;
    ui.nextPatrolButton.dataset.nextMode = "campaign";
    ui.nextPatrolButton.firstChild.textContent = "Return to campaign ";
  }
}

function endGame(reason, success = false) {
  if (!game || game.ended) return;
  stopAllSounds();
  game.ended = true;
  game.result = reason;
  game.resultSuccess = success;
  resultAnimationStartedAt = performance.now() / 1000;
  const runResult = buildRunResult(success);
  const applied = applyRun(profile, runResult);
  profile = saveProfile(applied.profile);
  lastAwards = applied.awards;
  bestScore = Math.max(profile.bestScore, Math.max(0, Math.round(game.score)));
  safeSet(STORAGE.best, bestScore);

  const patienceLoss = reason === "quiet";
  const safetyLoss = reason === "safety";
  if (game.run.mode === "travel") {
    ui.resultTitle.textContent = success ? "Cabin secure. Flock filed." : safetyLoss ? "The upper fence was breached." : "The sheep declined to cooperate.";
    ui.resultSubtitle.textContent = success
      ? "Charlie completed an extremely official agricultural assignment. The sheep remain unconvinced."
      : safetyLoss
        ? "The flock is safe, but cabin security needs another pass."
        : `Cabin secure; ${game.flockStatus?.settleMarks ?? 0} of 3 flock reports completed. The grass remains under review.`;
  } else if (success && game.score >= 3600) {
    ui.resultTitle.textContent = "The flat is secure.";
    ui.resultSubtitle.textContent = "Charlie, Supreme Window Warden: flawless ears, elite tactics, chicken earned.";
  } else if (success) {
    ui.resultTitle.textContent = "The flat is secure.";
    ui.resultSubtitle.textContent = "Workday finished. Charlie has thoroughly informed the neighbourhood.";
  } else if (patienceLoss) {
    ui.resultTitle.textContent = "Mandatory quiet break.";
    ui.resultSubtitle.textContent = "The guarding was excellent. The indoor voice was not.";
  } else if (reason === "boss") {
    ui.resultTitle.textContent = "The Mystery Coat escaped.";
    ui.resultSubtitle.textContent = "The coat remains at large. The incident file is staying open.";
  } else {
    ui.resultTitle.textContent = "A suspicious element slipped through.";
    ui.resultSubtitle.textContent = "Even elite security professionals need another patrol.";
  }
  ui.resultPhoto.src = success ? (game.score >= 3000 ? "assets/photos/charlie-bark.jpg" : "assets/photos/charlie-hero.jpg") : safetyLoss ? "assets/photos/charlie-caught.jpg" : "assets/photos/charlie-rest.jpg";
  ui.resultPhoto.alt = success ? "Charlie celebrating a completed patrol" : safetyLoss ? "Charlie looking surprised after patrol" : "Charlie resting during a quiet break";
  ui.resultScore.textContent = Math.max(0, Math.round(game.score)).toLocaleString();
  ui.resultGuards.textContent = String(game.guarded);
  ui.resultSwitches.textContent = String(game.switches);
  ui.resultBarks.textContent = String(game.barks);
  ui.resultCombo.textContent = `×${game.bestCombo}`;
  const resultStatLabels = [
    [ui.resultGuards, game.run.mode === "travel" ? "Upper-fence guards" : "Threats guarded"],
    [ui.resultSwitches, game.run.mode === "travel" ? "Fence switches" : "Tactical switches"],
    [ui.resultBarks, game.run.mode === "travel" ? "Total barks" : "Total barks"],
    [ui.resultCombo, game.run.mode === "travel" ? "Best guard streak" : "Best combo"],
  ];
  resultStatLabels.forEach(([value, text]) => {
    const term = value?.closest("div")?.querySelector("dt");
    if (term) term.textContent = text;
  });
  renderProgressionResults(runResult, applied.awards);
  syncCareerUI();
  syncHUD();
  ui.ownerBubble.hidden = true;
  setLayer("result");
  if (success) playSuccess();
  else playAlert(game.selectedWindow);
  ui.result.focus({ preventScroll: true });
  announce(`${ui.resultTitle.textContent} Final score ${Math.max(0, Math.round(game.score))}.`, true);
}

function setRoom(roomIndex, userInitiated = true) {
  if (!game || screen !== "playing") return;
  if (isCabinRun()) return;
  const next = clamp(roomIndex, 0, ROOMS.length - 1);
  const previous = game.selectedRoom;
  if (previous === next) return;
  game.selectedRoom = next;
  const urgent = game.entities
    .filter((entity) => roomForWindow(entity.windowId) === next)
    .sort((a, b) => b.progress - a.progress)[0];
  game.selectedWindow = urgent?.windowId ?? ROOMS[next].windows[0];
  game.facing = WINDOWS[game.selectedWindow].x >= game.charlieX ? 1 : -1;
  game.targetX = WINDOWS[game.selectedWindow].x;
  game.moving = settings.motion ? 1 : 0;
  game.movementStartedAt = game.elapsed;
  game.lookTarget = null;
  if (!settings.motion) game.charlieX = game.targetX;

  if (game.listening.active?.roomId === previous) {
    const baseSneakySeconds = DEFAULT_ACOUSTICS.sneakySeconds;
    const sneakySeconds = baseSneakySeconds * (game.run.tagModifiers.sneakyWindowMultiplier ?? 1);
    const relocated = relocateDuringListening(game.listening, {
      toRoomId: next,
      now: game.elapsed,
      sneakySeconds,
    });
    game.listening = relocated.state;
    const extraCooling = game.run.tagModifiers.relocationAttentionCoolingBonus ?? 0;
    game.rooms[previous].attention = Math.max(0, game.rooms[previous].attention - extraCooling);
    game.rooms[previous].noise = game.rooms[previous].attention / 100 * 3;
    syncListeningState();
    ui.ownerBubble.hidden = true;
    showToast("Sneaky switch primed!", "bonus");
    announce(`Charlie slipped into the ${ROOMS[next].name}. One real threat can now receive a Sneaky Bark bonus.`);
  } else if (userInitiated) {
    announce(`${ROOMS[next].name} selected. ${ROOMS[next].windows.length} window${ROOMS[next].windows.length === 1 ? "" : "s"} to guard.`);
  }
  if (userInitiated) playRoomSwitch(next);
  updateRoomUI();
}

function switchFence(requestedLane = null, userInitiated = true) {
  if (!game || screen !== "playing" || !isCabinRun()) return;
  const next = requestedLane === "upper" || requestedLane === "lower"
    ? requestedLane
    : game.charlieLane === "upper" ? "lower" : "upper";
  if (next === "lower" && userInitiated) game.flockActive = true;
  if (next === game.charlieLane) return;
  game.charlieLane = next;
  game.targetY = CABIN_LANE_Y[next];
  game.moving = settings.motion ? 1 : 0;
  game.movementStartedAt = game.elapsed;
  game.lookTarget = null;
  if (!settings.motion) game.charlieY = game.targetY;
  if (userInitiated) {
    game.switches += 1;
    playRoomSwitch(next === "upper" ? 0 : 2);
    showToast(next === "upper" ? "Upper fence duty" : "Sheep duty", "bonus");
    announce(next === "upper"
      ? "Charlie moved to the upper fence. Bark at suspicious visitors; let friendly visitors pass."
      : "Charlie moved to the sheep fence. Move alongside the flock to guide them into the shaded patch.");
  }
  updateRoomUI();
}

function selectWindow(windowId, announceChange = true) {
  if (!game || screen !== "playing") return;
  if (isCabinRun()) {
    if (game.charlieLane === "lower") game.flockActive = true;
    const target = CABIN_SECTORS[clamp(Number(windowId) || 0, 0, CABIN_SECTORS.length - 1)];
    game.selectedWindow = target.id;
    game.facing = target.x >= game.charlieX ? 1 : -1;
    game.targetX = target.x;
    game.moving = settings.motion ? 1 : 0;
    game.movementStartedAt = game.elapsed;
    game.lookTarget = null;
    if (!settings.motion) game.charlieX = game.targetX;
    if (announceChange) {
      playUi();
      announce(`${game.charlieLane === "upper" ? target.label : `sheep-fence position ${target.id + 1}`} selected.`);
    }
    updateRoomUI();
    return;
  }
  const target = WINDOWS[windowId];
  const previousRoom = game.selectedRoom;
  const primedSneakySwitch = target.room !== previousRoom
    && game.listening.active?.roomId === previousRoom;
  if (target.room !== previousRoom) setRoom(target.room, false);
  game.selectedWindow = windowId;
  game.facing = target.x >= game.charlieX ? 1 : -1;
  game.targetX = target.x;
  game.moving = settings.motion ? 1 : 0;
  game.movementStartedAt = game.elapsed;
  game.lookTarget = null;
  if (!settings.motion) game.charlieX = game.targetX;
  if (announceChange) {
    if (target.room !== previousRoom) playRoomSwitch(target.room);
    else playUi();
    if (!primedSneakySwitch) announce(`${target.label} selected.`);
  }
  updateRoomUI();
}

function addEffect(kind, x, y, options = {}) {
  if (!game || !settings.motion) return;
  game.effects.push({ kind, x, y, life: options.life ?? 0.8, maxLife: options.life ?? 0.8, color: options.color ?? "#d66f4a", text: options.text ?? "" });
}

function scheduleBehaviorSpawns(spawns = []) {
  for (const directive of spawns) {
    game.pendingSpawns.push({
      ...directive,
      at: game.elapsed + Math.max(0, Number(directive.delay) || 0),
    });
  }
  game.pendingSpawns.sort((left, right) => left.at - right.at);
}

function resolveEntityBehavior(entity, type, extra = {}) {
  const result = resolveVisitorBehavior(entity, {
    type,
    now: game.elapsed,
    progress: entity.progress,
    ...extra,
  }, {
    now: game.elapsed,
    windows: WINDOWS,
    occupiedWindowIds: game.entities.filter((item) => item !== entity).map((item) => item.windowId),
    rng: game.rng,
  });
  Object.assign(entity, result.visitor);
  scheduleBehaviorSpawns(result.spawns);
  if (result.movedTo !== null) {
    addEffect("alert", WINDOWS[result.movedTo].x, 170, { text: "MOVED!", color: entity.color, life: 0.8 });
  }
  return result;
}

function barkAudibility(roomIndex, barkId) {
  const room = game.rooms[roomIndex];
  const tagMultiplier = game.run.tagModifiers.attentionGainMultiplier ?? 1;
  const dailyMultiplier = game.run.daily?.twist?.attentionGainMultiplier ?? 1;
  const result = calculateBarkAudibility({
    environment: room.environment,
    cover: room.cover,
    now: game.elapsed,
    barkId,
    intensity: tagMultiplier * dailyMultiplier,
  });
  room.cover = result.cover;
  const applied = applyRoomAttention(game.rooms, roomIndex, result);
  game.rooms = applied.rooms;
  game.rooms.forEach((item) => { item.noise = item.attention / 100 * 3; });
  game.lastAudibility = result.classification;
  game.lastAudibilityUntil = game.elapsed + 0.8;
  canvasWrap.dataset.audibility = result.classification.toLowerCase();
  addEffect("audibility", game.charlieX, 410, {
    text: result.classification,
    color: result.classification === AUDIBILITY.COVERED ? "#277c76" : result.classification === AUDIBILITY.LOUD ? "#b84d37" : "#596b64",
    life: 0.7,
  });
  return { ...result, crossedThreshold: applied.crossedThreshold };
}

function triggerWarning(roomIndex) {
  if (!game || game.listening.active) return;
  const started = startListening(game.listening, { roomId: roomIndex, now: game.elapsed });
  game.listening = started.state;
  game.patience = game.listening.patience;
  game.warning = { room: roomIndex, startedAt: game.elapsed };
  game.listeningGraceUntil = game.elapsed + 0.48;
  ui.ownerBubble.dataset.state = "listening";
  ui.ownerBubble.hidden = false;
  ui.ownerBubbleTitle.textContent = `SHUSH · ${ROOMS[roomIndex].name}`;
  ui.ownerBubbleText.textContent = `The owner is listening in the ${ROOMS[roomIndex].name}.`;
  ui.ownerChoiceHint.textContent = "Relocate for a Sneaky Bark, or stay quiet for 2.5 seconds.";
  ui.ownerQuietProgress.value = 0;
  playShush(roomIndex);
  announce(`Charlie, quiet in the ${ROOMS[roomIndex].name}! Relocate or stay quiet for two and a half seconds.`, true);
}

function syncListeningState() {
  if (!game) return;
  game.patience = game.listening.patience;
  game.warning = game.listening.active
    ? { room: game.listening.active.roomId, startedAt: game.listening.active.startedAt }
    : null;
  game.sneaky = game.listening.sneaky
    ? {
      origin: game.listening.sneaky.originRoomId,
      room: game.listening.sneaky.roomId,
      until: game.listening.sneaky.expiresAt,
    }
    : null;
}

function patienceStrike(roomIndex) {
  if (!game || !game.listening.active || game.listening.active.roomId !== roomIndex) return;
  const violationCost = game.relaxed ? 17 : DEFAULT_ACOUSTICS.violationCost;
  const result = handleAudibleViolation(game.listening, {
    roomId: roomIndex,
    now: game.elapsed,
    cost: violationCost,
  });
  game.listening = result.state;
  game.violations += 1;
  syncListeningState();
  game.combo = 1;
  setPetReaction("failed");
  ui.ownerBubbleTitle.textContent = game.patience <= 34 ? "SHUSH · FINAL WARNING" : "SHUSH · HEARD AGAIN";
  ui.ownerBubbleText.textContent = `An audible bark cost ${result.patienceLost} Patience.`;
  ui.ownerQuietProgress.value = 0;
  showToast(`HEARD · Patience −${result.patienceLost}`, "warning");
  announce(`The shush was audibly ignored. ${Math.round(game.patience)} percent Patience remains.`, true);
  if (!game.relaxed && game.patience <= 0) endGame("quiet", false);
}

function repel(entity, options = {}) {
  const index = game.entities.indexOf(entity);
  if (index >= 0) game.entities.splice(index, 1);
  const early = Math.round((1 - entity.progress) * 55);
  const base = 100 * entity.maxHp + early;
  const scoreMultiplier = game.run.tagModifiers.guardScoreMultiplier ?? 1;
  const earned = Math.round(base * game.combo * scoreMultiplier);
  game.score += earned;
  game.guarded += 1;
  game.distinctWindowsGuarded.add(entity.windowId);
  game.chicken = Math.min(game.chickenGoal, game.chicken + 1);
  game.combo = Math.min(5, game.combo + 1);
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  if (game.superUntil > game.elapsed) game.superGuards += 1;
  if (entity.key === "coat") game.coatRepelled += 1;
  if (entity.boss) {
    game.bossActive = false;
    game.bossDefeated = true;
  }
  if (options.petReaction !== false) setPetReaction("review");
  addEffect("burst", activeSectors()[entity.windowId].x, 150, { color: "#e6ad3c", text: `+${earned}`, life: 1 });
  playSuccess();
  showToast(options.perfectCrime ? `PERFECT CRIME! +${earned}` : `Guarded! +${earned}`, options.perfectCrime ? "bonus" : "good");
  announce(`${entity.label} chased away from the ${targetLabel(entity.windowId)}. Score plus ${earned}${options.perfectCrime ? ", under perfect sound cover" : ""}.`);
}

function cabinBark() {
  if (!game || screen !== "playing" || game.barkCooldown > 0) return;
  const cooldownMultiplier = game.run.tagModifiers.barkCooldownMultiplier ?? 1;
  game.barkCooldown = 0.28 * cooldownMultiplier;
  game.barkUntil = game.elapsed + 0.2;
  game.barks += 1;
  game.shake = settings.motion ? 0.12 : 0;
  playBark(game.selectedWindow);
  const barkY = game.charlieLane === "upper" ? 310 : 548;
  addEffect("woof", game.charlieX, barkY, { text: "WOOF!", life: 0.55 });

  if (game.charlieLane === "lower") {
    game.flockActive = true;
    game.sheepBarks += 1;
    const beforeStatus = getFlockStatus(game.flock);
    const result = barkAtFlock(game.flock, { now: game.elapsed, charlieX: cabinNormalizedX(game.charlieX) });
    game.flock = result?.state ?? result?.flock ?? result;
    game.flockStatus = getFlockStatus(game.flock);
    const previouslyCompliant = new Set(beforeStatus.compliantStubbornIds ?? []);
    const stubbornResponded = (game.flockStatus.compliantStubbornIds ?? [])
      .some((id) => !previouslyCompliant.has(id));
    if (stubbornResponded) {
      game.correctBarks += 1;
      game.score += 90;
      game.combo = Math.min(5, game.combo + 1);
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      setPetReaction("review");
      showToast("Grudging compliance · +90", "good");
      addEffect("burst", game.charlieX, 603, { color: "#e6ad3c", text: "FINE.", life: 0.9 });
      announce("The tagged ewe acknowledged Charlie's authority and took several deeply reluctant steps.");
    } else {
      game.unnecessary += 1;
      game.score = Math.max(0, game.score - 15);
      game.combo = 1;
      setPetReaction("failed");
      showToast("…MUNCH · ordinary sheep scattered", "warning");
      addEffect("alert", game.charlieX, 612, { color: "#596b64", text: "…MUNCH", life: 0.85 });
      announce("The ordinary sheep offered an ear twitch and continued eating. Herd them with Charlie's position instead.");
    }
    syncHUD();
    return;
  }

  const entity = game.entities
    .filter((candidate) => candidate.windowId === game.selectedWindow)
    .sort((left, right) => right.progress - left.progress)[0];
  if (!entity) {
    game.unnecessary += 1;
    game.combo = 1;
    game.score = Math.max(0, game.score - 20);
    setPetReaction("failed");
    showToast("Empty fence · −20", "warning");
    announce("No one was at that upper-fence sector.");
  } else if (entity.friendly) {
    game.entities.splice(game.entities.indexOf(entity), 1);
    game.unnecessary += 1;
    game.friendBarks += 1;
    game.combo = 1;
    game.score = Math.max(0, game.score - 60);
    setPetReaction("failed");
    showToast("Friendly passer-by · −60", "warning");
    announce(`${entity.label} was friendly. Let round-marker visitors pass the cabin.`);
  } else {
    game.correctBarks += 1;
    entity.hp -= 1 + (game.run.tagModifiers.barkDamageBonus ?? 0) + (game.superUntil > game.elapsed ? 1 : 0);
    if (entity.hp <= 0) {
      repel(entity, { petReaction: true });
    } else {
      entity.progress = Math.max(0.08, entity.progress - 0.18);
      setPetReaction("running");
      playHit(entity.windowId);
      showToast(`${entity.label}: ${entity.hp} bark${entity.hp === 1 ? "" : "s"} left`, "warning");
      announce(`${entity.label} backed away but remains at the upper fence.`);
    }
  }
  syncHUD();
}

function bark() {
  if (isCabinRun()) {
    cabinBark();
    return;
  }
  if (!game || screen !== "playing" || game.barkCooldown > 0) return;
  const cooldownMultiplier = game.run.tagModifiers.barkCooldownMultiplier ?? 1;
  game.barkCooldown = 0.28 * cooldownMultiplier;
  game.barkUntil = game.elapsed + 0.2;
  game.barks += 1;
  game.shake = settings.motion ? 0.16 : 0;
  const room = game.selectedRoom;
  const windowId = game.selectedWindow;
  const barkId = game.nextBarkId++;
  const audibility = barkAudibility(room, barkId);
  if (audibility.classification === AUDIBILITY.COVERED) game.coveredBarks += 1;
  const listeningHere = game.listening.active?.roomId === room;
  let perfectCrimeCandidate = false;
  let ownerHeard = false;

  if (listeningHere && audibility.classification === AUDIBILITY.COVERED) {
    const covered = handleCoveredBark(game.listening, { roomId: room, now: game.elapsed });
    game.listening = covered.state;
    if (covered.perfectCrime) game.perfectCrimes += 1;
    syncListeningState();
    perfectCrimeCandidate = true;
    ui.ownerBubbleText.textContent = "The bark vanished beneath the household noise.";
    ui.ownerQuietProgress.value = 0;
  } else if (listeningHere && game.elapsed >= game.listeningGraceUntil) {
    patienceStrike(room);
    ownerHeard = true;
    if (game.ended) return;
  } else if (listeningHere) {
    game.listening.active.quietSince = game.elapsed;
  }

  playBark(windowId);
  addEffect("woof", WINDOWS[windowId].x, 370, { text: "WOOF!", life: 0.55 });

  const entity = game.entities
    .filter((candidate) => candidate.windowId === windowId)
    .sort((a, b) => b.progress - a.progress)[0];

  if (!entity) {
    game.score = Math.max(0, game.score - 25);
    game.combo = 1;
    game.unnecessary += 1;
    setPetReaction("failed");
    showToast("Empty window · −25", "warning");
    announce("No one was at that window. An unnecessary bark reset the streak.");
  } else if (entity.friendly) {
    game.entities.splice(game.entities.indexOf(entity), 1);
    game.score = Math.max(0, game.score - 60);
    game.combo = 1;
    game.unnecessary += 1;
    game.friendBarks += 1;
    setPetReaction("failed");
    game.listening.sneaky = null;
    syncListeningState();
    addEffect("wave", WINDOWS[windowId].x, 142, { text: "SORRY!", color: "#277c76", life: 0.9 });
    showToast("Friendly passer-by · −60", "warning");
    announce(`${entity.label} was friendly. Let waving-hand visitors pass.`);
  } else {
    game.correctBarks += 1;
    const sneakyResult = consumeSneakyBark(game.listening, { roomId: room, now: game.elapsed });
    game.listening = sneakyResult.state;
    syncListeningState();
    if (sneakyResult.awarded) {
      game.score += 75;
      game.switches += 1;
      showToast("Sneaky Switch! +75", "bonus");
      addEffect("burst", game.charlieX, 470, { text: "+75", color: "#277c76", life: 1 });
      const followAlways = Boolean(game.run.patrol.roomConditions.ownerListeningFollows);
      const followAfter = Number(game.run.patrol.roomConditions.ownerListeningFollowsAfterSwitches ?? Number.POSITIVE_INFINITY);
      if (followAlways || game.switches >= followAfter) {
        game.ownerFollow = { room, at: game.elapsed + 1.35 };
      }
    }

    let damage = (game.superUntil > game.elapsed ? 2 : 1) + (game.run.tagModifiers.barkDamageBonus ?? 0);
    let behaviorFeedback = null;
    if (entity.key === "squirrel" && !entity.behavior?.hopDone) {
      entity.behavior = { ...(entity.behavior ?? {}), hopDone: true };
      const hop = resolveEntityBehavior(entity, "barked");
      if (hop.outcome === "squirrel-hopped") {
        damage = 0;
        behaviorFeedback = {
          toast: "Squirrel hopped windows!",
          announcement: `The squirrel dodged to the ${WINDOWS[entity.windowId].label}. Follow it.`,
          kind: "warning",
        };
      }
    }

    entity.hp -= damage;
    if (entity.key === "pirate" && entity.hp > 0 && !entity.behavior?.retreated) {
      entity.behavior = { ...(entity.behavior ?? {}), retreated: true };
      entity.progress = Math.max(0.08, entity.progress - 0.2);
      behaviorFeedback = {
        toast: "Parcel pirate retreated!",
        announcement: "The parcel pirate backed away from the glass.",
        kind: "good",
      };
    }
    if (entity.hp > 0 && ["robot", "coat"].includes(entity.key)) {
      const behavior = resolveEntityBehavior(entity, "barked");
      if (["robot-reboot-armed", "robot-rebooted-and-rearmed"].includes(behavior.outcome)) {
        behaviorFeedback = {
          toast: "Robot rebooting—bark again!",
          announcement: "The robot is trying to restore its lost bark point.",
          kind: "warning",
        };
      } else if (behavior.outcome === "robot-reboot-interrupted") {
        behaviorFeedback = {
          toast: "Robot reboot interrupted!",
          announcement: "The robot's reboot was interrupted.",
          kind: "good",
        };
      } else if (behavior.outcome === "coat-dodged-room") {
        behaviorFeedback = {
          toast: "Mystery Coat changed rooms!",
          announcement: `The Mystery Coat slipped to the ${WINDOWS[entity.windowId].label}.`,
          kind: "warning",
        };
      }
    }

    if (entity.hp <= 0) repel(entity, { perfectCrime: perfectCrimeCandidate, petReaction: !ownerHeard });
    else {
      if (!ownerHeard) setPetReaction("running");
      playHit(windowId);
      const remaining = `${entity.hp} bark${entity.hp === 1 ? "" : "s"} left`;
      if (behaviorFeedback) {
        showToast(`${behaviorFeedback.toast} · ${remaining}`, behaviorFeedback.kind);
        announce(`${behaviorFeedback.announcement} ${remaining}.`);
      } else {
        showToast(`${entity.label}: ${remaining}`, "warning");
        announce(`${entity.label} is stubborn. Bark again.`);
      }
    }
  }

  if (!game.listening.active && audibility.crossedThreshold) triggerWarning(room);
  syncHUD();
}

function useChicken() {
  if (!game || screen !== "playing" || game.chicken < game.chickenGoal) return;
  if (isCabinRun()) {
    if (game.charlieLane === "lower") game.flockActive = true;
    game.chicken = 0;
    game.chickens += 1;
    const superDuration = 6 * (game.run.tagModifiers.superDurationMultiplier ?? 1);
    game.superUntil = game.elapsed + superDuration;
    game.superStartedAt = game.elapsed;
    game.entities.forEach((entity) => {
      if (!entity.friendly) entity.hp = Math.max(1, entity.hp - 1);
    });
    setPetReaction("jumping");
    playChicken();
    addEffect("chicken", game.charlieX, (game.charlieY ?? 520) - 70, { text: "HERDING FOCUS!", color: "#e6ad3c", life: 1.3 });
    showToast(`Herding Focus: ${superDuration.toFixed(1)} seconds!`, "bonus");
    announce(`Chicken deployed. Charlie's herding-pressure range is wider for ${superDuration.toFixed(1)} seconds.`);
    syncHUD();
    return;
  }
  game.chicken = 0;
  game.chickens += 1;
  const superDuration = 6 * (game.run.tagModifiers.superDurationMultiplier ?? 1);
  const patienceRestore = 25 * (game.run.tagModifiers.chickenPatienceRestoreMultiplier ?? 1);
  game.superUntil = game.elapsed + superDuration;
  game.superStartedAt = game.elapsed;
  setPetReaction("jumping");
  game.listening = {
    ...game.listening,
    patience: Math.min(MAX_PATIENCE, game.listening.patience + patienceRestore),
    active: null,
  };
  syncListeningState();
  game.rooms.forEach((room) => {
    room.attention = Math.max(0, room.attention - 45);
    room.noise = room.attention / 100 * 3;
  });
  game.entities.forEach((entity) => {
    if (!entity.friendly) entity.hp = Math.max(1, entity.hp - 1);
  });
  ui.ownerBubble.hidden = true;
  playChicken();
  addEffect("chicken", game.charlieX, 430, { text: "CHICKEN FOCUS!", color: "#e6ad3c", life: 1.3 });
  showToast(`Super Sniffer: ${superDuration.toFixed(1)} seconds!`, "bonus");
  announce(`Chicken deployed. Patience restored and Super Sniffer active for ${superDuration.toFixed(1)} seconds.`);
  syncHUD();
}

function phaseIndex() {
  if (!game) return 0;
  if (!Number.isFinite(game.duration)) return Math.min(2, Math.floor(game.elapsed / 30));
  const progress = game.duration > 0 ? game.elapsed / game.duration : 0;
  return progress < 1 / 3 ? 0 : progress < 2 / 3 ? 1 : 2;
}

function spawnVisitor(options = {}) {
  if (!game || game.ended) return null;
  const occupied = new Set(game.entities.map((entity) => entity.windowId));
  let choices = WINDOWS.filter((item) => !occupied.has(item.id));
  if (!choices.length) return null;
  const phase = phaseIndex();
  const firstVisitor = game.elapsed < 4;
  let windowItem = options.windowId === undefined
    ? (firstVisitor && !occupied.has(game.selectedWindow) ? WINDOWS[game.selectedWindow] : choices[Math.floor(game.rng() * choices.length)])
    : WINDOWS[options.windowId];
  if (!windowItem || occupied.has(windowItem.id)) windowItem = choices[Math.floor(game.rng() * choices.length)];
  const friendlyRate = game.run.patrol.id === "special-delivery" ? 0.34 : isCabinRun() ? 0.3 : phase === 1 ? 0.28 : 0.2;
  const typedFriend = FRIENDS.some((item) => item.key === options.type);
  const typedThreat = THREATS.some((item) => item.key === options.type);
  const friendly = options.friendly
    ?? (typedFriend ? true : typedThreat ? false : (!firstVisitor && game.rng() < friendlyRate));
  const featuredThreats = game.run.patrol.featuredVisitors
    .map((key) => THREATS.find((item) => item.key === key))
    .filter(Boolean);
  const threatChoices = featuredThreats.length ? featuredThreats : THREATS.slice(0, phase === 0 ? 3 : phase === 1 ? 5 : 6);
  const source = friendly
    ? options.type ? FRIENDS.find((item) => item.key === options.type) ?? FRIENDS[Math.floor(game.rng() * FRIENDS.length)] : FRIENDS[Math.floor(game.rng() * FRIENDS.length)]
    : options.type ? THREATS.find((item) => item.key === options.type) ?? threatChoices[Math.floor(game.rng() * threatChoices.length)] : threatChoices[Math.floor(game.rng() * threatChoices.length)];
  const maxHp = friendly ? 0 : clamp(options.hp ?? source.hp, 1, 9);
  const difficultyScale = 1 + Math.max(0, Number(game.run.patrol.difficulty ?? (isCabinRun() ? 3 : 1)) - 1) * 0.025;
  const endlessScale = game.run.mode === "endless" ? 1 + Math.floor(game.elapsed / 30) * 0.06 : 1;
  const dailyScale = game.run.daily?.twist?.visitorSpeedMultiplier ?? 1;
  const speedBase = (isCabinRun() ? [0.085, 0.105, 0.128] : [0.105, 0.13, 0.158])[phase] * difficultyScale * endlessScale * dailyScale * (game.relaxed ? 0.72 : 1);
  const entity = {
    id: game.nextId++,
    key: source.key,
    visitorType: source.key,
    windowId: windowItem.id,
    friendly,
    label: source.label,
    icon: source.icon,
    color: source.color,
    hp: maxHp,
    maxHp,
    progress: options.progress ?? 0,
    speed: options.speed ?? speedBase * (0.86 + game.rng() * 0.25),
    behavior: { ...(options.behavior ?? {}) },
    boss: Boolean(options.boss),
    parcelRaid: Boolean(options.parcelRaid),
    leavesParcel: Boolean(options.leavesParcel),
  };
  const hadPigeon = game.entities.some((item) => item.key === "pigeon");
  game.entities.push(entity);
  game.discoveredVisitors.add(entity.key);
  if (entity.boss) game.bossActive = true;
  if (friendly && source.key === "postie") {
    playDoorbell(windowItem.id);
    const coverCharges = Number(game.run.roomConditions.doorbell?.attentionCoverCharges) || 0;
    if (coverCharges > 0) {
      const roomId = roomForWindow(windowItem.id);
      game.rooms[roomId].cover = grantCoverCharges(game.rooms[roomId].cover, {
        source: "doorbell",
        charges: coverCharges,
        now: game.elapsed,
        expiresAt: game.elapsed + 3,
      });
    }
  }
  if (entity.key === "pigeon" && !hadPigeon && !entity.behavior.paired) resolveEntityBehavior(entity, "spawned");
  announce(`${friendly ? "Friendly" : "Suspicious"} visitor at the ${targetLabel(windowItem.id)}: ${entity.label}.`);
  return entity;
}

function missVisitor(entity) {
  const index = game.entities.indexOf(entity);
  if (index >= 0) game.entities.splice(index, 1);
  if (entity.friendly) {
    game.friendsSpared += 1;
    setPetReaction("waving");
    if (entity.key === "postie") {
      game.parcelsDelivered += 1;
      resolveEntityBehavior(entity, "passed");
      showToast("Postie safely delivered · +30", "good");
      game.score += 30;
    } else if (entity.key === "walker") {
      game.chicken = Math.min(game.chickenGoal, game.chicken + 1);
      showToast("Dog walker passed · Chicken +1", "bonus");
    } else if (entity.key === "neighbour") {
      game.score += 25;
      showToast("Neighbour approved · +25", "good");
    } else if (entity.key === "cleaner") {
      const room = roomForWindow(entity.windowId);
      game.rooms[room].attention = Math.max(0, game.rooms[room].attention - 20);
      game.rooms[room].noise = game.rooms[room].attention / 100 * 3;
      showToast("Window sparkling · Attention cooled", "good");
    }
    return;
  }
  game.combo = 1;
  game.missed += 1;
  setPetReaction("failed");
  game.safety = game.relaxed ? Math.max(1, game.safety - 0.5) : Math.max(0, game.safety - 1);
  addEffect("alert", activeSectors()[entity.windowId].x, 180, { text: "TOO CLOSE!", color: "#b84d37", life: 1.1 });
  playAlert(entity.windowId);
  showToast("A threat reached the glass!", "warning");
  announce(`${entity.label} reached the ${targetLabel(entity.windowId)}.`, true);
  if (!game.relaxed && game.safety <= 0) endGame("safety", false);
}

function activateRoomCondition(event) {
  const room = game.rooms[event.roomId];
  if (!room) return;
  room.environment = event.environment;
  room.environmentUntil = game.elapsed + Math.max(0, Number(event.duration) || 0);
  if (event.coverCharges) {
    room.cover = grantCoverCharges(room.cover, {
      source: event.environment,
      charges: event.coverCharges,
      maxCharges: Math.max(2, event.coverCharges),
      now: game.elapsed,
      expiresAt: room.environmentUntil,
    });
  }
  const conditionName = event.environment === "video-call"
    ? "Video call: office barks are LOUD"
    : event.environment === "tv"
      ? `TV action scene: ${event.coverCharges ?? 0} bark cover`
      : `Kettle whistle: ${event.coverCharges ?? 0} bark cover`;
  showToast(conditionName, "bonus");
  announce(`${ROOMS[event.roomId].name}: ${conditionName}.`);
}

function executeDirectorEvent(event) {
  if (event.kind === "spawn") {
    spawnVisitor({
      ...event,
      type: event.visitorType,
      progress: event.progress ?? 0,
    });
  } else if (event.kind === "condition") {
    activateRoomCondition(event);
  } else if (event.kind === "message") {
    showToast(event.text, "bonus");
    announce(event.text, true);
  }
}

function processDirector() {
  while (game.eventCursor < game.scheduledEvents.length && game.scheduledEvents[game.eventCursor].at <= game.elapsed) {
    executeDirectorEvent(game.scheduledEvents[game.eventCursor]);
    game.eventCursor += 1;
  }
  while (game.pendingSpawns.length && game.pendingSpawns[0].at <= game.elapsed) {
    const directive = game.pendingSpawns.shift();
    spawnVisitor({ ...directive, type: directive.visitorType, progress: directive.progress ?? 0 });
  }

  if (game.run.mode === "endless" && game.elapsed >= game.nextDirectorAt) {
    const ids = PATROLS.flatMap((patrol) => patrol.director.deck);
    if (Math.floor(game.elapsed / 90) > 0) ids.push("coat-stand-off");
    const cardId = ids[Math.floor(game.rng() * ids.length)];
    const selected = getDirectorCard(cardId);
    if (selected) {
      for (const event of expandEventCard(selected, { at: game.elapsed, instanceId: `${selected.id}:${game.elapsed.toFixed(2)}` })) {
        game.scheduledEvents.push(event);
      }
      game.scheduledEvents.sort((left, right) => left.at - right.at);
    }
    game.nextDirectorAt = game.elapsed + Math.max(4.2, 9 - game.elapsed / 90);
  }
}

function loosenFlockAfterMark(flock) {
  const status = getFlockStatus(flock);
  if (status.completed || status.settledCount < status.requiredSettled) return flock;
  const inZone = new Set(status.inZoneIds);
  const moveCount = status.settledCount - status.requiredSettled + 1;
  const candidates = flock.sheep
    .filter((sheep) => inZone.has(sheep.id))
    .sort((left, right) => Number(left.stubborn) - Number(right.stubborn) || left.id.localeCompare(right.id));
  const movedIds = new Set(candidates.slice(0, moveCount).map((sheep) => sheep.id));
  let offset = 0;
  return {
    ...flock,
    sheep: flock.sheep.map((sheep) => {
      if (!movedIds.has(sheep.id)) return sheep;
      const x = Math.max(flock.config.minX, flock.config.settledZone.min - 0.1 - offset * 0.055);
      offset += 1;
      return { ...sheep, x, scatterUntil: null, scatterDirection: 0 };
    }),
    settledSince: null,
  };
}

function updateCabinGame(dt) {
  game.elapsed += dt;
  game.timeLeft = game.duration - game.elapsed;
  game.barkCooldown = Math.max(0, game.barkCooldown - dt);
  game.shake = Math.max(0, game.shake - dt);
  game.moving = Math.max(0, game.moving - dt * 2.8);
  const travel = 1 - Math.pow(0.0009, dt);
  game.charlieX += (game.targetX - game.charlieX) * travel;
  game.charlieY += (game.targetY - game.charlieY) * travel;
  if (!settings.motion) {
    game.charlieX = game.targetX;
    game.charlieY = game.targetY;
  }

  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    const requiredMarks = game.run.travelAssignment?.settledMarkTarget ?? 3;
    const success = game.safety > 0 && (game.flockStatus?.settleMarks ?? 0) >= requiredMarks;
    endGame(success ? "complete" : "flock", success);
    return;
  }

  if (!game.cabinTutorialShown && game.elapsed >= 0.65) {
    game.cabinTutorialShown = true;
    showToast("Stand beside sheep to guide them → shaded grass", "bonus");
    announce("Herding lesson. Move Charlie beside the sheep and let her presence push them toward the shaded grass on the right. Ordinary sheep do not need barking.");
  }

  const beforeMarks = game.flockStatus?.settleMarks ?? 0;
  game.flock = updateFlock(game.flock, {
    dt,
    now: game.elapsed,
    charlieX: cabinNormalizedX(game.charlieX),
    charlieLane: game.flockActive && game.charlieLane === "lower" ? "sheep" : "upper",
    focusBoost: game.superUntil > game.elapsed,
  });
  game.flockStatus = getFlockStatus(game.flock);
  game.patience = flockOrderPercent(game.flockStatus);
  game.bestFlockSize = Math.max(game.bestFlockSize, game.flockStatus.settledCount);
  if (game.flockStatus.settleMarks > beforeMarks) {
    const earnedMarks = game.flockStatus.settleMarks - beforeMarks;
    game.flockSettled = game.flockStatus.settleMarks;
    game.score += earnedMarks * 450;
    game.chicken = Math.min(game.chickenGoal, game.chicken + earnedMarks);
    game.combo = Math.min(5, game.combo + earnedMarks);
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    setPetReaction("waving");
    playSuccess();
    addEffect("burst", cabinCanvasX(0.825), 623, { color: "#e6ad3c", text: `FLOCK ${game.flockStatus.settleMarks}/3`, life: 1.25 });
    showToast(`Flock Settled ${game.flockStatus.settleMarks}/3 · +${earnedMarks * 450}`, "good");
    announce(`Flock Settled mark ${game.flockStatus.settleMarks} of 3 earned. The sheep have found a newly urgent patch of grass.`);
    game.flock = loosenFlockAfterMark(game.flock);
    game.flockStatus = getFlockStatus(game.flock);
  }

  if (game.petReaction && game.elapsed >= game.petReaction.until) game.petReaction = null;
  if (game.lookTarget && game.elapsed >= game.lookTarget.until) game.lookTarget = null;

  processDirector();
  for (const entity of [...game.entities]) {
    entity.progress += entity.speed * dt;
    if (entity.progress >= 1) {
      missVisitor(entity);
      if (game.ended) return;
    }
  }

  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter((effect) => effect.life > 0);
  syncHUD();
}

function updateGame(dt) {
  if (!game || game.ended || screen !== "playing") return;
  if (isCabinRun()) {
    updateCabinGame(dt);
    return;
  }
  game.elapsed += dt;
  game.timeLeft = Number.isFinite(game.duration) ? game.duration - game.elapsed : Number.POSITIVE_INFINITY;
  game.barkCooldown = Math.max(0, game.barkCooldown - dt);
  game.shake = Math.max(0, game.shake - dt);
  game.moving = Math.max(0, game.moving - dt * 2.8);
  const travel = 1 - Math.pow(0.0009, dt);
  game.charlieX += (game.targetX - game.charlieX) * travel;
  if (!settings.motion) game.charlieX = game.targetX;

  if (Number.isFinite(game.timeLeft) && game.timeLeft <= 0) {
    game.timeLeft = 0;
    const bossRequired = game.run.patrol.id === "mystery-coat-incident";
    endGame(bossRequired && !game.bossDefeated ? "boss" : "complete", !bossRequired || game.bossDefeated);
    return;
  }

  game.rooms = decayRoomAttention(game.rooms, { dt, occupiedRoomId: game.selectedRoom });
  game.rooms.forEach((room) => { room.noise = room.attention / 100 * 3; });

  game.rooms.forEach((room) => {
    if (room.cover.expiresAt > 0 && game.elapsed >= room.cover.expiresAt) {
      room.cover = createCoverState();
    }
    if (room.environmentUntil > 0 && game.elapsed >= room.environmentUntil) {
      room.environment = room.baseEnvironment;
      room.environmentUntil = 0;
      room.cover = createCoverState();
    }
  });

  if (game.listening.active) {
    const recovery = DEFAULT_ACOUSTICS.quietRecovery * (game.run.tagModifiers.quietRecoveryMultiplier ?? 1);
    const quiet = advanceQuietCompliance(game.listening, { now: game.elapsed, recovery });
    const quietElapsed = Math.max(0, game.elapsed - game.listening.active.quietSince);
    ui.ownerQuietProgress.value = Math.min(100, quietElapsed / DEFAULT_ACOUSTICS.quietSeconds * 100);
    if (quiet.outcome === "quiet-compliance") {
      const roomId = game.listening.active.roomId;
      game.listening = quiet.state;
      game.quietResolutions += 1;
      game.rooms[roomId].attention = Math.min(game.rooms[roomId].attention, 20);
      game.rooms[roomId].noise = game.rooms[roomId].attention / 100 * 3;
      game.score += 50;
      setPetReaction("waving");
      syncListeningState();
      ui.ownerBubble.hidden = true;
      showToast(`Good girl · Patience +${Math.round(quiet.recovered)} · +50`, "good");
      announce(`Charlie stayed quiet. Patience restored by ${Math.round(quiet.recovered)}.`);
    }
  }

  if (game.ownerFollow && game.elapsed >= game.ownerFollow.at && !game.listening.active) {
    const roomId = game.selectedRoom;
    game.ownerFollow = null;
    game.rooms[roomId].attention = 100;
    triggerWarning(roomId);
    ui.ownerBubbleTitle.textContent = `STILL LISTENING · ${ROOMS[roomId].name}`;
    ui.ownerBubbleText.textContent = `The owner followed Charlie to the ${ROOMS[roomId].name}.`;
  }

  if (game.lastAudibility && game.elapsed >= game.lastAudibilityUntil) {
    game.lastAudibility = null;
    delete canvasWrap.dataset.audibility;
  }

  if (game.petReaction && game.elapsed >= game.petReaction.until) game.petReaction = null;
  if (game.lookTarget && game.elapsed >= game.lookTarget.until) game.lookTarget = null;

  if (game.listening.sneaky && game.elapsed >= game.listening.sneaky.expiresAt) {
    game.listening.sneaky = null;
    syncListeningState();
  }

  processDirector();

  game.spawnIn -= dt;
  const maxVisitors = [2, 3, 4][phaseIndex()];
  if (game.spawnIn <= 0) {
    const nextEvent = game.scheduledEvents[game.eventCursor];
    const needsFiller = ["classic", "endless"].includes(game.run.mode)
      || (game.entities.length === 0 && (!nextEvent || nextEvent.at - game.elapsed > 3.5));
    if (needsFiller && game.entities.length < maxVisitors) spawnVisitor();
    const interval = [4.5, 3.65, 2.85][phaseIndex()]
      * (game.run.daily?.twist?.spawnIntervalMultiplier ?? 1)
      * (game.relaxed ? 1.38 : 1);
    game.spawnIn = interval + (game.rng() - 0.5) * 0.7;
  }

  for (const entity of [...game.entities]) {
    if (["robot", "leaves"].includes(entity.key)) {
      const behavior = resolveEntityBehavior(entity, "tick");
      if (behavior.outcome === "robot-rebooted") showToast("Robot rebooted!", "warning");
      if (behavior.outcome === "leaves-spread") showToast("Leaf monster spread!", "warning");
    }
    entity.progress += entity.speed * dt;
    if (entity.progress >= 1) {
      missVisitor(entity);
      if (game.ended) return;
    }
  }

  for (const effect of game.effects) effect.life -= dt;
  game.effects = game.effects.filter((effect) => effect.life > 0);
  syncHUD();
}

function displayedRecord(active) {
  const liveScore = Math.max(0, Math.round(active.score));
  if (active.run.mode === "travel") {
    const stored = profile.lifetime.byMode.travel?.bestScore ?? 0;
    return { label: "Travel best", value: Math.max(stored, liveScore).toLocaleString() };
  }
  if (active.run.mode === "daily") {
    const stored = profile.daily.bestByDate[active.run.daily?.dateKey] ?? 0;
    return { label: "Best today", value: Math.max(stored, liveScore).toLocaleString() };
  }
  if (active.run.mode === "endless") {
    const stored = profile.lifetime.byMode.endless.longestSeconds;
    return { label: "Longest watch", value: formatTime(Math.max(stored, active.elapsed)) };
  }
  if (active.run.mode === "campaign") {
    const stored = profile.campaign.bestByPatrol[active.run.patrolId]?.bestScore ?? 0;
    return { label: "Case best", value: Math.max(stored, liveScore).toLocaleString() };
  }
  const classic = profile.lifetime.byMode.classic;
  if (classic.runs === 0) {
    return { label: "Best patrol", value: Math.max(profile.bestScore, liveScore).toLocaleString() };
  }
  return { label: "Classic best", value: Math.max(classic.bestScore, liveScore).toLocaleString() };
}

function syncHUD() {
  const active = game ?? newGame();
  const phaseNames = ["Morning mail", "Lunch rush", "Golden window"];
  ui.time.textContent = Number.isFinite(active.timeLeft) ? formatTime(active.timeLeft) : `OT ${formatTime(active.elapsed)}`;
  const phaseName = active.run.mode === "travel"
    ? active.elapsed < 16 ? "Learn the flock" : active.elapsed < 72 ? "Cabin patrol" : "Two-fence finale"
    : active.run.mode === "endless"
    ? `Overtime ${Math.floor(active.elapsed / 30) + 1}`
    : phaseNames[phaseIndex()] ?? phaseNames[0];
  ui.phase.textContent = active.relaxed ? `${phaseName} · relaxed` : phaseName;
  ui.currentPatrolLabel.textContent = active.run.mode === "campaign"
    ? `Case ${String(active.run.patrol.number).padStart(2, "0")} · ${active.run.patrol.shortTitle}`
    : active.run.mode === "travel" ? "Travel File · Czech Cabin Duty" : active.run.mode === "daily" ? "Today's patrol" : active.run.mode === "endless" ? "Overtime Watch" : "Classic patrol";
  ui.activeObjective.textContent = active.run.mode === "campaign"
    ? active.run.patrol.objectives.map((objective) => objective.label).join(" · ")
    : active.run.mode === "travel" ? `Settle the flock ${active.flockStatus?.settleMarks ?? 0}/3 · Keep the upper fence secure.` : active.run.mode === "daily" ? `${active.run.daily.twist.label}: secure today's seeded route.` : active.run.mode === "endless" ? "Stay on watch for as long as possible." : "Keep the flat safe until the watch ends.";
  ui.score.textContent = Math.max(0, Math.round(active.score)).toLocaleString();
  const record = displayedRecord(active);
  ui.bestLabel.textContent = record.label;
  ui.best.textContent = record.value;
  const comboLabel = ui.combo?.closest(".combo-badge")?.querySelector("span");
  if (comboLabel) comboLabel.textContent = active.run.mode === "travel" ? "Settled" : "Streak";
  ui.combo.textContent = active.run.mode === "travel" ? `${active.flockStatus?.settleMarks ?? 0}/3` : `×${active.combo}`;
  const safetyPercent = Math.round((active.safety / 3) * 100);
  const patiencePercent = active.run.mode === "travel" ? flockOrderPercent(active.flockStatus) : Math.round(active.patience);
  const chickenPercent = Math.round((active.chicken / active.chickenGoal) * 100);
  ui.safety.textContent = `${safetyPercent}%`;
  ui.patience.textContent = `${patiencePercent}%`;
  ui.safetyLabel.innerHTML = active.run.mode === "travel"
    ? '<span class="meter-symbol meter-symbol--shield" aria-hidden="true">◆</span> Cabin safety'
    : '<span class="meter-symbol meter-symbol--shield" aria-hidden="true">◆</span> Safety';
  ui.patienceLabel.innerHTML = active.run.mode === "travel"
    ? '<span class="meter-symbol" aria-hidden="true">●</span> Flock order'
    : '<span class="meter-symbol" aria-hidden="true">●</span> Patience';
  ui.chickenValue.textContent = `${chickenPercent}%`;
  ui.chickenFill.style.width = `${chickenPercent}%`;
  ui.safetyMeter?.setAttribute("aria-valuenow", String(safetyPercent));
  ui.patienceMeter?.setAttribute("aria-valuenow", String(patiencePercent));
  ui.patienceMeter?.setAttribute("aria-valuetext", active.run.mode === "travel"
    ? `${active.flockStatus?.settledCount ?? 0} of ${active.flockStatus?.total ?? 6} sheep in the shaded gathering patch; ${active.flockStatus?.settleMarks ?? 0} of 3 Flock Settled marks earned`
    : `${patiencePercent} percent owner patience remaining`);
  ui.chickenMeter?.setAttribute("aria-valuenow", String(chickenPercent));
  const safeFill = ui.safetyMeter?.querySelector(".meter-fill");
  const patienceFill = ui.patienceMeter?.querySelector(".meter-fill");
  if (safeFill) safeFill.style.width = `${safetyPercent}%`;
  if (patienceFill) patienceFill.style.width = `${patiencePercent}%`;
  ui.chickenButton.disabled = screen !== "playing" || active.chicken < active.chickenGoal;

  if (ui.threatRoster) {
    const visitors = active.entities
      .slice()
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 4)
      .map((entity) => {
        const marker = entity.friendly ? "○" : "△";
        const detail = entity.friendly ? "friendly" : `${entity.hp} bark${entity.hp === 1 ? "" : "s"}${entity.boss ? ", boss" : ""}`;
        return `${marker} ${entity.label} at ${targetLabel(entity.windowId)} (${detail})`;
      });
    const watching = active.run.mode === "travel"
      ? `${active.charlieLane === "upper" ? targetLabel(active.selectedWindow) : `sheep-fence position ${active.selectedWindow + 1}`} · Flock ${active.flockStatus?.settledCount ?? 0}/${active.flockStatus?.total ?? 6} in patch · Marks ${active.flockStatus?.settleMarks ?? 0}/3`
      : currentWindow().label;
    ui.threatRoster.innerHTML = `<strong>Watching:</strong> ${watching}${visitors.length ? ` <span aria-hidden="true">•</span> ${visitors.join(" · ")}` : " <span aria-hidden=\"true\">•</span> No visitors outside."}`;
  }

}

function updateRoomUI() {
  if (!game) return;
  const cabin = isCabinRun();
  document.body.dataset.arena = cabin ? "cabin" : "flat";
  if (ui.switchFenceButton) {
    ui.switchFenceButton.hidden = !cabin;
    const destination = game.charlieLane === "upper" ? "lower sheep fence" : "upper visitor fence";
    const arrow = game.charlieLane === "upper" ? "↓" : "↑";
    ui.switchFenceButton.innerHTML = `Switch to ${game.charlieLane === "upper" ? "lower" : "upper"} fence <span aria-hidden="true">${arrow}</span>`;
    ui.switchFenceButton.setAttribute("aria-label", `Switch to ${destination}`);
  }
  ui.prevWindow.setAttribute("aria-label", cabin ? "Move left along the current fence" : "Previous window across the flat");
  ui.nextWindow.setAttribute("aria-label", cabin ? "Move right along the current fence" : "Next window across the flat");
  ui.barkButton.setAttribute("aria-label", cabin && game.charlieLane === "lower" ? "Bark at nearby sheep" : "Bark");
  canvas.setAttribute("aria-label", cabin
    ? "A quiet Czech cabin yard between two fences. Defend the upper fence and guide six sheep into the shaded patch below."
    : "The flat seen room by room. Watch the windows and help Charlie bark at suspicious passers-by.");
  canvasWrap.dataset.room = ROOMS[game.selectedRoom].id;
  canvasWrap.dataset.window = String(game.selectedWindow);
  canvasWrap.dataset.lane = cabin ? game.charlieLane : "indoors";
  syncCanvasCamera();
}

function roundedRect(x, y, width, height, radius = 12) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function label(text, x, y, options = {}) {
  ctx.save();
  ctx.font = `${options.weight ?? 800} ${options.size ?? 18}px ${options.font ?? '"Avenir Next", "Segoe UI", sans-serif'}`;
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = options.baseline ?? "alphabetic";
  ctx.fillStyle = options.color ?? "#242927";
  ctx.fillText(text, x, y, options.maxWidth);
  ctx.restore();
}

function hasReward(rewardId) {
  return profile.unlocks.rewardIds.includes(rewardId);
}

function drawCabinFence(y, selectedLane) {
  ctx.save();
  ctx.fillStyle = "#7b5536";
  ctx.strokeStyle = "#4e3929";
  ctx.lineWidth = 3;
  for (let x = 18; x <= WIDTH; x += 92) {
    ctx.beginPath();
    ctx.moveTo(x, y - 30);
    ctx.lineTo(x + 8, y - 43);
    ctx.lineTo(x + 16, y - 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x, y - 30, 16, 65);
    ctx.strokeRect(x, y - 30, 16, 65);
  }
  for (const offset of [-13, 15]) {
    ctx.fillStyle = offset < 0 ? "#936b43" : "#765032";
    ctx.fillRect(0, y + offset, WIDTH, 13);
    ctx.strokeRect(0, y + offset, WIDTH, 13);
  }
  if (selectedLane) {
    const target = CABIN_SECTORS[game?.selectedWindow ?? 2];
    const glow = settings.motion ? 0.55 + Math.sin((game?.elapsed ?? 0) * 6) * 0.12 : 0.58;
    ctx.strokeStyle = `rgba(244,199,94,${glow})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(target.x - 72, y - 39);
    ctx.lineTo(target.x + 72, y - 39);
    ctx.stroke();
    ctx.fillStyle = "#f4c75e";
    ctx.beginPath();
    ctx.arc(target.x, y - 43, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCabinShell() {
  const sky = ctx.createLinearGradient(0, 0, 0, 230);
  sky.addColorStop(0, "#8fbcb6");
  sky.addColorStop(1, "#dce7cc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, 230);

  ctx.fillStyle = "rgba(255,248,218,.82)";
  ctx.beginPath();
  ctx.arc(1080, 55, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#789c72";
  ctx.beginPath();
  ctx.moveTo(0, 134);
  ctx.quadraticCurveTo(155, 28, 334, 137);
  ctx.quadraticCurveTo(520, 52, 704, 139);
  ctx.quadraticCurveTo(935, 34, WIDTH, 139);
  ctx.lineTo(WIDTH, 218);
  ctx.lineTo(0, 218);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#52765f";
  for (let x = 15; x < WIDTH; x += 47) {
    const height = 35 + ((x * 17) % 42);
    ctx.beginPath();
    ctx.moveTo(x, 173);
    ctx.lineTo(x + 15, 173 - height);
    ctx.lineTo(x + 30, 173);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = "#9eb879";
  ctx.fillRect(0, 145, WIDTH, CABIN_FENCE_Y.upper - 145);
  const yard = ctx.createLinearGradient(0, 190, 0, CABIN_FENCE_Y.lower);
  yard.addColorStop(0, "#b7c987");
  yard.addColorStop(1, "#8eaf6f");
  ctx.fillStyle = yard;
  ctx.fillRect(0, CABIN_FENCE_Y.upper + 25, WIDTH, CABIN_FENCE_Y.lower - CABIN_FENCE_Y.upper - 48);
  ctx.fillStyle = "#779b60";
  ctx.fillRect(0, CABIN_FENCE_Y.lower + 20, WIDTH, HEIGHT - CABIN_FENCE_Y.lower - 20);

  // The rented cabin sits quietly behind Charlie's patrol route.
  ctx.save();
  ctx.translate(86, 232);
  ctx.fillStyle = "#714b31";
  roundedRect(0, 54, 250, 154, 7);
  ctx.fill();
  ctx.fillStyle = "#4d3428";
  ctx.beginPath();
  ctx.moveTo(-18, 70);
  ctx.lineTo(125, -5);
  ctx.lineTo(268, 70);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#a87345";
  for (let y = 72; y < 198; y += 24) ctx.fillRect(8, y, 234, 6);
  ctx.fillStyle = "#456b65";
  ctx.fillRect(36, 92, 58, 52);
  ctx.fillRect(164, 92, 58, 52);
  ctx.fillStyle = "#e7d6ae";
  ctx.fillRect(43, 99, 44, 38);
  ctx.fillRect(171, 99, 44, 38);
  ctx.fillStyle = "#3e3027";
  roundedRect(105, 106, 48, 102, 4);
  ctx.fill();
  label("CABIN", 129, 181, { size: 10, color: "#f5ecda", align: "center" });
  ctx.restore();

  // A stone path makes the two-fence commute readable.
  ctx.fillStyle = "rgba(239,226,190,.48)";
  for (let y = 350; y < 535; y += 38) {
    const width = 44 + (y - 350) * 0.25;
    roundedRect(630 - width / 2 + Math.sin(y) * 7, y, width, 22, 9);
    ctx.fill();
  }

  const zoneLeft = cabinCanvasX(game?.flock?.config?.settledZone?.min ?? 0.72);
  const zoneRight = cabinCanvasX(game?.flock?.config?.settledZone?.max ?? 0.93);
  ctx.fillStyle = "rgba(54,105,73,.46)";
  roundedRect(zoneLeft, 579, zoneRight - zoneLeft, 122, 22);
  ctx.fill();
  ctx.strokeStyle = "rgba(246,231,178,.88)";
  ctx.lineWidth = 3;
  ctx.setLineDash([9, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  label("SHADED GRAZING PATCH", (zoneLeft + zoneRight) / 2, 600, { size: 11, color: "#f8efd4", align: "center" });
  ctx.fillStyle = "rgba(244,199,94,.72)";
  for (let x = zoneLeft + 20; x < zoneRight - 10; x += 28) {
    ctx.fillRect(x, 676 - ((x * 7) % 18), 3, 17);
    ctx.beginPath();
    ctx.arc(x + 2, 674 - ((x * 7) % 18), 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCabinFence(CABIN_FENCE_Y.upper, game?.charlieLane === "upper");
  drawCabinFence(CABIN_FENCE_Y.lower, game?.charlieLane === "lower");
  label("UPPER FENCE · VISITORS", 28, 222, { size: 12, color: "rgba(36,41,39,.72)" });
  label("LOWER FENCE · SHEEP", 28, 596, { size: 12, color: "#f7eedc" });
}

function drawCabinVisitor(entity) {
  const sector = CABIN_SECTORS[entity.windowId];
  const y = 26 + entity.progress * 112;
  ctx.save();
  ctx.translate(sector.x, y);
  ctx.scale(0.78, 0.78);
  drawApproachArt(entity);
  ctx.restore();

  ctx.save();
  ctx.translate(sector.x, Math.min(150, y + 45));
  ctx.fillStyle = "rgba(255,250,240,.94)";
  ctx.strokeStyle = entity.friendly ? "#277c76" : "#b84d37";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (entity.friendly) ctx.arc(0, 0, 10, 0, Math.PI * 2);
  else {
    ctx.moveTo(0, -12);
    ctx.lineTo(12, 9);
    ctx.lineTo(-12, 9);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function sheepBob(sheep) {
  if (!settings.motion) return 0;
  const phase = [...sheep.id].reduce((sum, character) => sum + character.codePointAt(0), 0) * 0.13;
  return Math.sin((game?.elapsed ?? 0) * 2.2 + phase) * 2.2;
}

function drawCabinSheep(sheep, index) {
  const x = cabinCanvasX(sheep.x);
  const y = 638 + (index % 2) * 26 + sheepBob(sheep);
  const recentlyBarked = sheep.lastBarkedAt != null && (game?.elapsed ?? 0) - sheep.lastBarkedAt < 0.95;
  const scattering = sheep.scatterUntil != null && (game?.elapsed ?? 0) < sheep.scatterUntil;
  const compliant = sheep.stubborn && sheep.complianceUntil != null && (game?.elapsed ?? 0) < sheep.complianceUntil;
  const facing = sheep.x < (game?.flockStatus?.centroid ?? 0.5) ? 1 : -1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.fillStyle = "rgba(36,41,39,.2)";
  ctx.beginPath();
  ctx.ellipse(0, 31, 36, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4f493f";
  ctx.lineWidth = 4;
  for (const legX of [-20, 15]) {
    ctx.beginPath();
    ctx.moveTo(legX, 17);
    ctx.lineTo(legX + (scattering ? -5 : 0), 37);
    ctx.stroke();
  }
  ctx.fillStyle = sheep.stubborn ? "#efe0c1" : "#f7edd6";
  ctx.strokeStyle = sheep.stubborn ? "#6c4b37" : "#776b5c";
  ctx.lineWidth = 2.5;
  for (const [woolX, woolY, radius] of [[-24, 0, 22], [-7, -9, 25], [14, -6, 24], [27, 5, 20], [2, 10, 27]]) {
    ctx.beginPath();
    ctx.arc(woolX, woolY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = sheep.stubborn ? "#584334" : "#756650";
  ctx.beginPath();
  ctx.ellipse(42, 1, 18, 22, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(31, -15); ctx.lineTo(20, -27); ctx.lineTo(39, -20); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(49, -17); ctx.lineTo(61, -28); ctx.lineTo(57, -9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fffaf0";
  ctx.beginPath(); ctx.arc(48, -4, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#242927";
  ctx.beginPath(); ctx.arc(49.5, -4, 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#242927";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(55, 8);
  ctx.quadraticCurveTo(61, recentlyBarked && sheep.stubborn ? 6 : 12, 65, 8);
  ctx.stroke();
  const tagColors = { red: "#c64e3d", yellow: "#e6ad3c", green: "#3e8b6f", blue: "#467ea3", orange: "#d77c42", white: "#e8e2d5" };
  ctx.fillStyle = tagColors[sheep.earTag] ?? "#e6ad3c";
  roundedRect(54, -26, sheep.stubborn ? 13 : 10, sheep.stubborn ? 16 : 12, 3);
  ctx.fill();
  ctx.restore();

  if (recentlyBarked) {
    label(sheep.stubborn ? (compliant ? "FINE." : "?") : "…MUNCH", x, y - 43, {
      size: sheep.stubborn ? 13 : 11,
      color: sheep.stubborn ? "#703d38" : "#f7eedc",
      align: "center",
    });
  }
  if (scattering) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,250,240,.8)";
    ctx.lineWidth = 2;
    for (let line = 0; line < 3; line += 1) {
      ctx.beginPath();
      ctx.moveTo(x - 48 - line * 8, y - 4 + line * 9);
      ctx.lineTo(x - 65 - line * 8, y - 4 + line * 9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCabinFlock() {
  if (!game?.flock) return;
  game.flock.sheep.forEach(drawCabinSheep);
  if (game.charlieLane === "lower") {
    const radius = game.superUntil > game.elapsed ? 185 : 130;
    ctx.save();
    const pressure = ctx.createRadialGradient(game.charlieX, CABIN_FENCE_Y.lower + 12, 15, game.charlieX, CABIN_FENCE_Y.lower + 12, radius);
    pressure.addColorStop(0, "rgba(230,173,60,.24)");
    pressure.addColorStop(1, "rgba(230,173,60,0)");
    ctx.fillStyle = pressure;
    ctx.beginPath();
    ctx.arc(game.charlieX, CABIN_FENCE_Y.lower + 12, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCabinStatus() {
  if (!game?.flockStatus) return;
  const status = game.flockStatus;
  ctx.save();
  const selectedX = CABIN_SECTORS[game.selectedWindow]?.x ?? WIDTH / 2;
  const x = clamp(selectedX - 107, 24, WIDTH - 238);
  const y = 222;
  label("FLOCK REPORT", x, y, { size: 11, color: "rgba(36,41,39,.68)" });
  for (let index = 0; index < status.maxSettleMarks; index += 1) {
    ctx.fillStyle = index < status.settleMarks ? "#e6ad3c" : "rgba(255,250,240,.56)";
    ctx.strokeStyle = "rgba(64,59,48,.62)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 18 + index * 30, y + 20, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  label(`${status.settledCount}/${status.total} in patch`, x + 118, y + 25, { size: 12, color: "#39413e" });
  if (status.settleProgress > 0) {
    ctx.fillStyle = "rgba(255,250,240,.55)";
    roundedRect(x, y + 39, 214, 8, 4);
    ctx.fill();
    ctx.fillStyle = "#e6ad3c";
    roundedRect(x, y + 39, 214 * status.settleProgress, 8, 4);
    ctx.fill();
  }
  const otherVisitors = game.entities.filter((entity) => entity.windowId !== game.selectedWindow);
  const leftThreats = otherVisitors.filter((entity) => entity.windowId < game.selectedWindow && !entity.friendly).length;
  const rightThreats = otherVisitors.filter((entity) => entity.windowId > game.selectedWindow && !entity.friendly).length;
  if (leftThreats || rightThreats) {
    const compassY = y + 66;
    if (leftThreats) label(`◀ ${leftThreats} upper-fence alert${leftThreats === 1 ? "" : "s"}`, x, compassY, { size: 11, color: "#8d3f32" });
    if (rightThreats) label(`${rightThreats} upper-fence alert${rightThreats === 1 ? "" : "s"} ▶`, x + 214, compassY, { size: 11, color: "#8d3f32", align: "right" });
  }
  const zoneLeft = cabinCanvasX(game.flock.config.settledZone.min);
  const zoneRight = cabinCanvasX(game.flock.config.settledZone.max);
  if (selectedX < zoneLeft - 80) {
    label("SHADED PATCH ▶", x + 214, y + 47, { size: 10, color: "#2f6e57", align: "right" });
  } else if (selectedX > zoneRight + 80) {
    label("◀ SHADED PATCH", x, y + 47, { size: 10, color: "#2f6e57" });
  }
  ctx.restore();
}

function drawWindow(windowItem, selected) {
  const x = windowItem.x - windowItem.width / 2;
  const y = 124;
  ctx.save();
  if (selected) {
    ctx.shadowColor = "rgba(230, 173, 60, .9)";
    ctx.shadowBlur = 20;
    ctx.fillStyle = "#e6ad3c";
    roundedRect(x - 7, y - 7, windowItem.width + 14, 116, 8);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f7eedc";
  ctx.strokeStyle = "#3d4642";
  ctx.lineWidth = 5;
  roundedRect(x, y, windowItem.width, 102, 5);
  ctx.fill();
  ctx.stroke();
  const pane = ctx.createLinearGradient(0, y, 0, y + 95);
  pane.addColorStop(0, "#bcdad9");
  pane.addColorStop(1, "#dfede5");
  ctx.fillStyle = pane;
  ctx.fillRect(x + 8, y + 8, windowItem.width - 16, 86);
  ctx.strokeStyle = "rgba(36,41,39,.48)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(windowItem.x, y + 8);
  ctx.lineTo(windowItem.x, y + 94);
  ctx.stroke();
  ctx.restore();
}

function drawOffice() {
  ctx.save();
  ctx.fillStyle = "#8b6648";
  roundedRect(62, 306, 248, 66, 8);
  ctx.fill();
  ctx.fillStyle = "#594538";
  ctx.fillRect(76, 370, 14, 98);
  ctx.fillRect(280, 370, 14, 98);
  ctx.fillStyle = "#263b3c";
  roundedRect(126, 251, 124, 72, 8);
  ctx.fill();
  const onCall = game?.rooms[0].environment === "video-call";
  ctx.fillStyle = onCall ? "#d9886d" : "#86b5b1";
  ctx.fillRect(136, 260, 104, 52);
  if (onCall) label("VIDEO CALL", 188, 292, { size: 11, color: "#fffaf0", align: "center" });
  ctx.fillStyle = "#263b3c";
  ctx.fillRect(181, 322, 14, 28);
  ctx.fillStyle = "#d66f4a";
  roundedRect(235, 283, 25, 36, 4);
  ctx.fill();
  label("WORK ZONE", 74, 500, { size: 14, color: "rgba(36,41,39,.52)" });
  if (hasReward("decor-office-certificate")) {
    ctx.fillStyle = "#e6ad3c";
    roundedRect(274, 420, 72, 54, 5);
    ctx.fill();
    ctx.fillStyle = "#fffaf0";
    ctx.fillRect(281, 427, 58, 40);
    label("TOP DOG", 310, 451, { size: 9, color: "#703d38", align: "center" });
  }
  ctx.restore();
}

function drawLivingRoom() {
  ctx.save();
  ctx.fillStyle = "#263b3c";
  roundedRect(830, 296, 44, 170, 7);
  ctx.fill();
  ctx.fillStyle = "#182426";
  roundedRect(795, 302, 70, 115, 5);
  ctx.fill();
  ctx.fillStyle = "#80aaa7";
  ctx.fillRect(803, 310, 54, 86);
  const tvActive = game?.rooms[1].environment === "tv";
  label(tvActive ? (game.rooms[1].cover.charges > 0 ? "COVER!" : "TV LOUD") : "TV", 830, 370, { size: tvActive ? 12 : 17, color: "#f7eedc", align: "center" });

  ctx.fillStyle = "#2f7772";
  roundedRect(472, 544, 260, 90, 22);
  ctx.fill();
  ctx.fillStyle = "#205956";
  roundedRect(450, 570, 32, 78, 12);
  ctx.fill();
  roundedRect(722, 570, 32, 78, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(255,250,240,.18)";
  roundedRect(491, 555, 104, 51, 15);
  ctx.fill();
  roundedRect(610, 555, 103, 51, 15);
  ctx.fill();

  ctx.fillStyle = "#a47b4d";
  roundedRect(587, 438, 106, 51, 14);
  ctx.fill();
  ctx.fillStyle = "#f1e5c9";
  roundedRect(603, 446, 74, 34, 10);
  ctx.fill();
  label("LOOKOUT SOFA", 602, 676, { size: 14, color: "rgba(36,41,39,.5)", align: "center" });
  if (hasReward("decor-living-trophy")) {
    ctx.fillStyle = "#e6ad3c";
    ctx.beginPath();
    ctx.arc(780, 545, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(773, 558, 14, 27);
    ctx.fillRect(760, 583, 40, 8);
    label("C", 780, 551, { size: 13, color: "#703d38", align: "center" });
  }
  ctx.restore();
}

function drawKitchen() {
  ctx.save();
  ctx.fillStyle = "#e9e1cf";
  roundedRect(940, 290, 285, 86, 8);
  ctx.fill();
  ctx.fillStyle = "#7d9a8b";
  for (let x = 952; x < 1210; x += 66) {
    roundedRect(x, 307, 54, 55, 4);
    ctx.fill();
  }
  ctx.fillStyle = "#ad895c";
  ctx.fillRect(933, 280, 300, 19);
  ctx.fillStyle = "#c8d6cf";
  roundedRect(1148, 401, 86, 178, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(36,41,39,.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#94aaa1";
  ctx.fillRect(1154, 482, 74, 4);
  const magnets = [
    ["HR", "#d66f4a"], ["LT", "#277c76"], ["RO", "#e6ad3c"], ["DK", "#7f6a9b"],
  ];
  magnets.forEach(([text, color], index) => {
    const x = 1160 + (index % 2) * 34;
    const y = 426 + Math.floor(index / 2) * 32;
    ctx.fillStyle = color;
    roundedRect(x, y, 27, 22, 5);
    ctx.fill();
    label(text, x + 13.5, y + 15, { size: 10, color: "#fffaf0", align: "center" });
  });
  label("ROAD-TRIP MAGNETS", 1189, 604, { size: 11, color: "rgba(36,41,39,.5)", align: "center" });
  const kettleActive = game?.rooms[2].environment === "kettle";
  ctx.fillStyle = kettleActive ? "#d66f4a" : "#8b6648";
  roundedRect(972, 250, 48, 31, 12);
  ctx.fill();
  label(kettleActive ? "HISS" : "KETTLE", 996, 271, { size: 8, color: "#fffaf0", align: "center" });
  if (hasReward("decor-chicken-magnet")) {
    ctx.fillStyle = "#e6ad3c";
    roundedRect(1195, 522, 26, 34, 5);
    ctx.fill();
    label("🍗", 1208, 546, { size: 17, align: "center" });
  }
  ctx.restore();
}

function drawRoomShell() {
  ctx.fillStyle = "#f5ecda";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const daylight = ctx.createLinearGradient(0, 0, 0, 165);
  daylight.addColorStop(0, "#7eaaa2");
  daylight.addColorStop(1, "#c6d9c7");
  ctx.fillStyle = daylight;
  ctx.fillRect(0, 0, WIDTH, 165);
  ctx.fillStyle = "rgba(255,250,240,.5)";
  ctx.beginPath();
  ctx.arc(1070, 44, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(36,41,39,.13)";
  ctx.fillRect(0, 96, WIDTH, 8);
  ctx.setLineDash([18, 16]);
  ctx.strokeStyle = "rgba(255,250,240,.7)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 70);
  ctx.lineTo(WIDTH, 70);
  ctx.stroke();
  ctx.setLineDash([]);

  ROOMS.forEach((room) => {
    ctx.fillStyle = room.floor;
    ctx.fillRect(room.left, 165, room.right - room.left, 535);
    ctx.fillStyle = "rgba(255,255,255,.08)";
    for (let y = 230; y < 700; y += 54) ctx.fillRect(room.left, y, room.right - room.left, 2);
  });
  ctx.fillStyle = "#f5ecda";
  ctx.fillRect(0, 105, WIDTH, 26);
  ctx.fillRect(0, 226, WIDTH, 17);
  ctx.fillStyle = "#39413e";
  ctx.fillRect(0, 105, WIDTH, 5);
  ctx.fillRect(0, 238, WIDTH, 5);
  for (const x of [370, 902]) {
    ctx.fillStyle = "#f5ecda";
    ctx.fillRect(x, 105, 10, 390);
    ctx.fillRect(x, 598, 10, 122);
    ctx.fillStyle = "rgba(36,41,39,.25)";
    ctx.fillRect(x + 7, 105, 3, 390);
    ctx.fillRect(x + 7, 598, 3, 122);
  }

  WINDOWS.forEach((windowItem) => drawWindow(windowItem, game?.selectedWindow === windowItem.id && screen === "playing"));
  drawOffice();
  drawLivingRoom();
  drawKitchen();

  ROOMS.forEach((room, index) => {
    ctx.fillStyle = index === game?.selectedRoom ? "#242927" : "rgba(36,41,39,.62)";
    roundedRect(room.left + 14, 253, 116, 31, 8);
    ctx.fill();
    label(room.name.toUpperCase(), room.left + 72, 274, { size: 12, color: "#fffaf0", align: "center" });
  });
}

function drawApproachArt(entity) {
  const outline = entity.friendly ? "#16524f" : "#7a382c";
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = outline;

  switch (entity.key) {
    case "squirrel": {
      ctx.fillStyle = "#b56a43";
      ctx.beginPath();
      ctx.arc(-16, 8, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f0bf81";
      ctx.beginPath();
      ctx.arc(-16, 8, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ad603e";
      ctx.beginPath();
      ctx.ellipse(4, 13, 17, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(17, 1, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(11, -7); ctx.lineTo(13, -18); ctx.lineTo(19, -8); ctx.closePath();
      ctx.moveTo(19, -8); ctx.lineTo(25, -17); ctx.lineTo(25, -5); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = outline;
      ctx.beginPath();
      ctx.arc(21, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "pigeon": {
      ctx.fillStyle = "#8d7da2";
      ctx.beginPath();
      ctx.ellipse(0, 12, 21, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#b7bfd1";
      ctx.beginPath();
      ctx.ellipse(-7, 11, 12, 8, -0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#71849b";
      ctx.beginPath();
      ctx.arc(10, -3, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e6ad3c";
      ctx.beginPath();
      ctx.moveTo(19, -3); ctx.lineTo(29, 0); ctx.lineTo(19, 3); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#b85f4a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, 27); ctx.lineTo(-4, 34);
      ctx.moveTo(7, 27); ctx.lineTo(9, 34);
      ctx.stroke();
      break;
    }
    case "robot": {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, -20); ctx.lineTo(0, -11);
      ctx.stroke();
      ctx.fillStyle = "#e6ad3c";
      ctx.beginPath();
      ctx.arc(0, -23, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#4f8090";
      roundedRect(-22, -9, 44, 36, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#dce7de";
      roundedRect(-15, -3, 30, 13, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d66f4a";
      ctx.beginPath();
      ctx.arc(-7, 3, 2.6, 0, Math.PI * 2);
      ctx.arc(7, 3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-13, 27); ctx.lineTo(-15, 35);
      ctx.moveTo(13, 27); ctx.lineTo(15, 35);
      ctx.stroke();
      break;
    }
    case "pirate": {
      ctx.fillStyle = "#513a4a";
      ctx.beginPath();
      ctx.arc(0, -5, 15, Math.PI, 0);
      ctx.lineTo(16, 28); ctx.lineTo(-16, 28); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e7bd8b";
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = outline;
      ctx.fillRect(-10, -3, 8, 4);
      ctx.strokeStyle = "#f5ecda";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, 7); ctx.lineTo(12, 7);
      ctx.stroke();
      ctx.fillStyle = "#b87a45";
      roundedRect(10, 15, 22, 18, 3);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(21, 15); ctx.lineTo(21, 33);
      ctx.stroke();
      break;
    }
    case "leaves": {
      const leaf = (x, y, angle, color) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(36,41,39,.48)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(0, 12);
        ctx.stroke();
        ctx.restore();
      };
      leaf(-13, 0, -0.72, "#bd8640");
      leaf(2, -8, 0.18, "#d6a34f");
      leaf(14, 4, 0.83, "#a86935");
      leaf(-3, 13, 0.15, "#7e9a4b");
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 3, 24, 0.2, Math.PI + 0.3);
      ctx.stroke();
      break;
    }
    case "coat": {
      ctx.fillStyle = "#4e4b62";
      ctx.beginPath();
      ctx.arc(0, -7, 14, Math.PI, 0);
      ctx.lineTo(19, 31); ctx.lineTo(-19, 31); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#353445";
      ctx.beginPath();
      ctx.moveTo(-9, -4); ctx.lineTo(0, 8); ctx.lineTo(9, -4); ctx.lineTo(5, 26); ctx.lineTo(-5, 26); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e6ad3c";
      ctx.beginPath();
      ctx.arc(0, 11, 2.4, 0, Math.PI * 2);
      ctx.arc(0, 20, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8b8a9b";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, 0); ctx.lineTo(-26, 18);
      ctx.moveTo(14, 0); ctx.lineTo(26, 18);
      ctx.stroke();
      break;
    }
    case "neighbour": {
      ctx.fillStyle = "#d68c68";
      ctx.beginPath();
      ctx.arc(-4, -4, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#4e3b35";
      ctx.beginPath();
      ctx.arc(-4, -9, 12, Math.PI, 0);
      ctx.lineTo(8, -3); ctx.lineTo(-16, -3); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#68a19b";
      roundedRect(-18, 8, 28, 23, 7);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(7, 11); ctx.lineTo(22, -2); ctx.lineTo(29, 4);
      ctx.stroke();
      ctx.fillStyle = "#d68c68";
      ctx.beginPath();
      ctx.arc(30, 5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "walker": {
      ctx.fillStyle = "#6c9b9b";
      roundedRect(-13, 3, 24, 29, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d49a72";
      ctx.beginPath();
      ctx.arc(-1, -7, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#7d4f44";
      ctx.beginPath();
      ctx.arc(-1, -11, 10, Math.PI, 0);
      ctx.lineTo(9, -7); ctx.lineTo(-11, -7); ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#d66f4a";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(9, 13); ctx.quadraticCurveTo(20, 21, 26, 31);
      ctx.stroke();
      ctx.fillStyle = "#a76b43";
      ctx.beginPath();
      ctx.ellipse(29, 31, 9, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(34, 29); ctx.lineTo(40, 24);
      ctx.stroke();
      break;
    }
    case "postie": {
      ctx.fillStyle = "#e0a179";
      ctx.beginPath();
      ctx.arc(-4, -6, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#416d8c";
      roundedRect(-15, -18, 23, 8, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-7, -23, 11, 6);
      ctx.fillStyle = "#547f9e";
      roundedRect(-17, 5, 27, 28, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fffaf0";
      roundedRect(-11, 12, 15, 10, 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-11, 12); ctx.lineTo(-3.5, 18); ctx.lineTo(4, 12);
      ctx.stroke();
      ctx.fillStyle = "#b87a45";
      roundedRect(11, 16, 19, 15, 3);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "cleaner": {
      ctx.fillStyle = "#d89f78";
      ctx.beginPath();
      ctx.arc(-7, -8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#6b9eb0";
      roundedRect(-18, 3, 24, 29, 7);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#5f7890";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(7, 7); ctx.lineTo(28, -17);
      ctx.stroke();
      ctx.fillStyle = "#e5e9dc";
      roundedRect(21, -24, 15, 10, 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = "#5f7890";
      roundedRect(11, 23, 17, 12, 3);
      ctx.fill();
      ctx.stroke();
      break;
    }
    default: {
      ctx.fillStyle = entity.friendly ? "#f5ecda" : "#fff3dd";
      ctx.beginPath();
      ctx.arc(0, 11, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      label(entity.icon, 0, 18, { size: entity.icon.length > 1 ? 12 : 21, color: entity.color, align: "center" });
    }
  }

  ctx.restore();
}

function drawVisitor(entity) {
  const windowItem = WINDOWS[entity.windowId];
  const y = 18 + entity.progress * 92;
  const urgency = clamp(entity.progress, 0, 1);
  ctx.save();
  ctx.translate(windowItem.x, y);
  const pulse = settings.motion ? 1 + Math.sin(performance.now() / 120 + entity.id) * 0.03 : 1;
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "rgba(36,41,39,.16)";
  ctx.beginPath();
  ctx.ellipse(0, 50, 30, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  drawApproachArt(entity);

  const decluttered = isDeclutteredRendering();
  if (!decluttered) {
    ctx.font = '800 12px "Avenir Next", "Segoe UI", sans-serif';
    const pillWidth = clamp(ctx.measureText(entity.label).width + 20, 94, 150);
    ctx.fillStyle = "rgba(36,41,39,.92)";
    roundedRect(-pillWidth / 2, 42, pillWidth, 25, 10);
    ctx.fill();
    label(entity.label, 0, 59, { size: 11, color: "#fffaf0", align: "center", maxWidth: pillWidth - 12 });
  } else {
    ctx.fillStyle = "rgba(255,250,240,.88)";
    ctx.strokeStyle = entity.friendly ? "#277c76" : "#b84d37";
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (entity.friendly) {
      ctx.arc(0, 49, 8, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, 39);
      ctx.lineTo(10, 56);
      ctx.lineTo(-10, 56);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();
  }
  if (!entity.friendly) {
    for (let pip = 0; pip < entity.maxHp; pip += 1) {
      ctx.fillStyle = pip < entity.hp ? "#d66f4a" : "rgba(255,250,240,.35)";
      ctx.beginPath();
      ctx.arc((pip - (entity.maxHp - 1) / 2) * 13, decluttered ? 68 : 75, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  if (urgency > 0.7) {
    ctx.save();
    ctx.strokeStyle = `rgba(184,77,55,${(urgency - 0.7) * 2.8})`;
    ctx.lineWidth = 5;
    roundedRect(windowItem.x - windowItem.width / 2 - 9, 116, windowItem.width + 18, 119, 10);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFallbackDog(x, y, facing, barking) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.fillStyle = "#bd7d3a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 62, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a302a";
  ctx.beginPath();
  ctx.ellipse(-8, -11, 43, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#bd7d3a";
  ctx.beginPath();
  ctx.arc(52, -23, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#242927";
  ctx.beginPath();
  ctx.moveTo(40, -45); ctx.lineTo(49, -79); ctx.lineTo(61, -44); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(58, -46); ctx.lineTo(72, -76); ctx.lineTo(76, -38); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fff4de";
  ctx.beginPath(); ctx.ellipse(47, 1, 16, 21, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#242927";
  ctx.beginPath(); ctx.arc(73, -22, barking ? 8 : 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawCharlie() {
  if (!game) return;
  const barking = game.barkUntil > game.elapsed;
  const superMode = game.superUntil > game.elapsed;
  const chickenReady = isImmersiveMode() && game.chicken >= game.chickenGoal;
  const sneakyReady = Boolean(game.sneaky && !isCabinRun()
    && game.sneaky.until > game.elapsed
    && game.sneaky.room === game.selectedRoom);
  canvasWrap.dataset.sneaky = sneakyReady ? "ready" : "idle";
  const pose = resolvePetPose();
  game.petPose = pose;
  canvasWrap.dataset.petAnimation = pose.state;
  canvasWrap.dataset.petFrame = `${pose.row}:${pose.column}`;
  canvasWrap.dataset.petSource = pose.source;
  const x = game.charlieX;
  const groundY = isCabinRun() ? game.charlieY : 586;
  const spriteWidth = isCabinRun() ? 150 : 184;
  const spriteHeight = spriteWidth * (PET_CELL_HEIGHT / PET_CELL_WIDTH);
  const y = groundY - spriteHeight / 2;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#242927";
  ctx.beginPath();
  ctx.ellipse(x, groundY - 6, isCabinRun() ? 54 : 66, isCabinRun() ? 12 : 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (sneakyReady) {
    ctx.save();
    const glow = 74 + (settings.motion ? Math.sin(game.elapsed * 7) * 6 : 0);
    const radial = ctx.createRadialGradient(x, y, 12, x, y, glow);
    radial.addColorStop(0, "rgba(39,124,118,.4)");
    radial.addColorStop(1, "rgba(39,124,118,0)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#277c76";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(x, groundY - 72, 70, -Math.PI * 0.9, Math.PI * 0.25);
    ctx.stroke();
    ctx.restore();
  }

  if (superMode || chickenReady) {
    ctx.save();
    const glow = (superMode ? 85 : 68) + (settings.motion ? Math.sin(game.elapsed * 8) * 8 : 0);
    const radial = ctx.createRadialGradient(x, y, 10, x, y, glow);
    radial.addColorStop(0, `rgba(230,173,60,${superMode ? 0.48 : 0.34})`);
    radial.addColorStop(1, "rgba(230,173,60,0)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(x, y, glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (chickenReady) {
    ctx.save();
    ctx.translate(x + 70, groundY - 115);
    ctx.rotate(-0.35);
    ctx.fillStyle = "#e6ad3c";
    ctx.strokeStyle = "#703d38";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 19, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#fffaf0";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(15, 5);
    ctx.lineTo(30, 13);
    ctx.stroke();
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.arc(32, 9, 5, 0, Math.PI * 2);
    ctx.arc(29, 16, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (dogReady) {
    const barkProgress = settings.motion && barking
      ? clamp((game.barkUntil - game.elapsed) / 0.2, 0, 1)
      : 0;
    const barkPunch = Math.sin(barkProgress * Math.PI);
    ctx.save();
    ctx.translate(x, groundY);
    ctx.scale(1 + barkPunch * 0.055, 1 - barkPunch * 0.035);
    ctx.drawImage(
      dogImage,
      pose.column * PET_CELL_WIDTH,
      pose.row * PET_CELL_HEIGHT,
      PET_CELL_WIDTH,
      PET_CELL_HEIGHT,
      -spriteWidth / 2,
      -spriteHeight,
      spriteWidth,
      spriteHeight,
    );
    ctx.restore();
  } else {
    drawFallbackDog(x, y, game.facing, barking);
  }

  const windowItem = currentTarget();
  const aimY = isCabinRun()
    ? game.charlieLane === "upper" ? CABIN_FENCE_Y.upper + 16 : CABIN_FENCE_Y.lower + 48
    : 237;
  ctx.save();
  ctx.strokeStyle = superMode ? "#e6ad3c" : "rgba(36,41,39,.45)";
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(x, groundY - (isCabinRun() ? 104 : 132));
  ctx.lineTo(windowItem.x, aimY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = superMode ? "#e6ad3c" : "#242927";
  ctx.beginPath();
  ctx.arc(windowItem.x, aimY, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawResultPet() {
  const resultCtx = ui.resultPet?.getContext("2d");
  if (!resultCtx) return;
  resultCtx.clearRect(0, 0, PET_CELL_WIDTH, PET_CELL_HEIGHT);
  if (!dogReady || screen !== "result" || !game) return;
  const state = game.resultSuccess ? "waving" : "failed";
  const frame = getPetAnimationFrame(
    state,
    performance.now() / 1000,
    resultAnimationStartedAt,
    { loop: true, reducedMotion: !settings.motion },
  );
  ui.resultPet.dataset.petAnimation = state;
  ui.resultPet.dataset.petFrame = `${frame.row}:${frame.column}`;
  resultCtx.drawImage(
    dogImage,
    frame.column * PET_CELL_WIDTH,
    frame.row * PET_CELL_HEIGHT,
    PET_CELL_WIDTH,
    PET_CELL_HEIGHT,
    0,
    0,
    PET_CELL_WIDTH,
    PET_CELL_HEIGHT,
  );
}

function drawEffects() {
  if (!game) return;
  const decluttered = isDeclutteredRendering();
  for (const effect of game.effects) {
    const t = 1 - effect.life / effect.maxLife;
    ctx.save();
    ctx.globalAlpha = clamp(effect.life / Math.min(0.32, effect.maxLife), 0, 1);
    if (decluttered) {
      ctx.strokeStyle = effect.kind === "woof" ? "#d66f4a" : effect.color;
      ctx.lineWidth = Math.max(2, 5 - t * 2);
      const radius = 22 + t * (effect.kind === "woof" ? 62 : 34);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, effect.kind === "woof" ? -1.15 : 0, effect.kind === "woof" ? 0.15 : Math.PI * 2);
      ctx.stroke();
      if (["burst", "chicken", "alert"].includes(effect.kind)) {
        for (let ray = 0; ray < 6; ray += 1) {
          const angle = Math.PI * 2 * ray / 6;
          ctx.beginPath();
          ctx.moveTo(effect.x + Math.cos(angle) * (radius + 6), effect.y + Math.sin(angle) * (radius * 0.55));
          ctx.lineTo(effect.x + Math.cos(angle) * (radius + 18), effect.y + Math.sin(angle) * (radius * 0.7));
          ctx.stroke();
        }
      }
      ctx.restore();
      continue;
    }
    if (effect.kind === "woof") {
      ctx.strokeStyle = "#d66f4a";
      ctx.lineWidth = 5 - t * 2;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, 24 + t * 60, -1.1, 0.1);
      ctx.stroke();
      label(effect.text, effect.x + 38, effect.y - 28 - t * 24, { size: 25, color: "#a7442f", align: "center" });
    } else {
      const y = effect.y - t * 42;
      ctx.fillStyle = effect.color;
      roundedRect(effect.x - 66, y - 19, 132, 38, 12);
      ctx.fill();
      const effectTextColor = effect.color.toLowerCase() === "#e6ad3c" ? "#242927" : "#fffaf0";
      label(effect.text, effect.x, y + 7, { size: 15, color: effectTextColor, align: "center", maxWidth: 120 });
      if (effect.kind === "burst" || effect.kind === "chicken") {
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i += 1) {
          const angle = (Math.PI * 2 * i) / 8;
          ctx.beginPath();
          ctx.moveTo(effect.x + Math.cos(angle) * 72, y + Math.sin(angle) * 33);
          ctx.lineTo(effect.x + Math.cos(angle) * (86 + t * 22), y + Math.sin(angle) * (44 + t * 12));
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}

function drawLegend() {
  if (isDeclutteredRendering()) return;
  ctx.save();
  ctx.translate(0, 615);
  ctx.fillStyle = "rgba(255,250,240,.94)";
  roundedRect(22, 17, 226, 65, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(36,41,39,.23)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff3dd";
  ctx.strokeStyle = "#8d3f32";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(49, 30); ctx.lineTo(61, 51); ctx.lineTo(37, 51); ctx.closePath(); ctx.fill(); ctx.stroke();
  label("Suspicious · bark", 72, 47, { size: 13 });
  ctx.fillStyle = "#f5ecda";
  ctx.strokeStyle = "#277c76";
  ctx.beginPath(); ctx.arc(49, 66, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  label("Friendly · let pass", 72, 71, { size: 13 });
  ctx.restore();
}

function drawListeningState() {
  const active = game?.listening.active;
  if (!active) return;
  const room = ROOMS[active.roomId];
  const quietProgress = clamp((game.elapsed - active.quietSince) / DEFAULT_ACOUSTICS.quietSeconds, 0, 1);
  if (isDeclutteredRendering()) {
    ctx.save();
    const pulse = settings.motion ? 0.45 + Math.sin(game.elapsed * 7) * 0.16 : 0.48;
    ctx.strokeStyle = `rgba(167,68,47,${pulse})`;
    ctx.lineWidth = 5;
    roundedRect(room.left + 5, 108, room.right - room.left - 10, 488, 12);
    ctx.stroke();
    ctx.fillStyle = "rgba(36,41,39,.2)";
    roundedRect(room.left + 24, 246, room.right - room.left - 48, 6, 3);
    ctx.fill();
    ctx.fillStyle = "#f4c75e";
    roundedRect(room.left + 24, 246, (room.right - room.left - 48) * quietProgress, 6, 3);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.fillStyle = "rgba(112,61,56,.94)";
  roundedRect(room.centre - 82, 288, 164, 48, 14);
  ctx.fill();
  label("OWNER LISTENING", room.centre, 307, { size: 11, color: "#fffaf0", align: "center" });
  ctx.fillStyle = "rgba(255,250,240,.24)";
  roundedRect(room.centre - 64, 316, 128, 7, 4);
  ctx.fill();
  ctx.fillStyle = "#f4c75e";
  roundedRect(room.centre - 64, 316, 128 * quietProgress, 7, 4);
  ctx.fill();
  ctx.restore();
}

function drawBossState() {
  const boss = game?.entities.find((entity) => entity.boss);
  if (!boss) return;
  if (isDeclutteredRendering()) return;
  const width = 380;
  const x = WIDTH / 2 - width / 2;
  ctx.save();
  ctx.fillStyle = "rgba(36,41,39,.94)";
  roundedRect(x, 8, width, 54, 14);
  ctx.fill();
  label("THE MYSTERY COAT", WIDTH / 2, 29, { size: 13, color: "#fffaf0", align: "center" });
  ctx.fillStyle = "rgba(255,250,240,.18)";
  roundedRect(x + 20, 39, width - 40, 9, 5);
  ctx.fill();
  ctx.fillStyle = "#d66f4a";
  roundedRect(x + 20, 39, (width - 40) * (boss.hp / boss.maxHp), 9, 5);
  ctx.fill();
  ctx.restore();
}

function render() {
  ctx.save();
  const shakeX = game?.shake > 0 && settings.motion ? (Math.random() - 0.5) * 10 : 0;
  const shakeY = game?.shake > 0 && settings.motion ? (Math.random() - 0.5) * 6 : 0;
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-12, -12, WIDTH + 24, HEIGHT + 24);
  if (isCabinRun()) drawCabinShell();
  else drawRoomShell();
  if (game) {
    if (isCabinRun()) {
      game.entities.forEach(drawCabinVisitor);
      drawCabinFlock();
    } else {
      game.entities.forEach(drawVisitor);
    }
    drawCharlie();
    drawEffects();
    if (isCabinRun()) drawCabinStatus();
    else {
      drawListeningState();
      drawBossState();
    }
    if (game.superUntil > game.elapsed && !isDeclutteredRendering()) {
      const remaining = Math.max(0, game.superUntil - game.elapsed).toFixed(1);
      ctx.fillStyle = "rgba(36,41,39,.9)";
      roundedRect(1030, 644, 224, 48, 14);
      ctx.fill();
      label(`CHICKEN FOCUS  ${remaining}s`, 1142, 675, { size: 15, color: "#f4c75e", align: "center" });
    }
  }
  if (!isCabinRun()) drawLegend();
  ctx.restore();
  drawResultPet();
}

function cameraFactorForWindow(windowId = game?.selectedWindow ?? 2) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return 0.5;
  const scale = Math.max(rect.width / WIDTH, rect.height / HEIGHT);
  const horizontalOverflow = WIDTH * scale - rect.width;
  if (horizontalOverflow <= 1) return 0.5;
  return clamp((WINDOWS[windowId].x * scale - rect.width / 2) / horizontalOverflow, 0, 1);
}

function setCanvasCameraFactor(factor) {
  const next = clamp(Number(factor) || 0, 0, 1);
  canvasWrap.dataset.cameraFactor = next.toFixed(5);
  canvasWrap.style.setProperty("--camera-x", `${(next * 100).toFixed(3)}%`);
}

function renderedCanvasCameraFactor() {
  const [horizontalPosition = ""] = getComputedStyle(canvas).objectPosition.split(/\s+/);
  const renderedPercent = Number.parseFloat(horizontalPosition);
  if (horizontalPosition.endsWith("%") && Number.isFinite(renderedPercent)) {
    return clamp(renderedPercent / 100, 0, 1);
  }
  const requestedFactor = Number.parseFloat(canvasWrap.dataset.cameraFactor);
  return Number.isFinite(requestedFactor) ? clamp(requestedFactor, 0, 1) : 0.5;
}

function syncCanvasCamera() {
  if ((!isImmersiveMode() && !isCabinRun()) || !game) {
    canvasWrap.style.removeProperty("--camera-x");
    delete canvasWrap.dataset.cameraFactor;
    return;
  }
  if (activeDragPointer !== null) return;
  setCanvasCameraFactor(cameraFactorForWindow(game.selectedWindow));
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const objectFit = getComputedStyle(canvas).objectFit;
  const scale = objectFit === "cover"
    ? Math.max(rect.width / WIDTH, rect.height / HEIGHT)
    : Math.min(rect.width / WIDTH, rect.height / HEIGHT);
  const visibleWidth = WIDTH * scale;
  const visibleHeight = HEIGHT * scale;
  const immersiveCamera = renderedCanvasCameraFactor();
  const roomPosition = objectFit === "cover"
    ? isCabinRun() ? immersiveCamera : isImmersiveMode() ? immersiveCamera : [0, 0.5, 1][game?.selectedRoom ?? 1]
    : 0.5;
  const offsetX = (rect.width - visibleWidth) * roomPosition;
  const offsetY = (rect.height - visibleHeight) / 2;
  return {
    x: (event.clientX - rect.left - offsetX) / scale,
    y: (event.clientY - rect.top - offsetY) / scale,
  };
}

function nearestWindowAtPoint(point) {
  if (!isCabinRun() && point.y > 285) return null;
  const targets = activeSectors();
  const nearest = targets.reduce(
    (best, item) => Math.abs(item.x - point.x) < Math.abs(best.x - point.x) ? item : best,
    targets[0],
  );
  return isCabinRun() || Math.abs(nearest.x - point.x) <= nearest.width * 0.78 ? nearest : null;
}

function handleCanvasSelection(event) {
  if (screen !== "playing" || !game) return;
  const point = canvasPoint(event);
  if (isCabinRun()) {
    const lane = point.y < HEIGHT * 0.5 ? "upper" : "lower";
    switchFence(lane);
    const target = nearestWindowAtPoint(point);
    if (target) selectWindow(target.id, false);
    return;
  }
  const targetWindow = nearestWindowAtPoint(point);
  if (targetWindow) {
    selectWindow(targetWindow.id);
    return;
  }
  const room = ROOMS.findIndex((item) => point.x >= item.left && point.x <= item.right);
  if (room >= 0) setRoom(room);
}

function handleImmersiveTap(event) {
  if (screen !== "playing" || !game) return;
  const point = canvasPoint(event);
  const chickenReady = game.chicken >= game.chickenGoal;
  const tappedCharlie = point.y >= 370 && point.y <= 650 && Math.abs(point.x - game.charlieX) <= 105;
  if (chickenReady && tappedCharlie) {
    useChicken();
    return;
  }
  if (isCabinRun()) {
    const lane = point.y < HEIGHT * 0.5 ? "upper" : "lower";
    switchFence(lane);
    const target = nearestWindowAtPoint(point);
    if (!target) return;
    selectWindow(target.id, false);
    if (lane === "upper") bark();
    return;
  }
  const targetWindow = nearestWindowAtPoint(point);
  if (!targetWindow) return;
  selectWindow(targetWindow.id, false);
  bark();
}

function changeFlatWindow(delta) {
  if (!game || screen !== "playing") return;
  if (isCabinRun() && game.charlieLane === "lower") game.flockActive = true;
  const next = clamp(game.selectedWindow + delta, 0, WINDOWS.length - 1);
  if (next === game.selectedWindow) {
    syncCanvasCamera();
    return;
  }
  selectWindow(next);
}

function resetCanvasGesture(pointerId = null) {
  if (pointerId === null) {
    canvasGestures.clear();
    activeDragPointer = null;
  } else {
    canvasGestures.delete(pointerId);
    if (activeDragPointer === pointerId) activeDragPointer = null;
  }
  if (activeDragPointer === null) canvasWrap.classList.remove("is-camera-dragging");
  syncCanvasCamera();
}

function cancelCanvasGesture(event) {
  if (!isImmersiveMode()) return;
  resetCanvasGesture(event.pointerId);
}

function onCanvasPointerDown(event) {
  if (!isImmersiveMode()) {
    handleCanvasSelection(event);
    return;
  }
  if (screen !== "playing" || !game) return;
  const cameraFactor = Number.parseFloat(canvasWrap.dataset.cameraFactor);
  canvasGestures.set(event.pointerId, {
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    maxMovement: 0,
    dragged: false,
    cameraFactor: Number.isFinite(cameraFactor) ? cameraFactor : cameraFactorForWindow(),
  });
  try { canvas.setPointerCapture(event.pointerId); } catch { /* capture can be unavailable in synthetic input */ }
}

function onCanvasPointerMove(event) {
  if (!isImmersiveMode()) {
    if (screen !== "playing" || !game || !settings.motion || event.pointerType === "touch") return;
    const point = canvasPoint(event);
    game.lookTarget = { x: point.x, y: point.y, until: game.elapsed + 0.65 };
    return;
  }
  const gesture = canvasGestures.get(event.pointerId);
  if (!gesture || screen !== "playing" || !game) return;
  gesture.lastX = event.clientX;
  gesture.lastY = event.clientY;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  gesture.maxMovement = Math.max(gesture.maxMovement, Math.hypot(dx, dy));
  if (gesture.maxMovement > 14) gesture.dragged = true;
  if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
    if (activeDragPointer === null) activeDragPointer = event.pointerId;
    if (activeDragPointer === event.pointerId) {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.max(rect.width / WIDTH, rect.height / HEIGHT);
      const overflow = Math.max(1, WIDTH * scale - rect.width);
      setCanvasCameraFactor(gesture.cameraFactor - dx / overflow);
      canvasWrap.classList.add("is-camera-dragging");
      event.preventDefault();
    }
  }
}

function onCanvasPointerUp(event) {
  if (!isImmersiveMode()) return;
  const gesture = canvasGestures.get(event.pointerId);
  if (!gesture || screen !== "playing" || !game) {
    resetCanvasGesture(event.pointerId);
    return;
  }
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  const movement = Math.hypot(dx, dy);
  gesture.maxMovement = Math.max(gesture.maxMovement, movement);
  const swipeThreshold = Math.min(72, Math.max(42, canvas.getBoundingClientRect().width * 0.1));
  const horizontalSwipe = Math.abs(dx) >= swipeThreshold && Math.abs(dx) > Math.abs(dy) * 1.2;
  const verticalSwipe = isCabinRun()
    && Math.abs(dy) >= swipeThreshold
    && Math.abs(dy) > Math.abs(dx) * 1.2;
  const otherThumbIsPanning = activeDragPointer !== null && activeDragPointer !== event.pointerId;
  if (verticalSwipe) {
    switchFence(dy < 0 ? "upper" : "lower");
  } else if (horizontalSwipe) {
    changeFlatWindow(dx < 0 ? 1 : -1);
  } else if (!gesture.dragged && gesture.maxMovement <= 14) {
    handleImmersiveTap(event);
    if (otherThumbIsPanning) {
      try { canvas.releasePointerCapture(activeDragPointer); } catch { /* capture may already be released */ }
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
      resetCanvasGesture();
      return;
    }
  }
  try { canvas.releasePointerCapture(event.pointerId); } catch { /* capture may already be released */ }
  resetCanvasGesture(event.pointerId);
}

function clearCanvasLookTarget() {
  if (game) game.lookTarget = null;
}

function onKeyDown(event) {
  const code = event.code;
  if (code === "Escape" && isFocusMode()) {
    event.preventDefault();
    void exitGameFullscreen();
    return;
  }
  if (code === "Escape" && isNativeGameFullscreen()) return;
  if (code === "Escape" && performance.now() < fullscreenState.ignoreEscapeUntil) return;
  const modalLayers = {
    briefing: ui.briefing,
    book: ui.patrolBook,
    patrolBriefing: ui.patrolBriefing,
    paused: ui.pause,
    result: ui.result,
  };
  if (modalLayers[screen] && code === "Tab") {
    const layer = modalLayers[screen];
        const focusable = [...layer.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (focusable.length) {
      event.preventDefault();
      const current = focusable.indexOf(document.activeElement);
      const next = event.shiftKey
        ? (current <= 0 ? focusable.length - 1 : current - 1)
        : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
      focusable[next].focus();
    }
    return;
  }
  if (screen === "paused" && ["Escape", "KeyP"].includes(code)) {
    event.preventDefault();
    resumeGame();
    return;
  }
  if (screen === "briefing" && code === "Escape") {
    event.preventDefault();
    closeBriefing();
    return;
  }
  if (screen === "book" && code === "Escape") {
    event.preventDefault();
    closePatrolBook();
    return;
  }
  if (screen === "patrolBriefing" && code === "Escape") {
    event.preventDefault();
    closePatrolBriefing();
    return;
  }
  if (screen !== "playing") return;
  const fromNativeControl = event.target instanceof Element && Boolean(event.target.closest("button, a, input, select, textarea"));
  if (fromNativeControl && !["Escape", "KeyP"].includes(code)) {
    const focusedButton = event.target.closest("button");
    if (code === "Space" && focusedButton) {
      event.preventDefault();
      if (!event.repeat) focusedButton.click();
    }
    return;
  }
  const handled = ["ArrowLeft", "ArrowRight", "Space", "KeyC", "KeyP", "Escape"];
  if (isCabinRun()) handled.push("ArrowUp", "ArrowDown");
  if (!handled.includes(code)) return;
  event.preventDefault();
  if (event.repeat && ["Space", "KeyC", "KeyP", "Escape"].includes(code)) return;
  if (code === "ArrowLeft") changeFlatWindow(-1);
  else if (code === "ArrowRight") changeFlatWindow(1);
  else if (code === "ArrowUp") switchFence("upper");
  else if (code === "ArrowDown") switchFence("lower");
  else if (code === "Space") bark();
  else if (code === "KeyC") useChicken();
  else if (["KeyP", "Escape"].includes(code)) pauseGame();
}

function restoreCanvasFocusAfterPointer(event) {
  if (event.detail > 0) canvas.focus({ preventScroll: true });
}

function toggleSound() {
  if (settings.sound) {
    stopAllSounds();
    settings.sound = false;
    if (audioContext?.state === "running") audioContext.suspend().catch(() => {});
  } else {
    settings.sound = true;
    ensureAudio();
    void loadSounds();
    playUi();
  }
  syncSettings();
  announce(`Sound ${settings.sound ? "on" : "off"}.`);
}

function toggleMotion() {
  settings.motion = !settings.motion;
  if (!settings.motion && game) {
    game.shake = 0;
    game.moving = 0;
    game.charlieX = game.targetX;
    game.charlieY = game.targetY ?? game.charlieY;
    game.effects = [];
  }
  syncSettings();
  announce(`Motion effects ${settings.motion ? "on" : "off"}.`);
}

function toggleRelaxed() {
  if (["playing", "paused"].includes(screen)) return;
  settings.relaxed = !settings.relaxed;
  syncSettings();
  announce(`Relaxed mode ${settings.relaxed ? "on. Threats move slower and shushes cannot end the patrol." : "off. Standard patrol rules restored."}`);
}

function bindEvents() {
  ui.campaignButton.addEventListener("click", () => openPatrolBriefing({ mode: "campaign", patrolId: pendingRun.patrolId, returnTo: "title" }));
  ui.startButton.addEventListener("click", () => openPatrolBriefing({ mode: "classic", patrolId: PATROLS[0].id, returnTo: "title" }));
  ui.travelButton.addEventListener("click", () => openPatrolBriefing({ mode: "travel", travelAssignmentId: DEFAULT_TRAVEL_ASSIGNMENT_ID, returnTo: "title" }));
  ui.dailyButton.addEventListener("click", () => {
    if (isModeUnlocked(profile, "daily")) openPatrolBriefing({ mode: "daily", returnTo: "title" });
  });
  ui.patrolBookButton.addEventListener("click", () => openPatrolBook({ returnTo: "title" }));
  ui.howButton.addEventListener("click", openBriefing);
  ui.briefingBack.addEventListener("click", closeBriefing);
  ui.beginButton.addEventListener("click", () => startRound({ mode: "classic", patrolId: PATROLS[0].id, collarTagId: profile.selectedCollarTagId }));
  ui.patrolBookClose.addEventListener("click", closePatrolBook);
  ui.patrolBriefingBack.addEventListener("click", closePatrolBriefing);
  ui.beginPatrolButton.addEventListener("click", () => startRound(pendingRun));
  ui.restartButton.addEventListener("click", replayCurrentRun);
  ui.nextPatrolButton.addEventListener("click", () => {
    openPatrolBriefing({
      mode: ui.nextPatrolButton.dataset.nextMode ?? "campaign",
      patrolId: ui.nextPatrolButton.dataset.nextPatrolId ?? pendingRun.patrolId,
      travelAssignmentId: ui.nextPatrolButton.dataset.travelAssignmentId ?? null,
      returnTo: "book",
    });
  });
  ui.bookFromResultButton.addEventListener("click", () => openPatrolBook({ returnTo: "result" }));
  ui.bookPatrolGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-patrol-id], button[data-mode]");
    if (!button || button.disabled) return;
    openPatrolBriefing({
      mode: button.dataset.mode ?? "campaign",
      patrolId: button.dataset.patrolId ?? PATROLS.at(-1).id,
      returnTo: "book",
    });
  });
  ui.collarTagChoices.addEventListener("change", (event) => {
    const input = event.target.closest('input[name="collar-tag"]');
    if (!input) return;
    profile = equipCollarTag(profile, input.value || null);
    profile = saveProfile(profile);
    pendingRun.collarTagId = profile.selectedCollarTagId;
    renderCollarChoices(profile.selectedCollarTagId);
    announce(`${input.value ? getCollarTag(input.value).name : "Official issue"} equipped.`);
  });
  ui.pauseButton.addEventListener("click", pauseGame);
  ui.fullscreenButton.addEventListener("click", () => { void toggleFullscreen(); });
  ui.resumeButton.addEventListener("click", resumeGame);
  ui.immersiveExitButton.addEventListener("click", () => { void exitGameFullscreen(); });
  ui.classicControlsButton.addEventListener("click", () => {
    immersiveClassicControls = true;
    syncImmersiveMode();
    resumeGame();
    announce("Classic full-screen controls restored.");
  });
  ui.soundToggle.addEventListener("click", toggleSound);
  ui.motionToggle.addEventListener("click", toggleMotion);
  ui.pauseSoundToggle.addEventListener("click", toggleSound);
  ui.pauseMotionToggle.addEventListener("click", toggleMotion);
  ui.relaxedToggle.addEventListener("click", toggleRelaxed);
  ui.prevWindow.addEventListener("click", (event) => {
    changeFlatWindow(-1);
    restoreCanvasFocusAfterPointer(event);
  });
  ui.nextWindow.addEventListener("click", (event) => {
    changeFlatWindow(1);
    restoreCanvasFocusAfterPointer(event);
  });
  ui.switchFenceButton.addEventListener("click", (event) => {
    switchFence();
    restoreCanvasFocusAfterPointer(event);
  });
  ui.barkButton.addEventListener("click", (event) => {
    bark();
    restoreCanvasFocusAfterPointer(event);
  });
  ui.chickenButton.addEventListener("click", (event) => {
    useChicken();
    restoreCanvasFocusAfterPointer(event);
  });
  canvas.addEventListener("pointerdown", onCanvasPointerDown);
  canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onCanvasPointerUp);
  canvas.addEventListener("pointercancel", cancelCanvasGesture);
  canvas.addEventListener("lostpointercapture", cancelCanvasGesture);
  canvas.addEventListener("pointerleave", clearCanvasLookTarget);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screen === "playing") pauseGame();
  });
  window.addEventListener("blur", () => {
    if (screen === "playing" && !fullscreenState.transitioning) pauseGame();
  });
  window.addEventListener("resize", () => {
    syncImmersiveMode();
    requestAnimationFrame(syncCanvasCamera);
  });
}

function frame(timestamp) {
  const dt = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000));
  lastFrame = timestamp;
  updateGame(dt);
  render();
  requestAnimationFrame(frame);
}

window.CharlieGuard = {
  getState() {
    if (!game) return { screen, settings: { ...settings }, bestScore, progression: getProgressionSnapshot(profile), audio: getAudioState() };
    return {
      screen,
      settings: { ...settings },
      bestScore,
      run: {
        mode: game.run.mode,
        patrolId: game.run.patrolId,
        travelAssignmentId: game.run.travelAssignmentId,
        arena: game.run.arena,
        seed: game.run.seed,
        collarTagId: game.run.collarTag?.id ?? null,
      },
      timeLeft: game.timeLeft,
      score: game.score,
      combo: game.combo,
      safety: game.safety,
      patience: game.patience,
      chicken: game.chicken,
      selectedRoom: game.selectedRoom,
      selectedWindow: game.selectedWindow,
      charlieLane: game.charlieLane,
      charlieX: game.charlieX,
      charlieY: game.charlieY,
      flock: game.flock ? {
        ...game.flockStatus,
        sheep: game.flock.sheep.map((sheep) => ({ ...sheep })),
      } : null,
      noise: game.rooms.map((room) => room.noise),
      attention: game.rooms.map((room) => room.attention),
      conditions: game.rooms.map((room, index) => ({
        room: ROOMS[index].id,
        environment: room.environment,
        coverCharges: room.cover.charges,
      })),
      listening: game.listening.active ? { ...game.listening.active } : null,
      warning: game.warning ? { ...game.warning } : null,
      sneaky: game.sneaky ? { ...game.sneaky } : null,
      barkCooldown: game.barkCooldown,
      superRemaining: Math.max(0, game.superUntil - game.elapsed),
      petAnimation: game.petPose ? { ...game.petPose } : null,
      audio: getAudioState(),
      entities: game.entities.map((entity) => ({ ...entity })),
      stats: {
        guarded: game.guarded,
        missed: game.missed,
        switches: game.switches,
        barks: game.barks,
        unnecessary: game.unnecessary,
        chickens: game.chickens,
        friendsSpared: game.friendsSpared,
        quietResolutions: game.quietResolutions,
        perfectCrimes: game.perfectCrimes,
        violations: game.violations,
        bossDefeated: game.bossDefeated,
        flockSettled: game.flockStatus?.settleMarks ?? game.flockSettled,
        bestFlockSize: game.bestFlockSize,
        sheepBarks: game.sheepBarks,
      },
    };
  },
  getProfile() {
    return JSON.parse(JSON.stringify(profile));
  },
  start: startRound,
  startMode(mode = "classic", patrolId = PATROLS[0].id, seed) {
    startRound({ mode, patrolId, seed, collarTagId: profile.selectedCollarTagId });
  },
  startTravel(assignmentId = DEFAULT_TRAVEL_ASSIGNMENT_ID, seed = 0xc2ec4a) {
    startRound({ mode: "travel", travelAssignmentId: assignmentId, seed, collarTagId: null });
  },
  pause: pauseGame,
  resume: resumeGame,
  bark,
  moveRoom: setRoom,
  moveWindow: changeFlatWindow,
  moveFence: switchFence,
  selectWindow,
  useChicken,
  spawnThreat(windowId = game?.selectedWindow ?? 2, hp = 1, type = "squirrel") {
    return spawnVisitor({ windowId, hp, type, friendly: false, progress: 0.38 });
  },
  spawnFriend(windowId = game?.selectedWindow ?? 2, type = "neighbour") {
    return spawnVisitor({ windowId, friendly: true, type, progress: 0.38 });
  },
  loadSounds,
  setNoise(room, value) {
    if (game) {
      const target = game.rooms[clamp(room, 0, 2)];
      target.noise = clamp(value, 0, 3);
      target.attention = target.noise / 3 * 100;
    }
  },
  setAttention(room, value) {
    if (game) {
      const target = game.rooms[clamp(room, 0, 2)];
      target.attention = clamp(value, 0, 100);
      target.noise = target.attention / 100 * 3;
    }
  },
  grantCover(room, charges = 1, source = "tv") {
    if (game) {
      const target = game.rooms[clamp(room, 0, 2)];
      target.cover = grantCoverCharges(target.cover, { source, charges, now: game.elapsed, expiresAt: game.elapsed + 30 });
    }
  },
  fillChicken() {
    if (game) { game.chicken = game.chickenGoal; syncHUD(); }
  },
  step(seconds = 0.1) {
    updateGame(clamp(Number(seconds) || 0, 0, 1));
    render();
    return this.getState();
  },
  finish() {
    if (game) endGame("complete", true);
  },
};

syncSettings();
bindEvents();
syncCareerUI();
setLayer("title");
syncHUD();
render();
requestAnimationFrame(frame);
