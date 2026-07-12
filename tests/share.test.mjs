import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

test("the no-terminal share artifacts build from the current source tree", async () => {
  const result = spawnSync("bun", ["scripts/build-share.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const standalonePath = join(dist, "Charlie-Window-Watch.html");
  const standalone = await readFile(standalonePath, "utf8");
  const standaloneSize = (await stat(standalonePath)).size;
  assert.ok(standaloneSize > 3_800_000 && standaloneSize < 5_200_000, `Unexpected standalone size: ${standaloneSize}`);
  assert.doesNotMatch(standalone, /<script[^>]+src=/i);
  assert.doesNotMatch(standalone, /<link[^>]+rel=["']stylesheet/i);
  assert.doesNotMatch(standalone, /type=["']module["']/i);
  assert.doesNotMatch(standalone, /assets\//);
  assert.doesNotMatch(standalone, /\b(?:src|href)=["']https?:/i);
  assert.equal((standalone.match(/data:audio\/mpeg;base64,/g) ?? []).length, 14);
  assert.equal((standalone.match(/data:image\/webp;base64,/g) ?? []).length, 1);
  assert.equal((standalone.match(/"a\d+":"data:/g) ?? []).length, 19);
  assert.match(standalone, /globalThis\.__CHARLIE_ASSETS__/);
  assert.match(standalone, /window\.CharlieGuard\s*=/);
  assert.match(standalone, /id="fullscreenButton"/);
  assert.match(standalone, /\.requestFullscreen\s*\(/);
  assert.match(standalone, /\.page-shell:fullscreen/);

  const siteIndex = await readFile(join(dist, "site/index.html"), "utf8");
  assert.match(siteIndex, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(siteIndex, /styles\.css\?v=czech-cabin-v1/);
  assert.match(siteIndex, /game\.js\?v=czech-cabin-v1/);
  assert.doesNotMatch(siteIndex, /mobile-guard-v\d/);
  assert.doesNotMatch(siteIndex, /charlie-pet-v2-2/);
  assert.match(siteIndex, /id="fullscreenButton"/);
  assert.match(await readFile(join(dist, "site/styles.css"), "utf8"), /\.page-shell:fullscreen/);
  const siteGame = await readFile(join(dist, "site/game.js"), "utf8");
  assert.match(siteGame, /\.requestFullscreen\s*\(/);
  assert.match(siteGame, /is-immersive-mode/);
  assert.match(standalone, /is-immersive-mode/);
  assert.ok((await stat(join(dist, "site/pet-animation.js"))).size > 0);
  assert.ok((await stat(join(dist, "site/herding.js"))).size > 0);
  const atlasPath = join(dist, "site/assets/pets/charlie/spritesheet-v2-46865c3d5305.webp");
  const atlas = await readFile(atlasPath);
  assert.equal(atlas.byteLength, 2_157_006);
  assert.equal(
    createHash("sha256").update(atlas).digest("hex"),
    "46865c3d53054717801320584d08818abfd49a6385cbe21ab42d27796504ad17",
  );
  assert.equal(
    spawnSync("/usr/bin/unzip", ["-Z1", join(dist, "charlie-window-watch-site.zip")], { encoding: "utf8" })
      .stdout.includes("assets/generated/charlie-sprite.png"),
    false,
    "The share ZIP must not retain the retired static Charlie sprite",
  );
  assert.ok((await stat(join(dist, "site/assets/photos/charlie-hero.jpg"))).size > 0);
  assert.ok((await stat(join(dist, "site/assets/audio/shush-1.mp3"))).size > 0);
  assert.ok((await stat(join(dist, "charlie-window-watch-site.zip"))).size > 0);
});
