import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, "dist");
const siteDir = join(distDir, "site");
const standalonePath = join(distDir, "Charlie-Window-Watch.html");
const siteZipPath = join(distDir, "charlie-window-watch-site.zip");

const sourceFiles = [
  "index.html",
  "styles.css",
  "game.js",
  "pet-animation.js",
  "content.js",
  "events.js",
  "profile.js",
  "progression.js",
  "systems.js",
  "herding.js",
];

const mimeTypes = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
};

function extension(path) {
  return path.slice(path.lastIndexOf(".")).toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addNoIndex(html) {
  if (html.includes('name="robots"')) return html;
  return html.replace(
    /(<meta name="description"[^>]*>)/,
    '$1\n    <meta name="robots" content="noindex, nofollow, noarchive">',
  );
}

function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label}; found ${matches.length}.`);
  }
  return source.replace(pattern, replacement);
}

function replaceJavaScriptAsset(code, assetPath, expression) {
  let replacements = 0;
  for (const quote of ['"', "'", "`"]) {
    const needle = `${quote}${assetPath}${quote}`;
    const parts = code.split(needle);
    replacements += parts.length - 1;
    code = parts.join(expression);
  }
  if (replacements === 0) {
    throw new Error(`Bundled JavaScript did not contain ${assetPath}.`);
  }
  return code;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

await rm(distDir, { force: true, recursive: true });
await mkdir(siteDir, { recursive: true });

const sources = Object.fromEntries(
  await Promise.all(sourceFiles.map(async (path) => [path, await readFile(join(root, path), "utf8")])),
);

const assetMatches = sourceFiles.flatMap((path) =>
  [...sources[path].matchAll(/assets\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp|mp3)/gi)].map((match) => match[0]),
);
const assetPaths = [...new Set(assetMatches)].sort();
if (assetPaths.length !== 19) {
  throw new Error(`Expected the 19 runtime assets used by the current game; found ${assetPaths.length}.`);
}

const assetEntries = [];
for (const [index, assetPath] of assetPaths.entries()) {
  const bytes = await readFile(join(root, assetPath));
  const mime = mimeTypes[extension(assetPath)];
  if (!mime) throw new Error(`No MIME type configured for ${assetPath}.`);
  assetEntries.push({
    key: `a${index}`,
    path: assetPath,
    dataUri: `data:${mime};base64,${bytes.toString("base64")}`,
    sha256: sha256(bytes),
    size: bytes.byteLength,
  });
}

const build = await Bun.build({
  entrypoints: [join(root, "game.js")],
  format: "iife",
  minify: false,
  target: "browser",
  write: false,
});
if (!build.success || build.outputs.length !== 1) {
  const details = build.logs.map((log) => String(log)).join("\n");
  throw new Error(`Could not bundle the browser game.\n${details}`);
}

let bundledGame = await build.outputs[0].text();
for (const asset of assetEntries) {
  bundledGame = replaceJavaScriptAsset(
    bundledGame,
    asset.path,
    `globalThis.__CHARLIE_ASSETS__.${asset.key}`,
  );
}
bundledGame = bundledGame.replaceAll("</script", "<\\/script");

let standalone = addNoIndex(sources["index.html"]);
standalone = replaceOnce(
  standalone,
  /\s*<link rel="stylesheet" href="styles\.css[^\"]*">/,
  `\n    <style>\n${sources["styles.css"].replaceAll("</style", "<\\/style")}\n    </style>`,
  "stylesheet link",
);
standalone = replaceOnce(
  standalone,
  /\s*<script src="game\.js[^\"]*" type="module"><\/script>/,
  "",
  "module script",
);

for (const asset of assetEntries) {
  const doubleQuoted = new RegExp(`src="${escapeRegExp(asset.path)}"`, "g");
  const singleQuoted = new RegExp(`src='${escapeRegExp(asset.path)}'`, "g");
  standalone = standalone
    .replace(doubleQuoted, `data-charlie-asset="${asset.key}"`)
    .replace(singleQuoted, `data-charlie-asset="${asset.key}"`);
}

