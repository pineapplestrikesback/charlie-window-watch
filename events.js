const card = (id, title, events) => ({ id, title, events });
const spawn = (offset, visitorType, options = {}) => ({ offset, kind: "spawn", visitorType, ...options });
const condition = (offset, roomId, environment, options = {}) => ({ offset, kind: "condition", roomId, environment, ...options });
const message = (offset, text) => ({ offset, kind: "message", text });

export const DIRECTOR_CARDS = Object.freeze([
  card("morning-mail", "Morning mail", [
    spawn(0, "postie", { friendly: true, windowId: 2 }),
    spawn(2.4, "squirrel", { windowId: 0 }),
  ]),
  card("pigeon-pair", "Pigeon conference", [
    spawn(0, "pigeon", { windowId: 1 }),
    spawn(0.75, "pigeon", { windowId: 3 }),
  ]),
  card("false-calm", "False calm", [
    spawn(0, "neighbour", { friendly: true, windowId: 4 }),
    spawn(1.15, "walker", { friendly: true, windowId: 1 }),
    spawn(2.8, "coat", { windowId: 5 }),
  ]),
  card("robot-inspection", "Unscheduled robot inspection", [
    spawn(0, "robot", { windowId: 4 }),
    spawn(1.5, "squirrel", { windowId: 2 }),
  ]),
  card("golden-window-rush", "Golden-window rush", [
    message(0, "Final rush: all ears on the windows!"),
    spawn(0.2, "squirrel", { windowId: 0 }),
    spawn(0.8, "pigeon", { windowId: 2 }),
    spawn(1.5, "robot", { windowId: 5 }),
  ]),

  card("postie-and-pirate", "Postie and pirate", [
    spawn(0, "postie", { friendly: true, windowId: 2, leavesParcel: true }),
    spawn(2, "pirate", { windowId: 4, parcelRaid: true }),
  ]),
  card("neighbourly-wave", "Neighbourly wave", [
    spawn(0, "neighbour", { friendly: true, windowId: 0 }),
    spawn(1.4, "pirate", { windowId: 3 }),
  ]),
  card("parcel-decoy", "Parcel decoy", [
    spawn(0, "postie", { friendly: true, windowId: 5, leavesParcel: true }),
    spawn(0.7, "coat", { windowId: 1 }),
    spawn(2.2, "pirate", { windowId: 4, parcelRaid: true }),
  ]),
  card("wrong-coat", "The wrong coat", [
    spawn(0, "cleaner", { friendly: true, windowId: 1 }),
    spawn(1.2, "coat", { windowId: 3 }),
  ]),
  card("delivery-scramble", "Delivery scramble", [
    message(0, "Final delivery wave: check the uniform before barking!"),
    spawn(0.2, "postie", { friendly: true, windowId: 0, leavesParcel: true }),
    spawn(0.7, "pirate", { windowId: 2, parcelRaid: true }),
    spawn(1.2, "neighbour", { friendly: true, windowId: 4 }),
    spawn(1.8, "pirate", { windowId: 5, parcelRaid: true }),
  ]),

  card("calendar-reminder", "Calendar reminder", [
    condition(0, 0, "video-call", { duration: 9 }),
    spawn(0.6, "squirrel", { windowId: 0 }),
    spawn(2, "neighbour", { friendly: true, windowId: 3 }),
  ]),
  card("tv-action-scene", "TV action scene", [
    condition(0, 1, "tv", { duration: 8, coverCharges: 1 }),
    spawn(0.5, "robot", { windowId: 2 }),
    spawn(1.7, "pigeon", { windowId: 3 }),
  ]),
  card("kettle-whistle", "Kettle whistle", [
    condition(0, 2, "kettle", { duration: 6, coverCharges: 2 }),
    spawn(0.5, "squirrel", { windowId: 4 }),
    spawn(1.4, "robot", { windowId: 5 }),
  ]),
  card("camera-on", "Camera on", [
    condition(0, 0, "video-call", { duration: 11 }),
    spawn(0.4, "pigeon", { windowId: 0 }),
    spawn(1.2, "walker", { friendly: true, windowId: 2 }),
    spawn(2.2, "squirrel", { windowId: 4 }),
  ]),
  card("quarterly-bark-review", "Quarterly bark review", [
    message(0, "Final review: protect the call and use the household noise."),
    condition(0, 0, "video-call", { duration: 12 }),
    condition(0, 1, "tv", { duration: 7, coverCharges: 1 }),
    condition(4.5, 2, "kettle", { duration: 6, coverCharges: 2 }),
    spawn(0.4, "robot", { windowId: 0 }),
    spawn(1.1, "squirrel", { windowId: 2 }),
    spawn(4.8, "robot", { windowId: 5 }),
  ]),

  card("robot-reboot", "Robot reboot", [
    spawn(0, "robot", { windowId: 0, hp: 2 }),
    spawn(1.6, "robot", { windowId: 4, hp: 2 }),
  ]),
  card("leaf-division", "Leaf division", [
    spawn(0, "leaves", { windowId: 1, canSpread: true }),
    spawn(1.1, "leaves", { windowId: 5, canSpread: true }),
  ]),
  card("fridge-inspection", "Fridge inspection", [
    condition(0, 2, "kettle", { duration: 5, coverCharges: 1 }),
    spawn(0.2, "coat", { windowId: 4 }),
    spawn(1, "robot", { windowId: 5 }),
  ]),
  card("double-helping", "Double helping", [
    spawn(0, "pirate", { windowId: 2 }),
    spawn(0.8, "robot", { windowId: 0 }),
    spawn(1.6, "leaves", { windowId: 4, canSpread: true }),
  ]),
  card("machine-buffet", "Machine buffet", [
    message(0, "Final course: deploy the chicken when the machines arrive!"),
    spawn(0.2, "robot", { windowId: 0, hp: 3 }),
    spawn(0.8, "robot", { windowId: 3, hp: 3 }),
    spawn(1.4, "coat", { windowId: 5, hp: 3 }),
  ]),

  card("left-right-feint", "Left-right feint", [
    spawn(0, "squirrel", { windowId: 0 }),
    spawn(0.55, "pigeon", { windowId: 5 }),
    spawn(1.2, "robot", { windowId: 2 }),
  ]),
  card("three-room-wave", "Three-room wave", [
    spawn(0, "pirate", { windowId: 0 }),
    spawn(0.7, "leaves", { windowId: 1, canSpread: true }),
    spawn(1.4, "robot", { windowId: 4 }),
  ]),
  card("friendly-screen", "Friendly screen", [
    spawn(0, "walker", { friendly: true, windowId: 0 }),
    spawn(0.45, "neighbour", { friendly: true, windowId: 2 }),
    spawn(1.1, "coat", { windowId: 4 }),
    spawn(1.6, "pirate", { windowId: 3 }),
  ]),
  card("all-glass-alert", "All-glass alert", [
    spawn(0, "squirrel", { windowId: 0 }),
    spawn(0.35, "pigeon", { windowId: 1 }),
    spawn(0.7, "robot", { windowId: 2 }),
    spawn(1.05, "pirate", { windowId: 3 }),
    spawn(1.4, "leaves", { windowId: 4, canSpread: true }),
    spawn(1.75, "coat", { windowId: 5 }),
  ]),
  card("six-window-salute", "Six-window salute", [
    message(0, "Final surge: every pane is now somebody's business."),
    spawn(0.2, "squirrel", { windowId: 0 }),
    spawn(0.55, "pigeon", { windowId: 1 }),
    spawn(0.9, "robot", { windowId: 2 }),
    spawn(1.25, "pirate", { windowId: 3 }),
    spawn(1.6, "leaves", { windowId: 4, canSpread: true }),
    spawn(1.95, "coat", { windowId: 5 }),
  ]),

  card("coat-sighting", "Coat sighting", [
    spawn(0, "coat", { windowId: 2, hp: 3, relocateOnBark: true }),
    spawn(1.3, "postie", { friendly: true, windowId: 5 }),
  ]),
  card("postie-alibi", "Postie alibi", [
    spawn(0, "postie", { friendly: true, windowId: 0, leavesParcel: true }),
    spawn(0.9, "coat", { windowId: 3, hp: 3, relocateOnBark: true }),
    spawn(1.8, "pirate", { windowId: 5 }),
  ]),
  card("room-to-room-chase", "Room-to-room chase", [
    spawn(0, "coat", { windowId: 0, hp: 4, relocateOnBark: true }),
    spawn(1.1, "robot", { windowId: 4 }),
  ]),
  card("owner-investigates", "Owner investigates", [
    condition(0, 0, "video-call", { duration: 10 }),
    condition(2.8, 1, "tv", { duration: 6, coverCharges: 1 }),
    condition(6.4, 2, "kettle", { duration: 5, coverCharges: 1 }),
    spawn(0.5, "coat", { windowId: 0, hp: 4, relocateOnBark: true }),
  ]),
  card("coat-stand-off", "The coat stand-off", [
    message(0, "CASE FINALE: the Mystery Coat is making a move!"),
    spawn(0.2, "coat", { windowId: 2, hp: 6, boss: true, relocateOnBark: true, speed: 0.075 }),
    spawn(1.2, "postie", { friendly: true, windowId: 0 }),
    spawn(2.2, "pirate", { windowId: 5 }),
  ]),
]);

const CARD_BY_ID = new Map(DIRECTOR_CARDS.map((item) => [item.id, item]));

export function getDirectorCard(cardId) {
  return CARD_BY_ID.get(cardId) ?? null;
}

export function getDirectorCards(cardIds) {
  return cardIds.map(getDirectorCard).filter(Boolean);
}
