export const CONTENT_VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export const MODE_CONFIGS = deepFreeze({
  campaign: {
    id: "campaign",
    label: "Charlie's Patrol Book",
    shortLabel: "Patrol Book",
    description: "Six authored cases, eighteen Paw Stamps, and a great deal of paperwork.",
    progression: true,
    unlock: { type: "always" },
  },
  travel: {
    id: "travel",
    label: "Charlie's Travel Files",
    shortLabel: "Travel Files",
    description: "One-off assignments from Charlie's fieldwork beyond the flat.",
    progression: false,
    unlock: { type: "always" },
  },
  classic: {
    id: "classic",
    label: "Classic Patrol",
    shortLabel: "Classic",
    description: "The original ninety-second shift, preserved exactly as Charlie remembers it.",
    durationSeconds: 90,
    progression: false,
    unlock: { type: "always" },
  },
  endless: {
    id: "endless",
    label: "Overtime Watch",
    shortLabel: "Endless",
    description: "An escalating shift with no clock-out time and increasingly unreasonable windows.",
    progression: false,
    unlock: { type: "campaignClears", count: 6 },
  },
  daily: {
    id: "daily",
    label: "Today's Window Report",
    shortLabel: "Daily",
    description: "One seeded patrol shared by every local security professional for that date.",
    durationSeconds: 90,
    progression: false,
    unlock: { type: "stamps", count: 3 },
  },
});

const objective = (id, label, description, rule) => ({
  id,
  label,
  description,
  requiresClear: true,
  rule,
});

export const DEFAULT_TRAVEL_ASSIGNMENT_ID = "czech-cabin-duty";

export const TRAVEL_ASSIGNMENTS = deepFreeze([
  {
    id: DEFAULT_TRAVEL_ASSIGNMENT_ID,
    title: "Czech Cabin Duty",
    shortTitle: "Czech Cabin",
    subtitle: "The Sheep Situation",
    tagline: "Two fences. Six sheep. Zero respect for authority.",
    briefing: "Defend the cabin's upper fence while guiding six unimpressed sheep into one grazing patch below. Position moves the flock; bark only when one refuses to cooperate.",
    durationSeconds: 105,
    arena: "cabin",
    sheepCount: 6,
    settledMarkTarget: 3,
    featuredVisitors: ["squirrel", "pigeon", "robot", "pirate", "leaves"],
    travelOrders: [
      objective(
        "cabin-duty-complete",
        "Complete cabin duty",
        "Juggle both fences until the assignment clock runs out.",
        { type: "completed" },
      ),
      objective(
        "cabin-flock-settled",
        "Settle the flock",
        "Earn three Flock Settled marks during one duty.",
        { type: "metric", metric: "stats.flockSettled", operator: ">=", target: 3 },
      ),
      objective(
        "cabin-top-fence-secure",
        "Nothing past the top fence",
        "Complete cabin duty without a top-fence miss.",
        { type: "metric", metric: "stats.missed", operator: "<=", target: 0 },
      ),
    ],
  },
]);