const assetMap = Object.fromEntries(assetEntries.map(({ key, dataUri }) => [key, dataUri]));
const bootstrap = `
    <script>
      /* Generated share build: every photo, sprite and sound is embedded below exactly once. */
      globalThis.__CHARLIE_ASSETS__ = Object.freeze(${JSON.stringify(assetMap)});
      document.querySelectorAll("[data-charlie-asset]").forEach((element) => {
        element.src = globalThis.__CHARLIE_ASSETS__[element.dataset.charlieAsset];
      });
    <\/script>
    <script>
${bundledGame}
    <\/script>
`;
standalone = replaceOnce(standalone, /\s*<\/body>/, `${bootstrap}  </body>`, "closing body tag");

if (/\b(?:src|href)=["'](?:https?:|assets\/)/i.test(standalone)) {
  throw new Error("Standalone output still contains an external runtime reference.");
}
if (standalone.includes("type=\"module\"") || standalone.includes("assets/")) {
  throw new Error("Standalone output still depends on modules or the assets directory.");
}
await writeFile(standalonePath, standalone);

for (const path of sourceFiles) {
  if (path === "index.html") {
    await writeFile(join(siteDir, path), addNoIndex(sources[path]));
  } else {
    await cp(join(root, path), join(siteDir, path));
  }
}
for (const asset of assetEntries) {
  const outputPath = join(siteDir, asset.path);
  await mkdir(dirname(outputPath), { recursive: true });
  await cp(join(root, asset.path), outputPath);
}
await mkdir(join(siteDir, "assets/audio"), { recursive: true });
await cp(join(root, "assets/audio/CREDITS.md"), join(siteDir, "assets/audio/CREDITS.md"));
await writeFile(join(siteDir, ".nojekyll"), "");
await writeFile(join(siteDir, "robots.txt"), "User-agent: *\nDisallow: /\n");

const instructions = `CHARLIE: WINDOW WATCH — SHARE PACKAGE

Best experience
---------------
Send the HTTPS game link once the site has been published. It works in a normal
phone or desktop browser and keeps progress for that browser.

Private computer fallback
-------------------------
Send Charlie-Window-Watch.html. On a personal computer, save it and double-click
it; no terminal or installation is needed. Phone mail/file previews and managed
work computers sometimes block active HTML attachments, so the link is more
dependable. Local-file progress can be tied to the exact filename and location.

Hosting package
---------------
charlie-window-watch-site.zip contains the static site ready for a web host.
The site asks search engines not to index it, but that is not access control:
anyone who receives the final URL can open the game and its four Charlie photos.
`;
await writeFile(join(distDir, "README.txt"), instructions);

const manifest = {
  assetCount: assetEntries.length,
  audioCount: assetEntries.filter(({ path }) => path.endsWith(".mp3")).length,
  assets: assetEntries.map(({ dataUri: _dataUri, ...asset }) => asset),
  source: sourceFiles.map((path) => ({
    path,
    sha256: sha256(Buffer.from(sources[path])),
  })),
};
await writeFile(join(distDir, "share-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

await rm(siteZipPath, { force: true });
const zip = Bun.spawn(["/usr/bin/zip", "-X", "-q", "-r", siteZipPath, "."], {
  cwd: siteDir,
  stderr: "pipe",
  stdout: "pipe",
});
const zipExit = await zip.exited;
if (zipExit !== 0) {
  throw new Error(`Could not create site ZIP: ${await new Response(zip.stderr).text()}`);
}

const standaloneSize = (await readFile(standalonePath)).byteLength;
const zipSize = (await readFile(siteZipPath)).byteLength;
console.log(`Built ${relative(root, standalonePath)} (${standaloneSize.toLocaleString()} bytes)`);
console.log(`Built ${relative(root, siteZipPath)} (${zipSize.toLocaleString()} bytes)`);
console.log(`Embedded ${assetEntries.length} assets, including ${manifest.audioCount} sounds.`);
