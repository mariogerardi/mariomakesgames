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

test("site header and game screens share one responsive outer boundary", () => {
  const globals = read("app/globals.css");
  const shell = read("app/styles/shell.css");
  const layout = read("app/styles/game-layout.css");
  assert.match(globals, /styles\/game-layout\.css/);
  assert.match(shell, /--site-content-max: 1180px/);
  assert.match(shell, /\.page-width \{\s*width: var\(--site-content-width\)/);
  assert.match(layout, /padding-inline: var\(--site-edge\)/);
  assert.doesNotMatch(layout, /game-canvas-back|\+ 102px|\+ 92px/);
  for (const game of ["syllabl", "rarity", "before-after", "decode", "token", "dual"]) {
    assert.ok(layout.includes(`data-game="${game}"`), `shared screen bounds omit ${game}`);
  }
  assert.match(layout, /Backgrounds stay full bleed/);
  assert.doesNotMatch(layout, /result-modal|results-backdrop|celebration/);
});

test("DUAL menu cards have no grid lines and both wordmarks have no artificial split gap", () => {
  const css = read("src/games/dual/dual.css");
  const grid = css.match(/\.dual-menu-secondary \{([^}]+)\}/)[1];
  const card = css.match(/\.dual-menu-secondary button \{([^}]+)\}/)[1];
  assert.doesNotMatch(grid, /border/);
  assert.match(grid, /gap: 0/);
  assert.match(grid, /grid-template-columns: 1fr 1fr/);
  assert.doesNotMatch(css, /dual-menu-archive/);
  assert.doesNotMatch(card, /border-(?:top|right|bottom|left)/);
  assert.match(card, /border: 0/);
  for (const [source, wordmark] of [[css, "dual-wordmark"], [read("app/styles/hub.css"), "dual-card-wordmark"]]) {
    for (const child of ["span", "b"]) {
      const rule = source.match(new RegExp(`\\.${wordmark} > ${child} \\{([^}]+)\\}`))[1];
      assert.doesNotMatch(rule, /padding|margin/);
    }
  }
});

test("DUAL menu uses a consistent tile flip while its wordmark mirrors both sides", () => {
  const css = read("src/games/dual/dual.css");
  const menuMotion = css.slice(css.indexOf("/* DUAL menu, archive, and settings */"), css.indexOf(".dual-menu,\n.dual-library-view"));
  assert.match(menuMotion, /rotateY\(var\(--dual-enter-angle\)\)/);
  assert.match(menuMotion, /--dual-enter-angle: -32deg/);
  assert.match(menuMotion, /\.dual-menu-secondary > button \{[\s\S]*?transform-origin: center/);
  assert.doesNotMatch(menuMotion, /\.dual-menu-secondary > button:nth-child\(even\)/);
  assert.match(menuMotion, /:nth-child\(3\) \{ animation-delay: 185ms/);
  assert.match(menuMotion, /var\(--dual-enter-duration\) var\(--dual-enter-ease\)/);
  assert.doesNotMatch(menuMotion, /--dual-hover-angle|translateY\(-2px\)/);
  assert.match(menuMotion, /\.dual-menu-options button \{\s*transition: none/);
  assert.match(menuMotion, /animation: dual-menu-fade 120ms/);
  assert.match(menuMotion, /animation-delay: 0ms;\s*transform: none/);
  assert.doesNotMatch(menuMotion, /game-local-bar|rotateX|180deg|infinite/);
});

test("progress restoration preserves the direct-child flat game shell", () => {
  const provider = read("src/platform/game-progress-provider.tsx");
  assert.match(provider, /return <Fragment key=/);
  assert.doesNotMatch(provider, /className="game-progress-content"/);
  assert.doesNotMatch(provider, /<p className="game-resume-loading"/);
  const shell = read("app/styles/shell.css");
  assert.match(shell, /\.game-resume-loading\s*\{[^}]*min-height: var\(--game-room-height\)/);
  for (const [id, color] of [["syllabl", "#e6e6e6"], ["rarity", "#f4ede5"], ["decode", "#090b10"]]) {
    assert.ok(shell.includes(`.site-frame[data-game="${id}"] { --game-canvas: ${color}; }`));
    const game = read(`src/games/${id}/${id}.css`);
    const colors = [...game.matchAll(/--game-canvas:\s*([^;]+);/g)].map((match) => match[1]);
    assert.deepEqual(colors, [color]);
  }
});

test("game loading and DECODE automatic focus do not animate page scrolling", () => {
  const shell = read("app/styles/shell.css");
  assert.match(shell, /html:has\(\.site-frame\[data-game\]\)\s*\{ scroll-behavior: auto;/);
  assert.match(shell, /\.game-canvas\s*\{[^}]*overflow-anchor: none/);
  const decode = read("src/games/decode/decode-game.tsx");
  assert.doesNotMatch(decode, /requestAnimationFrame\(\(\) => \w+\.current\?\.focus\(\)/);
  assert.match(decode, /inputRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
});

test("routine saves are silent and noncritical sync warnings wait before appearing", () => {
  const provider = read("src/platform/game-progress-provider.tsx");
  assert.doesNotMatch(provider, /Saved to account|Saving…|setDismissedCount/);
  assert.match(provider, /setTimeout\(\(\) => setSettledStatus\(warning\), 8000\)/);
  assert.match(provider, /settledStatus !== warning/);
  assert.match(provider, /aria-label="Dismiss sync notice"/);
});

test("DECODE menu content centers in the remaining room and its letters bounce only on entrance", () => {
  const css = read("src/games/decode/decode.css");
  assert.match(css, /\.decode-game-card\[data-view="menu"\] \{\s*display: flex;\s*flex-direction: column/);
  assert.match(css, /\.decode-game-card\[data-view="menu"\] > \.decode-welcome \{\s*flex: 1;\s*min-height: 0;\s*align-content: center/);
  assert.match(css, /\.decode-welcome \.decode-home-wordmark > span \{\s*animation: decode-letter-arrive 680ms/);
  assert.match(css, /span:nth-child\(6\) \{ animation-delay: 400ms/);
  assert.match(css, /\.decode-welcome \.decode-home-wordmark > span,\s*\.decode-mode-cards > button \{ animation: none/);
});

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