export const PATROLS = deepFreeze([
  {
    id: "regular-shift",
    number: 1,
    title: "The Regular Shift",
    shortTitle: "Regular Shift",
    subtitle: "A routine inspection of all six highly suspicious windows.",
    briefing: "Guard the flat, identify the friendly visitors, and establish Charlie's impeccable credentials.",
    durationSeconds: 90,
    difficulty: 1,
    featuredVisitors: ["squirrel", "pigeon", "robot", "neighbour", "walker", "postie"],
    roomConditions: {},
    director: {
      deck: ["morning-mail", "pigeon-pair", "false-calm", "robot-inspection"],
      finale: "golden-window-rush",
    },
    objectives: [
      objective(
        "regular-clear",
        "Complete the shift",
        "Keep the flat secure until clock-out.",
        { type: "completed" },
      ),
      objective(
        "regular-full-safety",
        "Not on my watch",
        "Finish with full Safety.",
        { type: "metric", metric: "stats.safetyRemaining", operator: ">=", target: 3 },
      ),
      objective(
        "regular-three-switches",
        "You cannot shush what you cannot catch",
        "Land three Sneaky Switch guards in one patrol.",
        { type: "metric", metric: "stats.switches", operator: ">=", target: 3 },
      ),
    ],
  },
  {
    id: "special-delivery",
    number: 2,
    title: "Special Delivery",
    shortTitle: "Special Delivery",
    subtitle: "Posties, neighbours, parcels, and one person who is definitely not the postie.",
    briefing: "Identification matters. Let legitimate deliveries through and challenge the parcel pirates behind them.",
    durationSeconds: 95,
    difficulty: 2,
    featuredVisitors: ["postie", "neighbour", "pirate", "coat", "walker"],
    roomConditions: {
      doorbell: { announcesPostie: true, attentionCoverCharges: 1 },
    },
    director: {
      deck: ["postie-and-pirate", "neighbourly-wave", "parcel-decoy", "wrong-coat"],
      finale: "delivery-scramble",
    },
    objectives: [
      objective(
        "delivery-clear",
        "Complete the delivery round",
        "Keep every questionable parcel outside until clock-out.",
        { type: "completed" },
      ),
      objective(
        "delivery-accurate",
        "Certified nose for trouble",
        "Finish with at least 85% bark accuracy after eight or more barks.",
        {
          type: "all",
          rules: [
            { type: "metric", metric: "stats.accuracy", operator: ">=", target: 0.85 },
            { type: "metric", metric: "stats.barks", operator: ">=", target: 8 },
          ],
        },
      ),
      objective(
        "delivery-five-friends",
        "Polite to authorised personnel",
        "Correctly let five friendly visitors pass.",
        { type: "metric", metric: "stats.friendsSpared", operator: ">=", target: 5 },
      ),
    ],
  },
  {
    id: "important-work-call",
    number: 3,
    title: "Important Work Call",
    shortTitle: "Important Work Call",
    subtitle: "The owner is presenting. The squirrels have declined to reschedule.",
    briefing: "The office hears every bark. Use quiet compliance, the television, and the kettle to keep working security hours.",
    durationSeconds: 100,
    difficulty: 3,
    featuredVisitors: ["squirrel", "pigeon", "robot", "neighbour"],
    roomConditions: {
      office: { name: "Video call", attentionGainMultiplier: 1.6, coverCharges: 0 },
      living: { name: "Television", attentionGainMultiplier: 0.55, periodicCoverCharges: 1 },
      kitchen: { name: "Kettle", attentionGainMultiplier: 1, periodicCoverCharges: 2 },
    },
    director: {
      deck: ["calendar-reminder", "tv-action-scene", "kettle-whistle", "camera-on"],
      finale: "quarterly-bark-review",
    },
    objectives: [
      objective(
        "work-call-clear",
        "Complete the call",
        "Protect both the flat and the owner's professional reputation.",
        { type: "completed" },
      ),
      objective(
        "work-call-obedient",
        "Demonstrably capable of listening",
        "Resolve two shushes by staying quiet.",
        { type: "metric", metric: "stats.quietResolutions", operator: ">=", target: 2 },
      ),
      objective(
        "work-call-perfect-crime",
        "No audible evidence",
        "Land two fully covered Perfect Crime barks.",
        { type: "metric", metric: "stats.perfectCrimes", operator: ">=", target: 2 },
      ),
    ],
  },
  {
    id: "chicken-emergency",
    number: 4,
    title: "Chicken Emergency",
    shortTitle: "Chicken Emergency",
    subtitle: "Security resources are strained. Fortunately, dinner is operational.",
    briefing: "Stubborn machinery is approaching every food-adjacent window. Charge chicken quickly and spend it decisively.",
    durationSeconds: 105,
    difficulty: 4,
    featuredVisitors: ["robot", "leaves", "pirate", "coat"],
    roomConditions: {
      chickenChargePerGuard: 1,
      superSnifferSeconds: 6,
      superSnifferDamage: 2,
    },
    director: {
      deck: ["robot-reboot", "leaf-division", "fridge-inspection", "double-helping"],
      finale: "machine-buffet",
    },
    objectives: [
      objective(
        "chicken-clear",
        "Contain the emergency",
        "Finish the shift without surrendering the kitchen.",
        { type: "completed" },
      ),
      objective(
        "chicken-two-servings",
        "Compliments to the chef",
        "Deploy chicken twice in one patrol.",
        { type: "metric", metric: "stats.chickens", operator: ">=", target: 2 },
      ),
      objective(
        "chicken-super-guards",
        "Protein-powered policing",
        "Guard five threats while Super Sniffer is active.",
        { type: "metric", metric: "stats.superGuards", operator: ">=", target: 5 },
      ),
    ],
  },
  {
    id: "six-window-surge",
    number: 5,
    title: "Six-Window Surge",
    shortTitle: "Six-Window Surge",
    subtitle: "Every room. Every window. Approximately zero respect for personal boundaries.",
    briefing: "Read the whole flat, route efficiently, and prove that no window has been unfairly overlooked.",
    durationSeconds: 110,
    difficulty: 5,
    featuredVisitors: ["squirrel", "pigeon", "robot", "pirate", "leaves", "coat"],
    roomConditions: {
      simultaneousWindows: 6,
      ownerListeningFollowsAfterSwitches: 2,
    },
    director: {
      deck: ["left-right-feint", "three-room-wave", "friendly-screen", "all-glass-alert"],
      finale: "six-window-salute",
    },
    objectives: [
      objective(
        "surge-clear",
        "Weather the surge",
        "Secure the entire flat until clock-out.",
        { type: "completed" },
      ),
      objective(
        "surge-all-windows",
        "Equal-opportunity vigilance",
        "Guard at least one threat at each of the six windows.",
        { type: "metric", metric: "stats.distinctWindowsGuarded", operator: ">=", target: 6 },
      ),
      objective(
        "surge-flawless-eighteen",
        "No pane left behind",
        "Guard eighteen threats without missing one.",
        {
          type: "all",
          rules: [
            { type: "metric", metric: "stats.guarded", operator: ">=", target: 18 },
            { type: "metric", metric: "stats.missed", operator: "<=", target: 0 },
          ],
        },
      ),
    ],
  },
  {
    id: "mystery-coat-incident",
    number: 6,
    title: "The Mystery Coat Incident",
    shortTitle: "Mystery Coat Incident",
    subtitle: "It has pockets. It changes rooms. Charlie's report contains several underlined sections.",
    briefing: "Track the coat across the flat while the owner starts following the barking. Use every trick in the Patrol Book.",
    durationSeconds: 120,
    difficulty: 6,
    featuredVisitors: ["coat", "pirate", "robot", "postie"],
    roomConditions: {
      boss: "mystery-coat",
      ownerListeningFollows: true,
      coatRelocatesWhenBarked: true,
    },
    director: {
      deck: ["coat-sighting", "postie-alibi", "room-to-room-chase", "owner-investigates"],
      finale: "coat-stand-off",
    },
    objectives: [
      objective(
        "coat-clear",
        "Close the case",
        "Complete the final patrol and file the coat report.",
        { type: "completed" },
      ),
      objective(
        "coat-repelled",
        "Case: definitely suspicious",
        "Repel the Mystery Coat at least once.",
        { type: "metric", metric: "stats.coatRepelled", operator: ">=", target: 1 },
      ),
      objective(
        "coat-composure",
        "Supreme Window Warden",
        "Finish without a miss and with at least 50% Patience.",
        {
          type: "all",
          rules: [
            { type: "metric", metric: "stats.missed", operator: "<=", target: 0 },
            { type: "metric", metric: "stats.patienceRemaining", operator: ">=", target: 50 },
          ],
        },
      ),
    ],
  },
]);

