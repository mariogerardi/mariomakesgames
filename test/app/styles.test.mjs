import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repositoryRoot } from "../../src/support/paths.mjs";

const gameIds = [
  "syllabl",
  "rarity",
  "gridl",
  "expl41n",
  "before-after",
  "decode",
  "token",
  "dual",
];

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function topLevelCommaParts(value) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") depth = Math.max(0, depth - 1);
    else if (value[index] === "," && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function animationReferences(styles) {
  const names = new Set();
  for (const match of styles.matchAll(/\banimation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of topLevelCommaParts(match[1])) {
      const name = part.trim().match(/^([a-zA-Z_][\w-]*)/)?.[1];
      if (name && name !== "none") names.add(name);
    }
  }
  return names;
}

function keyframeDefinitions(styles) {
  return new Set(
    [...styles.matchAll(/@keyframes\s+([a-zA-Z_][\w-]*)/g)].map((match) => match[1]),
  );
}

test("each route stylesheet context owns every animation it invokes", () => {
  const shared = ["app/styles/fonts.css", "app/styles/base.css", "app/styles/shell.css"]
    .map(read)
    .join("\n");
  const contexts = {
    hub: `${shared}\n${read("app/styles/hub.css")}`,
    ...Object.fromEntries(
      gameIds.map((id) => [id, `${shared}\n${read(`src/games/${id}/${id}.css`)}`]),
    ),
  };

  for (const [name, styles] of Object.entries(contexts)) {
    const definitions = keyframeDefinitions(styles);
    for (const animation of animationReferences(styles)) {
      assert.ok(definitions.has(animation), `${name} references missing @keyframes ${animation}`);
    }
  }
});

test("Hub and game styles remain route-scoped", () => {
  const hubStyles = read("app/styles/hub.css");
  assert.doesNotMatch(hubStyles, /\.site-frame\[data-game|\.game-local-bar--/);

  for (const id of gameIds) {
    const gameStyles = read(`src/games/${id}/${id}.css`);
    assert.doesNotMatch(
      gameStyles,
      /hero-marquee|preview-card|\.game-card\[data-game|collection-mark|card-wordmark/,
      `${id} contains Hub-only styling`,
    );
  }
});

test("every optimized Hub asset referenced by a presentation exists", () => {
  const presentations = gameIds
    .map((id) => read(`src/games/${id}/hub.tsx`))
    .join("\n");
  for (const match of presentations.matchAll(/src="(\/hub\/[^\"]+)"/g)) {
    assert.ok(
      fs.existsSync(path.join(repositoryRoot, "public", match[1])),
      `missing Hub asset ${match[1]}`,
    );
  }
});
