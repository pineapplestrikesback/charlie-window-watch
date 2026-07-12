import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PATROLS } from "../content.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const fromRoot = (...parts) => path.join(projectRoot, ...parts);

const coreFiles = ["index.html", "styles.css", "game.js"];
const [html, css, game] = await Promise.all(
  coreFiles.map((file) => readFile(fromRoot(file), "utf8")),
);
const selectorCss = css.replace(/\/\*[\s\S]*?\*\//g, "");

const htmlIds = [...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]);
const idSet = new Set(htmlIds);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openingTagWithId(id) {
  const match = html.match(
    new RegExp(`<[^>]*\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\1[^>]*>`, "i"),
  );
  assert.ok(match, `Expected an element with id="${id}"`);
  return match[0];
}

function attributeValue(tag, name) {
  const match = tag.match(
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );
  return match?.[2];
}

function elementText(id) {
  const match = html.match(
    new RegExp(
      `<([a-z][\\w:-]*)[^>]*\\bid\\s*=\\s*(["'])${escapeRegExp(id)}\\2[^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ),
  );
  assert.ok(match, `Expected content for element id="${id}"`);
  return match[3].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function quotedAttributeReferences(source) {
  return [...source.matchAll(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi)].map((match) => ({
    attribute: match[1].toLowerCase(),
    value: match[3].trim(),
  }));
}

function cssUrlReferences(source) {
  return [...source.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)].map((match) => match[2].trim());
}

function cssDeclarationsForSelector(selector) {
  const normalizedSelector = selector.replace(/\s+/g, " ").trim();
  return [...selectorCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1]
      .split(",")
      .map((item) => item.replace(/\s+/g, " ").trim())
      .includes(normalizedSelector))
    .map((match) => match[2]);
}

function assertCssDeclaration(selector, expected, message) {
  const declarations = cssDeclarationsForSelector(selector);
  assert.ok(
    declarations.some((value) => expected.test(value)),
    message ?? `Expected ${selector} to include ${expected}`,
  );
}

async function assertNonemptyFile(relativePath) {
  const info = await stat(fromRoot(relativePath));
  assert.ok(info.isFile(), `${relativePath} must be a regular file`);
  assert.ok(info.size > 0, `${relativePath} must not be empty`);
}

test("core game files exist and are non-empty", async () => {
  await Promise.all(coreFiles.map(assertNonemptyFile));
});

test("the repository root preserves the GitHub Pages no-index contract", async () => {
  assert.equal((await stat(fromRoot(".nojekyll"))).size, 0);
  assert.equal(await readFile(fromRoot("robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
  assert.match(html, /<meta\s+name=["']robots["']\s+content=["']noindex, nofollow, noarchive["']\s*\/?>/i);
});

test("every bundled sound cue exists, is non-empty, and has source credits", async () => {
  const audioPaths = [...game.matchAll(/\bsrc:\s*(["'])(assets\/audio\/[^"']+\.mp3)\1/g)]
    .map((match) => match[2]);
  const uniqueAudioPaths = [...new Set(audioPaths)];
  assert.equal(audioPaths.length, uniqueAudioPaths.length, "Sound manifest must not repeat files");
  assert.equal(uniqueAudioPaths.length, 14, "Expected the complete local sound set");
  await Promise.all(uniqueAudioPaths.map(assertNonemptyFile));

  const credits = await readFile(fromRoot("assets/audio/CREDITS.md"), "utf8");
  for (const source of ["Freesound", "BigSoundBank", "Kenney", "CC0"]) {
    assert.match(credits, new RegExp(source, "i"), `Sound credits must mention ${source}`);
  }
});

test("every local HTML src/href resolves and every fragment points to an existing id", async () => {
  const references = quotedAttributeReferences(html);
  assert.ok(references.length > 0, "Expected index.html to contain src/href references");

  const localFiles = [];
  for (const { attribute, value } of references) {
    if (value.startsWith("#")) {
      assert.ok(idSet.has(decodeURIComponent(value.slice(1))), `${attribute}="${value}" has no target`);
      continue;
    }

    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
    const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    assert.ok(pathname, `${attribute} must not be empty`);
    const resolved = path.resolve(projectRoot, pathname.replace(/^\//, ""));
    const relative = path.relative(projectRoot, resolved);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), `${value} escapes the project root`);
    localFiles.push(relative);
  }

  assert.ok(localFiles.length >= 4, "Expected stylesheet, script, and Charlie photo references");
  await Promise.all(localFiles.map(assertNonemptyFile));
});

test("the game has no external HTTP(S) runtime dependencies", () => {
  const htmlResources = quotedAttributeReferences(html).map(({ value }) => value);
  const cssResources = [
    ...cssUrlReferences(css),
    ...[...css.matchAll(/@import\s+(["'])(.*?)\1/gi)].map((match) => match[2]),
  ];
  const jsResources = [
    ...game.matchAll(/\b(?:from|import\s*\(|fetch\s*\(|new\s+(?:Worker|Audio)\s*\()\s*(["'])(.*?)\1/g),
  ].map((match) => match[2]);
  const jsRemoteLiterals = [...game.matchAll(/(["'])((?:https?:)?\/\/.*?)\1/gi)].map(
    (match) => match[2],
  );

  const remote = [...htmlResources, ...cssResources, ...jsResources, ...jsRemoteLiterals].filter((value) =>
    /^(?:https?:)?\/\//i.test(value),
  );
  assert.deepEqual(remote, [], `Unexpected remote resources: ${remote.join(", ")}`);
});

test("HTML ids are unique", () => {
  const counts = new Map();
  for (const id of htmlIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([id]) => id);

  assert.ok(htmlIds.length > 0, "Expected index.html to define ids");
  assert.deepEqual(duplicates, [], `Duplicate HTML ids: ${duplicates.join(", ")}`);
});

test("all required UI ids and JavaScript id lookups exist in the DOM", () => {
  const requiredIds = [
    "pageShell",
    "fullscreenButton",
    "gameCanvas",
    "gameInstructions",
    "startScreen",
    "briefingScreen",
    "resultScreen",
    "pauseCurtain",
    "startButton",
    "travelButton",
    "howButton",
    "briefingBack",
    "beginButton",
    "restartButton",
    "resumeButton",
    "immersiveExitButton",
    "classicControlsButton",
    "relaxedToggle",
    "soundToggle",
    "motionToggle",
    "pauseSoundToggle",
    "pauseMotionToggle",
    "pauseButton",
    "timeValue",
    "phaseValue",
    "scoreValue",
    "highScoreValue",
    "safetyValue",
    "patienceValue",
    "comboValue",
    "chickenFill",
    "chickenValue",
    "chickenButton",
    "caption",
    "toast",
    "ownerBubble",
    "announcement",
    "resultPhoto",
    "resultPetCanvas",
    "resultTitle",
    "resultSubtitle",
    "resultScore",
    "resultGuards",
    "resultSwitches",
    "resultBarks",
    "resultCombo",
    "prevWindowButton",
    "nextWindowButton",
    "barkButton",
    "switchFenceButton",
  ];
  const idsLookedUpByGame = [...game.matchAll(/\$\(\s*(["'])(.*?)\1\s*\)/g)].map(
    (match) => match[2],
  );
  const missing = [...new Set([...requiredIds, ...idsLookedUpByGame])].filter((id) => !idSet.has(id));

  assert.ok(idsLookedUpByGame.length > 0, "Expected game.js to look up DOM ids");
  assert.deepEqual(missing, [], `Missing DOM ids: ${missing.join(", ")}`);
});

test("mobile gameplay exposes an accessible full-screen control", () => {
  const shell = openingTagWithId("pageShell");
  assert.match(shell, /\bclass\s*=\s*(["'])[^"']*\bpage-shell\b[^"']*\1/i);

  const button = openingTagWithId("fullscreenButton");
  assert.equal(attributeValue(button, "type"), "button");
  assert.equal(attributeValue(button, "aria-controls"), "pageShell");
  assert.equal(attributeValue(button, "aria-pressed"), "false");
  assert.match(attributeValue(button, "aria-label") ?? "", /enter full.?screen/i);

  const viewport = html.match(/<meta\b[^>]*name=(["'])viewport\1[^>]*>/i)?.[0] ?? "";
  assert.match(attributeValue(viewport, "content") ?? "", /viewport-fit=cover/i);
});

test("full-screen state follows the browser API and has a safe focus-mode fallback", () => {
  assert.match(game, /ui\.pageShell\.requestFullscreen\s*\(/);
  assert.match(game, /document\.exitFullscreen\s*\(/);
  assert.match(game, /document\.fullscreenElement/);
  assert.match(game, /document\.addEventListener\(\s*["']fullscreenchange["']/);
  assert.match(game, /fullscreenButton\.hidden\s*=\s*screen\s*!==\s*["']playing["']/);
  assert.match(game, /document\.addEventListener\(\s*["']webkitfullscreenchange["']/);
  assert.match(game, /fullscreenButton\.setAttribute\(\s*["']aria-pressed["']/);
  assert.match(game, /is-focus-mode/);
  assert.match(css, /\.page-shell:fullscreen/);
  assert.match(css, /\.page-shell\.is-fullscreen-mode/);
  assert.match(css, /\b100dvh\b/);
  assert.match(css, /safe-area-inset-(?:top|right|bottom|left)/);
});

test("phone portrait uses a tall room-focused camera with matching pointer projection", () => {
  assert.match(
    css,
    /@media\s*\(max-width:\s*620px\)\s*and\s*\(orientation:\s*portrait\)[\s\S]*?\.page-shell:not\(\.is-immersive-mode\)[\s\S]*?\.canvas-wrap\s*\{[^}]*\bheight:\s*100%[^}]*\baspect-ratio:\s*auto/s,
  );
  assert.match(
    css,
    /body\[data-screen=["']playing["']\][\s\S]*?#gameCanvas\s*\{[^}]*\bobject-fit:\s*cover/s,
  );
  assert.match(game, /canvasWrap\.dataset\.room\s*=\s*ROOMS\[game\.selectedRoom\]\.id/);
  assert.match(game, /objectFit\s*===\s*["']cover["']\s*\?\s*Math\.max/);
});

test("compact full screen becomes a canvas-only immersive play surface", () => {
  assert.match(game, /function\s+syncImmersiveMode\s*\(/);
  assert.match(game, /classList\.toggle\(\s*["']is-immersive-mode["']/);
  assert.match(
    css,
    /\.page-shell\.is-immersive-mode\s+\.game-panel\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*overflow:\s*hidden/s,
  );
  assert.match(
    css,
    /\.page-shell\.is-immersive-mode\s+\.canvas-wrap\s*\{[^}]*position:\s*(?:fixed|absolute)[^}]*inset:\s*0[^}]*height:\s*100dvh/s,
  );
  for (const selector of [".playbar > :not(.playbar__actions)", ".threat-roster", "#prevWindowButton", "#nextWindowButton", ".game-caption"]) {
    assertCssDeclaration(
      `.page-shell.is-immersive-mode ${selector}`,
      /display:\s*none(?:\s*!important)?/,
      `${selector} must not cover immersive gameplay`,
    );
  }
  for (const selector of [
    ".page-shell.is-fullscreen-mode .toast",
    ".page-shell.is-fullscreen-mode .owner-bubble",
    ".page-shell.is-immersive-mode .toast",
    ".page-shell.is-immersive-mode .owner-bubble",
  ]) {
    assert.ok(
      cssDeclarationsForSelector(selector).every((value) => !/display:\s*none/.test(value)),
      `${selector} must remain available for tactical feedback`,
    );
  }
});

test("immersive controls stay tiny and inside the game screen", () => {
  const v3Css = css.slice(css.indexOf("Minimal Patrol v3"));

  assert.match(
    css,
    /\.page-shell\.is-immersive-mode\s+\.bark-button\s*\{[^}]*position:\s*fixed[^}]*width:\s*(?:2\.\d+|3)rem[^}]*height:\s*(?:2\.\d+|3)rem/s,
  );
  assert.match(
    css,
    /\.page-shell\.is-immersive-mode\s+#pauseButton\s*\{[^}]*position:\s*fixed[^}]*width:\s*(?:2\.\d+|3)rem[^}]*height:\s*(?:2\.\d+|3)rem/s,
  );
  assert.match(
    css,
    /body\[data-screen=["']playing["']\] \.page-shell:not\(\.is-immersive-mode\) \.action-dock \.bark-button/,
    "The normal action rail must not override the immersive Bark position",
  );
  assert.doesNotMatch(
    v3Css,
    /body\[data-screen=["']playing["']\] \.action-dock \.bark-button/,
    "V3 Bark positioning must always exclude immersive mode",
  );
  assertCssDeclaration(
    ".page-shell.is-immersive-mode #fullscreenButton",
    /display:\s*none(?:\s*!important)?/,
  );

  const exitButton = openingTagWithId("immersiveExitButton");
  assert.equal(attributeValue(exitButton, "type"), "button");
  assert.match(elementText("immersiveExitButton"), /exit full screen/i);
  assert.match(game, /immersiveExitButton\.addEventListener\(\s*["']click["']/);
});

test("immersive canvas gestures distinguish taps, swipes, and cancellation", () => {
  for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
    assert.match(game, new RegExp(`canvas\\.addEventListener\\(\\s*["']${eventName}["']`));
  }
  assert.match(game, /setPointerCapture\s*\(/);
  assert.match(game, /function\s+handleImmersiveTap\s*\(/);
  assert.match(game, /function\s+changeFlatWindow\s*\(/);
  assert.match(game, /handleImmersiveTap[\s\S]*?selectWindow\([\s\S]*?bark\(\)/);
  assert.match(game, /maxMovement[\s\S]*?dragged[\s\S]*?!gesture\.dragged/);
  assert.match(game, /otherThumbIsPanning[\s\S]*?resetCanvasGesture\(\)/);
  assert.match(game, /pointercancel[\s\S]*?(?:cancelCanvasGesture|resetCanvasGesture)/);
  assert.match(css, /\.page-shell\.is-immersive-mode\s+#gameCanvas\s*\{[^}]*touch-action:\s*none/s);
});

test("immersive camera follows the selected window and pointer projection", () => {
  assert.match(game, /function\s+syncCanvasCamera\s*\(/);
  assert.match(game, /WINDOWS\[game\.selectedWindow\]\.x/);
  assert.match(game, /canvasWrap\.dataset\.cameraFactor/);
  assert.match(game, /function\s+renderedCanvasCameraFactor[\s\S]*?getComputedStyle\(canvas\)\.objectPosition/);
  assert.match(game, /canvasPoint[\s\S]*?renderedCanvasCameraFactor\(\)/);
  assert.match(css, /object-position:\s*var\(--camera-x/);
});

test("gameplay rendering removes opaque feedback cards from the windows", () => {
  assert.match(game, /function\s+isDeclutteredRendering\s*\(/);
  assert.match(game, /isDeclutteredRendering[\s\S]*?screen\s*===\s*["']playing["']/);
  const drawVisitor = game.match(/function\s+drawVisitor\s*\([\s\S]*?(?=\nfunction\s+)/)?.[0] ?? "";
  assert.match(drawVisitor, /const\s+decluttered\s*=\s*isDeclutteredRendering\(\)/);
  assert.match(drawVisitor, /if\s*\(\s*!decluttered\s*\)\s*\{[\s\S]*?pillWidth/);
  assert.match(game, /drawEffects[\s\S]*?isDeclutteredRendering\(\)/);
  assert.match(game, /drawLegend\(\)[\s\S]*?isDeclutteredRendering\(\)[\s\S]*?return/);
  assert.match(game, /drawListeningState[\s\S]*?isDeclutteredRendering\(\)/);
});

test("starting or replaying a patrol settles the mobile viewport at the game top", () => {
  const startRound = game.match(/function\s+startRound\([^)]*\)\s*\{([\s\S]*?)\n\}\n\nfunction\s+replayCurrentRun/)?.[1] ?? "";
  assert.match(startRound, /window\.scrollTo\(0,\s*0\)/);
  assert.match(startRound, /window\.setTimeout\([\s\S]*?screen\s*===\s*["']playing["'][\s\S]*?window\.scrollTo\(0,\s*0\)/);
});

test("HTML id references used by accessibility attributes resolve", () => {
  const missing = [];
  for (const match of html.matchAll(/\b(aria-controls|aria-describedby|aria-labelledby)\s*=\s*(["'])(.*?)\2/gi)) {
    for (const id of match[3].trim().split(/\s+/)) {
      if (id && !idSet.has(id)) missing.push(`${match[1]} -> ${id}`);
    }
  }
  assert.deepEqual(missing, [], `Broken HTML id references: ${missing.join(", ")}`);
});

test("game.js passes Node's syntax checker", () => {
  const result = spawnSync(process.execPath, ["--check", fromRoot("game.js")], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `node --check game.js failed:\n${result.stderr || result.stdout}`,
  );
});

test("control hints and keyboard implementation agree", () => {
  const expectedShortcuts = new Map([
    ["gameCanvas", "ArrowLeft ArrowRight ArrowUp ArrowDown Space C"],
    ["prevWindowButton", "ArrowLeft"],
    ["nextWindowButton", "ArrowRight"],
    ["barkButton", "Space"],
    ["chickenButton", "C"],
    ["switchFenceButton", "ArrowUp ArrowDown"],
  ]);
  for (const [id, shortcuts] of expectedShortcuts) {
    assert.equal(
      attributeValue(openingTagWithId(id), "aria-keyshortcuts"),
      shortcuts,
      `Unexpected keyboard hint on #${id}`,
    );
  }

  const visibleButtonHints = new Map([
    ["prevWindowButton", /←/],
    ["nextWindowButton", /→/],
    ["barkButton", /\bBark\b.*\bSpace\b/i],
    ["chickenButton", /\bGive treat\b.*\bC\b/i],
    ["switchFenceButton", /\bSwitch to lower fence\b/i],
  ]);
  for (const [id, expectedText] of visibleButtonHints) {
    assert.match(elementText(id), expectedText, `Unexpected visible keyboard hint on #${id}`);
  }

  const visibleKeyboardLegend = new Set(
    [...html.matchAll(/<kbd\b[^>]*>([\s\S]*?)<\/kbd>/gi)].map((match) =>
      match[1].replace(/<[^>]*>/g, "").trim(),
    ),
  );
  for (const key of ["←", "→", "Space", "C"]) {
    assert.ok(visibleKeyboardLegend.has(key), `Visible keyboard legend is missing ${key}`);
  }
  for (const retiredKey of ["A", "D", "Q", "E"]) {
    assert.ok(!visibleKeyboardLegend.has(retiredKey), `Retired keyboard hint is still visible: ${retiredKey}`);
  }

  const instructions = elementText("gameInstructions");
  assert.match(instructions, /Left and Right Arrow to patrol all six windows/i);
  assert.match(instructions, /Space to bark/i);
  assert.match(instructions, /C to give Charlie chicken/i);
  assert.match(instructions, /Up and Down Arrow.*Switch fence.*upper visitor fence.*lower sheep fence/i);

  assert.match(game, /code\s*===\s*["']ArrowLeft["']\)\s*changeFlatWindow\(-1\)/);
  assert.match(game, /code\s*===\s*["']ArrowRight["']\)\s*changeFlatWindow\(1\)/);
  assert.doesNotMatch(game, /["'](?:KeyA|KeyD|KeyQ|KeyE|Digit[123])["']/);
  assert.match(game, /["']ArrowUp["']/);
  assert.match(game, /["']ArrowDown["']/);
  assert.match(game, /code\s*===\s*["']Space["']\)\s*bark\(\)/);
  assert.match(game, /code\s*===\s*["']KeyC["']\)\s*useChicken\(\)/);
});

test("pointer actions return focus to the canvas so keyboard shortcuts keep working", () => {
  assert.match(game, /function\s+restoreCanvasFocusAfterPointer\s*\(event\)/);
  assert.match(game, /event\.detail\s*>\s*0[\s\S]*?canvas\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);
  for (const control of ["prevWindow", "nextWindow", "switchFenceButton", "barkButton", "chickenButton"]) {
    assert.match(
      game,
      new RegExp(`ui\\.${control}\\.addEventListener\\(\\s*["']click["']\\s*,\\s*\\(event\\)`),
      `${control} must distinguish pointer activation from keyboard activation`,
    );
  }
});

test("a cross-room Sneaky Switch keeps its announcement and a tiny canvas cue", () => {
  assert.match(game, /const\s+primedSneakySwitch\s*=\s*target\.room\s*!==\s*previousRoom/);
  assert.match(game, /if\s*\(\s*!primedSneakySwitch\s*\)\s*announce\(`\$\{target\.label\} selected\.`\)/);
  assert.match(game, /const\s+sneakyReady\s*=\s*Boolean\([\s\S]{0,80}?game\.sneaky/);
  assert.match(game, /canvasWrap\.dataset\.sneaky\s*=\s*sneakyReady\s*\?\s*["']ready["']/);
  assert.match(game, /sneakyReady[\s\S]*?createRadialGradient[\s\S]*?#277c76/);
});

test("the v3 play surface has one playbar, one canvas, and one action rail", () => {
  assert.match(html, /class="hud playbar play-chrome"/);
  assert.match(html, /class="action-dock play-chrome"/);
  assert.doesNotMatch(html, /action-dock__group--rooms/);
  assert.doesNotMatch(html, /class="room-tabs/);
  assert.doesNotMatch(html, /class="flat-status/);
  assert.doesNotMatch(html, /class="field-notes/);
  assert.doesNotMatch(html, /class="[^"]*action-dock__group/);
  const actionDock = html.slice(html.indexOf('<div class="action-dock play-chrome"'), html.lastIndexOf("</section>"));
  assert.deepEqual(
    [...actionDock.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
    ["prevWindowButton", "barkButton", "nextWindowButton", "switchFenceButton", "chickenLabel", "chickenValue", "chickenFill", "chickenButton"],
    "Action rail DOM order must match its left-to-right visual order",
  );
  assert.match(openingTagWithId("gameStateSummary"), /\bvisually-hidden\b/);
  assert.match(openingTagWithId("caption"), /\bvisually-hidden\b/, "ambient captions stay screen-reader only");
  for (const id of ["toast", "ownerBubble"]) {
    const tag = openingTagWithId(id);
    assert.doesNotMatch(tag, /\bvisually-hidden\b/, `#${id} must provide visible tactical feedback`);
    assert.match(tag, /\bhidden\b/, `#${id} must appear only while active`);
  }
  assert.match(openingTagWithId("ownerBubble"), /\brole=["']status["']/);
  assert.match(openingTagWithId("ownerBubble"), /\baria-live=["']polite["']/);
  assert.match(css, /body\[data-screen="playing"\][\s\S]*?\.site-header[\s\S]*?display:\s*none/);
  assert.match(css, /\.playbar\s*\{[^}]*grid-template-columns/s);
  assert.match(css, /\.action-dock\s*\{[^}]*grid-template-areas:\s*"prev bark next chicken"/s);
  const pauseMarkup = html.match(/id="pauseCurtain"[\s\S]*?<\/section>/)?.[0] ?? "";
  for (const id of ["phaseValue", "highScoreValue", "currentPatrolLabel", "activeObjective"]) {
    assert.match(pauseMarkup, new RegExp(`id=["']${id}["']`), `#${id} belongs in the pause sheet`);
  }
});

test("Czech Cabin Duty exposes an accessible Travel File entry and cabin-only fence control", () => {
  const travelButton = openingTagWithId("travelButton");
  assert.equal(attributeValue(travelButton, "type"), "button");
  assert.equal(attributeValue(travelButton, "aria-controls"), "patrolBriefingScreen");
  assert.equal(elementText("travelButton"), "Czech cabin duty");

  const switchFenceButton = openingTagWithId("switchFenceButton");
  assert.equal(attributeValue(switchFenceButton, "type"), "button");
  assert.equal(attributeValue(switchFenceButton, "aria-controls"), "gameCanvas");
  assert.equal(attributeValue(switchFenceButton, "aria-keyshortcuts"), "ArrowUp ArrowDown");
  assert.match(attributeValue(switchFenceButton, "aria-label") ?? "", /switch to lower sheep fence/i);
  assert.match(switchFenceButton, /\bhidden\b/);
  assert.match(game, /ui\.travelButton\.addEventListener\(\s*["']click["'][\s\S]{0,180}?mode:\s*["']travel["']/);
  assert.match(game, /ui\.switchFenceButton\.addEventListener\(\s*["']click["'][\s\S]{0,120}?switchFence\(\)/);
  assert.match(game, /document\.body\.dataset\.arena\s*=\s*cabin\s*\?/);
  assert.match(game, /ui\.switchFenceButton\.hidden\s*=\s*!cabin/);
  assert.match(game, /ui\.switchFenceButton\.setAttribute\(\s*["']aria-label["']/);
  assert.match(game, /if\s*\(isCabinRun\(\)\s*&&\s*game\)\s*syncCanvasCamera\(\)/, "Cabin camera survives pause, resume, and full-screen exit");
  assert.match(game, /const collarTag\s*=\s*travelAssignment\s*\?\s*null\s*:/, "Hidden campaign collar tags must not alter Travel File rules");
  assert.match(game, /flockActive:\s*!cabin/, "Sheep must wait for Charlie's first deliberate lower-fence action");
  assert.match(
    game,
    /charlieLane:\s*game\.flockActive\s*&&\s*game\.charlieLane\s*===\s*["']lower["']\s*\?\s*["']sheep["']\s*:\s*["']upper["']/,
    "Cabin updates must not apply invisible starting pressure before the player acts",
  );

  assertCssDeclaration("#switchFenceButton", /display:\s*none/, "Fence switching stays absent from regular patrols");
  assertCssDeclaration(".fence-switch-button", /min-height:\s*2\.75rem/, "Fence switching must remain a 44px touch target");
  assert.match(
    css,
    /body\[data-arena="cabin"\]\[data-screen="playing"\] #switchFenceButton:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex/s,
  );
  assert.match(
    css,
    /body\[data-arena="cabin"\]\[data-screen="playing"\] \.page-shell:not\(\.is-immersive-mode\) \.action-dock\s*\{[^}]*grid-template-areas:\s*"prev bark next fence chicken"/s,
  );
  assert.match(
    css,
    /@media \(max-width: 620px\)[\s\S]*?body\[data-arena="cabin"\]\[data-screen="playing"\][\s\S]*?grid-template-areas:\s*\n\s*"prev bark next chicken"\s*\n\s*"fence fence fence chicken"/,
    "Cabin controls must wrap without shrinking phone touch targets",
  );

  const immersiveCabinCss = cssDeclarationsForSelector(
    'body[data-arena="cabin"][data-screen="playing"] .page-shell.is-immersive-mode #switchFenceButton:not([hidden])',
  ).join("\n");
  assert.match(immersiveCabinCss, /position:\s*fixed/);
  assert.match(immersiveCabinCss, /min-height:\s*2\.75rem/);
  assert.match(immersiveCabinCss, /background:\s*rgba\(/, "Immersive fence switching must not add an opaque gameplay overlay");
  assert.match(
    css,
    /@media \(max-width: 620px\) and \(orientation: portrait\)[\s\S]*?body\[data-arena="cabin"\]\[data-screen="playing"\][\s\S]*?#gameCanvas[\s\S]*?object-fit:\s*cover[\s\S]*?object-position:\s*var\(--camera-x/,
    "Phone portrait must follow the active cabin sector instead of staying on the living-room crop",
  );
});

test("Czech cabin assets use the Travel File cache version", () => {
  assert.match(html, /styles\.css\?v=czech-cabin-v1/);
  assert.match(html, /game\.js\?v=czech-cabin-v1/);
});

test("sound-off shushes always have a compact visual feedback path", () => {
  const triggerWarning = game.match(/function\s+triggerWarning\s*\([^)]*\)\s*\{[\s\S]*?\n\}\n\nfunction\s+syncListeningState/)?.[0] ?? "";
  const visibleAt = triggerWarning.indexOf("ui.ownerBubble.hidden = false");
  const audioAt = triggerWarning.indexOf("playShush(roomIndex)");

  assert.ok(visibleAt >= 0, "a shush must reveal the owner feedback strip");
  assert.ok(audioAt > visibleAt, "visual shush feedback must be ready before audio playback");
  assert.match(triggerWarning, /ownerBubbleTitle\.textContent\s*=\s*[^;]*shush/i);
  assert.match(triggerWarning, /ownerBubbleText\.textContent\s*=\s*`[^`]*\$\{ROOMS\[roomIndex\]\.name\}/);
  assert.doesNotMatch(triggerWarning, /settings\.sound/, "visual shush feedback cannot depend on sound settings");

  assert.match(html, /class=["']feedback-stack["']/);
  assertCssDeclaration(".feedback-stack", /position:\s*absolute/, "feedback must be anchored inside the canvas");
  assertCssDeclaration(".feedback-stack", /bottom:\s*[^;]+/, "feedback must stay below the window band");
  assertCssDeclaration(".feedback-stack", /left:\s*[^;]+/, "feedback must use the unobtrusive lower-left corner");
  assertCssDeclaration(".feedback-stack", /width:\s*min\(18rem,/, "feedback must remain narrowly bounded");
  assertCssDeclaration(".feedback-stack", /pointer-events:\s*none/, "feedback cannot block taps or swipes");
  assertCssDeclaration(".feedback-stack .toast", /max-width:\s*16rem/, "transient messages must stay pill-sized");
  assertCssDeclaration(".feedback-stack .toast", /white-space:\s*nowrap/, "transient messages stay on one line");
  assertCssDeclaration(".feedback-stack .toast", /text-overflow:\s*ellipsis/, "long transient messages cannot grow over play");
  assert.match(game, /setTimeout\(\(\)\s*=>\s*\{\s*ui\.toast\.hidden\s*=\s*true;\s*\},\s*1(?:\d{3})\)/);
});

test("the v3 landscape layout overrides the retired side-dock cascade", () => {
  const v3Css = css.slice(css.indexOf("Minimal Patrol v3"));
  const v3BaseCss = v3Css.slice(0, v3Css.indexOf("@media (max-width: 620px)"));
  const cabinCssAt = v3Css.indexOf("Czech Cabin Travel File");
  const regularV3Css = cabinCssAt >= 0 ? v3Css.slice(0, cabinCssAt) : v3Css;
  const landscapeCss = regularV3Css.slice(regularV3Css.lastIndexOf("@media (orientation: landscape)"));

  assert.match(
    v3Css,
    /@media \(orientation: landscape\) and \(max-height: 620px\)[\s\S]*?body\[data-screen="playing"\] \.page-shell:not\(\.is-immersive-mode\) \.playbar,[\s\S]*?grid-template-columns:/,
  );
  assert.match(
    v3Css,
    /body\[data-screen="playing"\] \.page-shell:not\(\.is-immersive-mode\) \.action-dock,[\s\S]*?grid-template-areas:\s*"prev bark next chicken";[\s\S]*?grid-template-columns:[^;]+;[\s\S]*?grid-template-rows:\s*1fr;/,
  );
  assert.match(
    landscapeCss,
    /\.game-panel\s*\{[^}]*grid-template-rows:\s*2\.8rem minmax\(0, 1fr\) 3\.7rem/,
    "Compact landscape must reserve the action rail's full intrinsic touch-target height",
  );
  assert.match(
    v3BaseCss,
    /body\[data-screen="paused"\] \.pause-patrol \.objective-strip\s*\{[^}]*display:\s*grid/,
    "The pause sheet must retain its patrol objective in landscape",
  );
  assert.match(
    v3BaseCss,
    /body\[data-screen="paused"\] \.pause-settings \.setting-button\s*\{[^}]*display:\s*flex/,
    "Pause settings must override the retired landscape header rule",
  );
  assert.match(
    v3BaseCss,
    /body\[data-screen="paused"\] \.pause-settings \.switch-state\s*\{[^}]*display:\s*inline-block/,
    "Pause setting state labels must survive the retired portrait header rule",
  );
  assert.match(landscapeCss, /\.action-dock \.chicken-control[\s\S]*?padding-block:\s*0/);
  assert.match(
    landscapeCss,
    /\.playbar__actions \.icon-button[\s\S]*?min-width:\s*2\.75rem/,
    "Landscape full-screen and pause actions must remain 44px touch targets",
  );
  assert.match(
    landscapeCss,
    /\.action-dock \.chicken-button[\s\S]*?min-height:\s*2\.75rem/,
    "The landscape Give treat action must remain a 44px touch target",
  );
});

test("the v3 playbar and treat action fit compact 320px phones", () => {
  const v3Css = css.slice(css.indexOf("Minimal Patrol v3"));
  const mobileCss = v3Css.slice(
    v3Css.indexOf("@media (max-width: 620px)"),
    v3Css.indexOf("@media (max-width: 350px)"),
  );

  assert.match(
    mobileCss,
    /\.game-panel,[\s\S]*?grid-template-rows:\s*3\.15rem minmax\(0, 1fr\) 3\.6rem/,
  );
  assert.match(
    mobileCss,
    /\.action-dock,[\s\S]*?margin:\s*0/,
    "The retired mobile dock margin must not steal height from touch targets",
  );
  assert.match(
    mobileCss,
    /\.action-dock \.chicken-button\s*\{[^}]*min-height:\s*2\.75rem/,
    "Give treat must remain a 44px-tall touch target on every phone",
  );
  assert.match(v3Css, /@media \(max-width: 350px\)/);
  assert.match(v3Css, /\.status-chip--score\s*\{[^}]*display:\s*none/);
  assert.match(
    v3Css,
    /@media \(max-width: 350px\)[\s\S]*?\.playbar[\s\S]*?grid-template-columns:\s*2\.7rem minmax\(4\.2rem, 1fr\) minmax\(4\.2rem, 1fr\) auto/,
  );
  assert.match(
    v3Css,
    /@media \(max-width: 350px\)[\s\S]*?\.chicken-button\s*\{[^}]*min-width:\s*2\.75rem[^}]*min-height:\s*2\.75rem/,
    "The compact Give treat action must remain a 44px touch target",
  );
});

test("six windows are assigned to Office, Living room, and Kitchen as 1/3/2", () => {
  const windowsBlock = game.match(/const\s+WINDOWS\s*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(windowsBlock, "Expected a WINDOWS definition");
  const windows = [...windowsBlock[1].matchAll(/\{\s*id:\s*(\d+)\s*,\s*room:\s*(\d+)\b/g)].map(
    (match) => ({ id: Number(match[1]), room: Number(match[2]) }),
  );
  assert.deepEqual(windows, [
    { id: 0, room: 0 },
    { id: 1, room: 1 },
    { id: 2, room: 1 },
    { id: 3, room: 1 },
    { id: 4, room: 2 },
    { id: 5, room: 2 },
  ]);

  const roomsBlock = game.match(/const\s+ROOMS\s*=\s*\[([\s\S]*?)\n\];/);
  assert.ok(roomsBlock, "Expected a ROOMS definition");
  const roomWindows = new Map(
    [...roomsBlock[1].matchAll(/\{\s*id:\s*["']([^"']+)["'][\s\S]*?windows:\s*\[([^\]]*)\][\s\S]*?\}/g)].map(
      (match) => [
        match[1],
        [...match[2].matchAll(/\d+/g)].map((item) => Number(item[0])),
      ],
    ),
  );
  assert.deepEqual(Object.fromEntries(roomWindows), {
    office: [0],
    living: [1, 2, 3],
    kitchen: [4, 5],
  });

});

test("menu layers suppress the gameplay chrome before the canvas", () => {
  assert.match(
    game,
    /document\.body\.dataset\.screen\s*=\s*screen/,
    "setLayer must expose the active screen to responsive CSS",
  );
  for (const selector of [".hud", ".objective-strip", ".room-tabs"]) {
    assert.match(
      css,
      new RegExp(`\\[data-screen=["']title["']\\][^}]*${escapeRegExp(selector)}`),
      `Title layout must hide ${selector} so the primary menu is not pushed below mobile gameplay chrome`,
    );
  }
});

test("the result replay action is bound to the completed run", () => {
  assert.match(game, /function\s+replayCurrentRun\s*\(/);
  assert.match(
    game,
    /ui\.restartButton\.addEventListener\(\s*["']click["']\s*,\s*replayCurrentRun\s*\)/,
    "Patrol again must not restart the mutable campaign continuation in pendingRun",
  );
});

test("every covered bark during Listening records exactly one Perfect Crime", () => {
  const coveredBranch = game.match(
    /if\s*\(listeningHere\s*&&\s*audibility\.classification\s*===\s*AUDIBILITY\.COVERED\)\s*\{([\s\S]*?)\n\s*\}/,
  );
  assert.ok(coveredBranch, "Expected the covered Listening branch in bark()");
  assert.match(coveredBranch[1], /game\.perfectCrimes\s*\+=\s*1/);
  assert.equal(
    [...game.matchAll(/game\.perfectCrimes\s*\+=\s*1/g)].length,
    1,
    "A Perfect Crime must be counted at the bark, not counted again on the final hit",
  );
});

test("an authored visitor type cannot randomly cross the friend-threat boundary", () => {
  assert.ok(game.includes("const typedFriend = FRIENDS.some"), "Explicit friendly visitor types must be recognised");
  assert.ok(game.includes("const typedThreat = THREATS.some"), "Explicit threat visitor types must be recognised");
  assert.ok(
    game.includes("typedFriend ? true : typedThreat ? false"),
    "Random friendliness must only apply to untyped filler visitors",
  );
});

test("the modal keyboard loop includes native collar-tag controls", () => {
  assert.ok(
    game.includes("input:not(:disabled)"),
    "Tab trapping must include enabled radio inputs in the collar-tag selector",
  );
});

test("Patrol Book can return to the result screen that opened it", () => {
  assert.ok(game.includes("let patrolBookReturn"));
  assert.ok(game.includes('openPatrolBook({ returnTo: "result" })'));
  assert.ok(game.includes('patrolBookReturn === "result"'));
});

test("runtime Patrol Book classes all have matching styles", () => {
  for (const className of ["gallery-reward", "gallery-reward__seal", "patrol-card__state"]) {
    assert.ok(css.includes(`.${className}`), `styles.css is missing .${className}`);
  }
});

test("a completed campaign replays from Case 01", () => {
  assert.ok(game.includes("const campaignComplete"));
  assert.ok(
    game.includes("campaignComplete ? PATROLS[0]"),
    "The Replay campaign title action must not fall back to the final cleared case",
  );
});

test("patrol briefing back copy matches its actual destination", () => {
  assert.ok(game.includes("ui.patrolBriefingBack.textContent"));
  assert.ok(game.includes('ui.patrolBriefingBack.setAttribute("aria-label"'));
});

test("the HUD and reports expose mode-specific retention records", () => {
  assert.ok(idSet.has("bestLabel"));
  assert.ok(game.includes("function displayedRecord"));
  assert.ok(game.includes("profile.daily.bestByDate"));
  assert.ok(game.includes("profile.lifetime.byMode.endless.longestSeconds"));
  assert.ok(game.includes("if (classic.runs === 0)"));
  assert.ok(!game.includes("Math.max(profile.lifetime.byMode.classic.bestScore, bestScore)"));
  assert.doesNotMatch(game, /Czesia/);
});

test("Special Delivery doorbells provide their declared bark cover", () => {
  const specialDelivery = PATROLS.find((patrol) => patrol.id === "special-delivery");
  assert.equal(specialDelivery?.roomConditions.doorbell?.attentionCoverCharges, 1);
  assert.ok(game.includes("attentionCoverCharges"));
  assert.ok(game.includes('source: "doorbell"'));
});

test("non-campaign results return to the actual campaign resume case", () => {
  assert.ok(game.includes("function campaignResumePatrol"));
  assert.ok(
    game.includes("campaignResumePatrol(snapshot).id"),
    "Result navigation must not reinterpret the Daily patrol as a campaign case",
  );
});

test("end-of-patrol audio distinguishes success from failure", () => {
  assert.ok(game.includes("if (success) playSuccess();"));
  assert.ok(game.includes("else playAlert(game.selectedWindow);"));
});

test("delayed owner follow targets Charlie's current room", () => {
  const followBlock = game.match(/if\s*\(game\.ownerFollow[\s\S]*?\n\s*\}/)?.[0] ?? "";
  assert.ok(followBlock.includes("const roomId = game.selectedRoom"));
});

test("expired sound-cover charges disappear before the next bark", () => {
  assert.ok(
    game.includes("room.cover.expiresAt > 0 && game.elapsed >= room.cover.expiresAt"),
    "The HUD must not advertise an expired doorbell, TV, or kettle cover charge",
  );
});

test("visitor behavior feedback survives the generic remaining-HP branch", () => {
  assert.ok(game.includes("let behaviorFeedback = null"));
  assert.ok(game.includes("if (behaviorFeedback)"));
});

test("result rank copy names the actual next or final rank", () => {
  for (const id of ["resultRankLabel", "resultRankTitle"]) assert.ok(idSet.has(id));
  assert.ok(game.includes("ui.resultRankTitle.textContent"));
});

test("Charlie's validated v2 pet atlas is the only runtime dog sprite", async () => {
  const sprite = "assets/pets/charlie/spritesheet-v2-46865c3d5305.webp";
  assert.match(
    game,
    new RegExp(`dogImage\\.src\\s*=\\s*(["'])${escapeRegExp(sprite)}\\1`),
    "game.js must load Charlie's content-hashed v2 pet atlas",
  );
  assert.doesNotMatch(game, /assets\/generated\/charlie-sprite\.png/);
  const bytes = await readFile(fromRoot(sprite));
  assert.equal(bytes.byteLength, 2_157_006);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "46865c3d53054717801320584d08818abfd49a6385cbe21ab42d27796504ad17",
  );
});

test("the renderer exposes the active pet animation without mirroring authored rows", () => {
  assert.match(game, /canvasWrap\.dataset\.petAnimation/);
  assert.match(game, /canvasWrap\.dataset\.petFrame/);
  assert.doesNotMatch(game, /ctx\.scale\(game\.facing,\s*1\)/);
  assert.match(game, /function drawResultPet\(\)/);
  assert.match(css, /\.result-card__pet\s*\{[^}]*position:\s*absolute/s);
});

test("all four Charlie photo assets are present and referenced", async () => {
  const expectedPhotos = [
    "assets/photos/charlie-bark.jpg",
    "assets/photos/charlie-caught.jpg",
    "assets/photos/charlie-hero.jpg",
    "assets/photos/charlie-rest.jpg",
  ];
  const referencedPhotos = new Set(
    [...`${html}\n${game}`.matchAll(/(["'])(assets\/photos\/charlie-[a-z-]+\.jpg)\1/g)].map(
      (match) => match[2],
    ),
  );

  const missingPhotos = expectedPhotos.filter((photo) => !referencedPhotos.has(photo));
  assert.deepEqual(missingPhotos, [], `Unreferenced Charlie photos: ${missingPhotos.join(", ")}`);
  await Promise.all([...referencedPhotos].map(assertNonemptyFile));
});

test("content-rich menu screens grow the game frame instead of clipping inside it", () => {
  assert.match(
    css,
    /\.canvas-wrap:not\(\.game-active\)\s*\{[^}]*\baspect-ratio:\s*auto\s*;/s,
    "Non-game screens must not be trapped inside the gameplay aspect ratio",
  );
  assert.match(
    css,
    /\.canvas-wrap:not\(\.game-active\)\s*>\s*\.screen-layer:not\(\[hidden\]\)\s*\{[^}]*\bposition:\s*relative\s*;[^}]*\boverflow:\s*visible\s*;/s,
    "The active menu layer must participate in layout and expose all of its content",
  );
  assert.match(
    css,
    /\.canvas-wrap:not\(\.game-active\)[\s\S]*?\.result-card\s*\{[^}]*\bheight:\s*auto\s*;[^}]*\bmax-height:\s*none\s*;/s,
    "The report card must be allowed to grow with its v2 rows",
  );
});

test("the long relaxed-mode phase label lives in the on-demand pause summary", () => {
  assert.match(html, /class="status-chip status-chip--phase"[\s\S]*?id="phaseValue"/);
  const pauseMarkup = html.match(/id="pauseCurtain"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(pauseMarkup, /id="phaseValue"/);
  assert.match(css, /\.pause-patrol[\s\S]*?overflow-wrap:\s*anywhere/);
});

test("opening a modal starts at its top and result focus cannot scroll to the action row", () => {
  assert.match(
    game,
    /const\s+activeLayer\s*=\s*layers\[name\][\s\S]*?activeLayer\.scrollTop\s*=\s*0\s*;/,
    "Newly opened layers must discard stale internal scroll positions",
  );
  assert.match(
    game,
    /ui\.result\.focus\(\{\s*preventScroll:\s*true\s*\}\)/,
    "The report dialog should receive focus without moving its content",
  );
  assert.doesNotMatch(
    game,
    /ui\.restartButton\.focus\(/,
    "Focusing the bottom action on open silently scrolls and clips the report heading",
  );
});

test("every authored visitor has a distinct approaching-window illustration", () => {
  const artBlock = game.match(/function\s+drawApproachArt\s*\([\s\S]*?(?=\nfunction\s+drawVisitor)/)?.[0] ?? "";
  assert.ok(artBlock, "Expected a dedicated approaching-window illustration renderer");
  for (const visitorType of [
    "squirrel", "pigeon", "robot", "pirate", "leaves", "coat",
    "neighbour", "walker", "postie", "cleaner",
  ]) {
    assert.match(
      artBlock,
      new RegExp(`case\\s+["']${visitorType}["']`),
      `Missing approaching-window art for ${visitorType}`,
    );
  }
});