export const RANKS = deepFreeze([
  {
    id: "self-appointed-security-officer",
    stampThreshold: 0,
    title: "Self-Appointed Security Officer",
    shortTitle: "Security Officer",
  },
  {
    id: "certified-curtain-inspector",
    stampThreshold: 3,
    title: "Certified Curtain Inspector",
    shortTitle: "Curtain Inspector",
  },
  {
    id: "senior-household-sentinel",
    stampThreshold: 6,
    title: "Senior Household Sentinel",
    shortTitle: "Senior Sentinel",
  },
  {
    id: "director-of-bark-operations",
    stampThreshold: 10,
    title: "Director of Bark Operations",
    shortTitle: "Bark Director",
  },
  {
    id: "executive-vp-suspicious-noises",
    stampThreshold: 14,
    title: "Executive Vice President of Suspicious Noises",
    shortTitle: "Executive VP",
  },
  {
    id: "supreme-window-warden",
    stampThreshold: 18,
    title: "Supreme Window Warden",
    shortTitle: "Window Warden",
  },
]);

export const COLLAR_TAGS = deepFreeze([
  {
    id: "velvet-voice",
    name: "Velvet Voice",
    stampThreshold: 3,
    description: "A tactful indoor woof for sensitive meetings.",
    advantage: "Barks generate 28% less Owner Attention.",
    tradeoff: "Bark cooldown is 30% longer.",
    modifiers: { attentionGainMultiplier: 0.72, barkCooldownMultiplier: 1.3 },
  },
  {
    id: "brass-megaphone",
    name: "Brass Megaphone",
    stampThreshold: 7,
    description: "The subtlety of a public-address system worn directly under the chin.",
    advantage: "Each bark deals one extra guard damage.",
    tradeoff: "Barks generate 55% more Attention and earn 15% less guard score.",
    modifiers: { barkDamageBonus: 1, attentionGainMultiplier: 1.55, guardScoreMultiplier: 0.85 },
  },
  {
    id: "hallway-sprinter",
    name: "Hallway Sprinter",
    stampThreshold: 11,
    description: "Aerodynamic credentials for tactical room reassignment.",
    advantage: "Sneaky Switch windows last 50% longer and relocating cools 12 extra Attention.",
    tradeoff: "Quiet compliance restores 25% less Patience.",
    modifiers: {
      sneakyWindowMultiplier: 1.5,
      relocationAttentionCoolingBonus: 12,
      quietRecoveryMultiplier: 0.75,
    },
  },
  {
    id: "chicken-inspector",
    name: "Chicken Inspector",
    stampThreshold: 15,
    description: "Official authority to audit poultry at extremely short notice.",
    advantage: "Chicken charges after four guards instead of five.",
    tradeoff: "Super Sniffer and its Patience recovery are 25% shorter or smaller.",
    modifiers: {
      chickenChargeRequired: 4,
      superDurationMultiplier: 0.75,
      chickenPatienceRestoreMultiplier: 0.75,
    },
  },
]);

export const REWARDS = deepFreeze([
  { id: "photo-personnel-file", stampThreshold: 1, type: "photo", label: "Personnel-file portrait", asset: "assets/photos/charlie-hero.jpg" },
  { id: "decor-office-certificate", stampThreshold: 2, type: "decoration", label: "Office security certificate", room: "office" },
  { id: "tag-velvet-voice", stampThreshold: 3, type: "collarTag", label: "Velvet Voice", collarTagId: "velvet-voice" },
  { id: "photo-incident-report", stampThreshold: 5, type: "photo", label: "Incident-report portrait", asset: "assets/photos/charlie-bark.jpg" },
  { id: "tag-brass-megaphone", stampThreshold: 7, type: "collarTag", label: "Brass Megaphone", collarTagId: "brass-megaphone" },
  { id: "decor-living-trophy", stampThreshold: 9, type: "decoration", label: "Living-room vigilance trophy", room: "living" },
  { id: "tag-hallway-sprinter", stampThreshold: 11, type: "collarTag", label: "Hallway Sprinter", collarTagId: "hallway-sprinter" },
  { id: "decor-chicken-magnet", stampThreshold: 13, type: "decoration", label: "Emergency chicken magnet", room: "kitchen" },
  { id: "tag-chicken-inspector", stampThreshold: 15, type: "collarTag", label: "Chicken Inspector", collarTagId: "chicken-inspector" },
  { id: "photo-supreme-warden", stampThreshold: 18, type: "photo", label: "Supreme Window Warden portrait", asset: "assets/photos/charlie-bark.jpg" },
]);

const PATROL_BY_ID = new Map(PATROLS.map((patrol) => [patrol.id, patrol]));
const TRAVEL_ASSIGNMENT_BY_ID = new Map(
  TRAVEL_ASSIGNMENTS.map((assignment) => [assignment.id, assignment]),
);
const RANK_BY_ID = new Map(RANKS.map((rank) => [rank.id, rank]));
const TAG_BY_ID = new Map(COLLAR_TAGS.map((tag) => [tag.id, tag]));

export function getPatrol(patrolId) {
  return PATROL_BY_ID.get(patrolId) ?? null;
}

export function getTravelAssignment(assignmentId) {
  return TRAVEL_ASSIGNMENT_BY_ID.get(assignmentId) ?? null;
}

export function getNextPatrol(patrolId) {
  const index = PATROLS.findIndex((patrol) => patrol.id === patrolId);
  return index >= 0 ? PATROLS[index + 1] ?? null : null;
}

export function getRank(rankId) {
  return RANK_BY_ID.get(rankId) ?? null;
}

export function getRankForStampCount(stampCount) {
  const count = Math.max(0, Number(stampCount) || 0);
  return [...RANKS].reverse().find((rank) => count >= rank.stampThreshold) ?? RANKS[0];
}

export function getCollarTag(tagId) {
  return TAG_BY_ID.get(tagId) ?? null;
}

export function getRewardsForStampCount(stampCount) {
  const count = Math.max(0, Number(stampCount) || 0);
  return REWARDS.filter((reward) => count >= reward.stampThreshold);
}

export function getCollarTagsForStampCount(stampCount) {
  const count = Math.max(0, Number(stampCount) || 0);
  return COLLAR_TAGS.filter((tag) => count >= tag.stampThreshold);
}

export function getObjective(patrolId, objectiveId) {
  return getPatrol(patrolId)?.objectives.find((item) => item.id === objectiveId) ?? null;
}

export function formatDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("A valid date is required");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getDailyConfig(value = new Date()) {
  const dateKey = formatDateKey(value);
  const seed = hashSeed(`charlie-window-watch:${dateKey}`);
  const patrol = PATROLS[seed % PATROLS.length];
  const twists = [
    { id: "busy-pavement", label: "Busy pavement", spawnIntervalMultiplier: 0.88 },
    { id: "sensitive-ears", label: "Sensitive ears", attentionGainMultiplier: 1.15 },
    { id: "generous-chicken", label: "Generous chicken", chickenChargeRequired: 4 },
    { id: "quick-feet", label: "Quick feet", visitorSpeedMultiplier: 1.1 },
  ];
  return deepFreeze({
    mode: "daily",
    dateKey,
    seed,
    patrolId: patrol.id,
    twist: twists[(seed >>> 8) % twists.length],
  });
}
