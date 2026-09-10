import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { repositoryRoot } from "../../src/support/paths.mjs";

// Render the real components before effects/network work. No browser or extra test runtime.
const bundle = await build({
  stdin: { contents: `
    export { SyllablGame } from './src/games/syllabl/syllabl-game';
    export { RarityGame } from './src/games/rarity/rarity-game';
    export { BeforeAfterGame } from './src/games/before-after/before-after-game';
    export { DecodeGame } from './src/games/decode/decode-game';
    export { TokenGame } from './src/games/token/token-game';
    export { DualGame } from './src/games/dual/dual-game';
    export { GameThemeProvider } from './src/platform/game-theme-provider';
    export { validGameTheme, themeBootstrap } from './src/platform/game-theme';
    export { resolveGameRouteState } from './src/games/route-state';
    export { AuthProvider } from './src/app-shell/auth-provider';
    export { GameProgressProvider, GameProgressBoundary, SaveStatus } from './src/platform/game-progress-provider';
  `, resolveDir: repositoryRoot },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
  loader: { ".css": "empty" }, logLevel: "silent",
  plugins: [{ name: "css-module-ssr", setup(builder) {
    builder.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default { root: "rarity-root" };', loader: "js" }));
  } }],
  define: {
    "process.env.NEXT_PUBLIC_API_BASE_URL": '"https://example.invalid"',
    "process.env.NEXT_PUBLIC_COGNITO_DOMAIN": '"https://example.invalid"',
    "process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID": '"test-client"',
  },
});
const compiled = { exports: {} };
const require = createRequire(import.meta.url);
// Match the app bundler's default-export interop for Next's CommonJS Image entry.
const requireComponent = (id) => id === "next/image" ? require(id).default : require(id);
new Function("require", "module", "exports", bundle.outputFiles[0].text)(requireComponent, compiled, compiled.exports);
const { SyllablGame, RarityGame, BeforeAfterGame, DecodeGame, TokenGame, DualGame, AuthProvider, GameProgressProvider, GameProgressBoundary, resolveGameRouteState } = compiled.exports;
const games = { syllabl: SyllablGame, rarity: RarityGame, "before-after": BeforeAfterGame, decode: DecodeGame, token: TokenGame, dual: DualGame };
const render = (eagerShell, gameId = "syllabl", gameProps = {}) => renderToStaticMarkup(h(AuthProvider, null,
  h(GameProgressProvider, null, h(GameProgressBoundary, { gameId, eagerShell }, h(games[gameId], gameProps)))));

test("save notifications skip routine writes, retain failures, and delay transient warnings", () => {
  const notice = (status, owner = "player") => renderToStaticMarkup(h(compiled.exports.SaveStatus, {
    owner, state: { status, pending: 1, conflicts: [], savedCount: 15 },
  }));
  for (const status of ["saved", "saving", "pending", "offline", "auth-required", "conflict"]) assert.equal(notice(status), "");
  assert.match(notice("storage-error", null), /role="alert"/);
  assert.match(notice("rejected"), /device copy retained/);
});

test("saved game palettes are present in server HTML, with allowlisted legacy migration", () => {
  const { GameThemeProvider, validGameTheme, themeBootstrap } = compiled.exports;
  for (const [game, theme, attribute] of [["syllabl", "dark", "data-syllabl-theme"], ["rarity", "garnet", "data-rarity-theme"], ["before-after", "midnight", "data-theme"], ["dual", "ice", "data-dual-theme"]]) {
    const html = renderToStaticMarkup(h(GameThemeProvider, { theme }, h(AuthProvider, null,
      h(GameProgressProvider, null, h(GameProgressBoundary, { gameId: game, eagerShell: true }, h(games[game]))))));
    assert.ok(html.includes(`${attribute}="${theme}"`));
  }
  assert.equal(validGameTheme("rarity", "midnight"), null);
  assert.equal(validGameTheme("before-after", "metro"), "metro");
  assert.equal(validGameTheme("dual", "dark"), null);
  assert.equal(validGameTheme("dual", "mint"), "mint");
  assert.equal(validGameTheme("syllabl", "<script>"), null);
  const writes = [], attributes = {};
  const document = { documentElement: { setAttribute: (key, value) => { attributes[key] = value; } } };
  Object.defineProperty(document, "cookie", { get: () => "mg-theme-rarity=forest", set: value => writes.push(value) });
  runInNewContext(themeBootstrap, { document, location: { protocol: "https:" }, localStorage: { getItem: key => key.includes("syllabl") ? "dark" : "garnet" } });
  assert.equal(writes.length, 1);
  assert.match(writes[0], /mg-theme-syllabl=dark; Path=\/; Max-Age=31536000; SameSite=Lax; Secure/);
  assert.equal(attributes["data-theme-bootstrap"], "syllabl");
  assert.doesNotThrow(() => runInNewContext(themeBootstrap, { document, localStorage: { getItem: () => { throw Error("disabled"); } } }));
});

test("TOKEN and DUAL show real menus before restoration without exposing a playable run", () => {
  for (const game of ["token", "dual"]) {
    const html = render(true, game);
    assert.ok(html.includes(`game-local-bar--${game}`));
    assert.ok(html.includes(game === "token" ? 'class="token-home"' : 'class="dual-menu"'));
    assert.doesNotMatch(html, /Loading your progress|Getting your puzzle|id="dual-entry"|id="token-prediction"/);
    const source = readFileSync(`${repositoryRoot}/src/games/${game}/${game}-game.tsx`, "utf8");
    assert.match(source, /restoration.ready && hydratedRevision === restoration.revision/);
    assert.match(source, /useGameRunPersistence\(platformRun, hydrated/);
    assert.match(source, /if \(!hydrated\) return/);
    const css = readFileSync(`${repositoryRoot}/src/games/${game}/${game}.css`, "utf8");
    assert.ok(css.includes(`@keyframes ${game}-menu-enter`));
    assert.match(css, /prefers-reduced-motion: reduce/);
  }
  assert.match(render(true, "token"), /disabled=""/);
  assert.doesNotMatch(render(true, "dual"), /Today’s string|Secuencia de hoy|···/);
  const dualSource = readFileSync(`${repositoryRoot}/src/games/dual/dual-game.tsx`, "utf8");
  const dualMenu = dualSource.split("function DualMenu(")[1].split("function dualArchiveLabel")[0];
  assert.doesNotMatch(dualMenu, /puzzle.sequence/);
  assert.doesNotMatch(dualMenu, /loadingMessage|todayRound|role="status"/);
  assert.match(dualMenu, /"Daily", "Diario", "en"/);
  assert.match(render(true, "dual"), /lang="en"><b>Daily<\/b><small>Today’s puzzle<\/small>/);
  assert.match(dualSource, /\{puzzle.sequence\}/);
  const tokenSource = readFileSync(`${repositoryRoot}/src/games/token/token-game.tsx`, "utf8");
  assert.match(tokenSource, /if \(!hydrated \|\| view !== "play"\) return/);
});

test("before&after renders its real navigation and animated menu without starting a Daily", () => {
  const html = render(true, "before-after");
  assert.match(html, /game-local-bar--before-after/);
  assert.match(html, /class="ba-menu"/);
  assert.doesNotMatch(html, /Preparing today|Loading your progress|ba-play is-|getting your puzzles ready/);
  const source = readFileSync(`${repositoryRoot}/src/games/before-after/before-after-game.tsx`, "utf8");
  assert.match(source, /const session = playReady \? savedSession : null/);
  assert.match(source, /next === "daily" && playReady/);
  assert.doesNotMatch(source, /next === "insights"/);
  assert.match(source, /pauseBridgeSession/);
  assert.match(source, /setSession\(restored\)/);
  assert.match(source, /if \(!playReady \|\| \(mode === "archive" && !archiveReady\)\) return/);
});

test("DECODE shows live mode controls and permits built-in runs before restoration", () => {
  const html = render(true, "decode");
  assert.match(html, /game-local-bar--decode/);
  for (const mode of ["Daily 5", "Timed", "Zen"]) assert.ok(html.includes(mode));
  assert.doesNotMatch(html, /Loading your progress|Getting your puzzles ready|id="decode-answer"/);
  assert.doesNotMatch(html, /decode-mode-best|decode-startup-status|<small>best<\/small>/);
  const cards = html.split('class="decode-mode-cards"')[1].split('class="decode-zen-selector"')[0];
  assert.equal((cards.match(/<button disabled=""/g) ?? []).length, 0);
  const source = readFileSync(`${repositoryRoot}/src/games/decode/decode-game.tsx`, "utf8");
  assert.doesNotMatch(source, /if \(!canStart\(nextMode\)\) return/);
  assert.match(source, /locallyStartedRun\.current = true/);
  assert.match(source, /const \[run, setRun\] = useState<DecodeState \| null>\(null\)/);
  assert.match(source, /setDailyResumeAvailable\(saved\?\.run\.status === "playing"\)/);
  assert.match(source, /Discovery must remain metadata-only/);
  assert.match(source, /if \(nextMode === "daily-5" && run\?\.mode === "daily-5" && run\.status === "playing"\)/);
  assert.doesNotMatch(source, /onBegin=\{\(\) => run\?\.mode === "daily-5"/);
  assert.match(source, /function handleResultHome\(\)[\s\S]*?run\?\.mode === "timed" \|\| run\?\.mode === "zen"[\s\S]*?setRun\(null\)/);
  assert.match(source, /onHome=\{handleResultHome\}/);
  assert.match(source, /Personal best[\s\S]*?progress\.bestTimedScore/);
  assert.match(source, /setTimeout\(\(\) => \{[\s\S]*?setShowDailyResult\(true\);[\s\S]*?\}, 650\)/);
  assert.match(source, /view completed puzzle/);
  assert.doesNotMatch(source, />decode again</);
});

test("Rarity renders its real menu before progress or the Daily API, without a playable entry", () => {
  const html = render(true, "rarity");
  for (const label of ["game-local-bar--rarity", "Rarity menu", "how to play", "themes", "archive"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Loading your progress|preparing today|getting your daily ready|id="rarity-guess"/);
  assert.doesNotMatch(html, /Today’s string|···/);
  assert.doesNotMatch(html, />play daily<|>view today’s result</);
  const source = readFileSync(`${repositoryRoot}/src/games/rarity/rarity-game.tsx`, "utf8");
  assert.match(source, /useState\(\(\) => rarityDisplayDate\(localDateKey\(\)\)\)/);
  assert.match(source, /daily rarity · \{displayDate\}/);
  assert.match(source, /\{sessionReady \? \(\s*<button className="rarity-primary rarity-home-ready-action"/);
});

test("before&after uses font-independent menu vectors and accessible theme previews", () => {
  const html = render(true, "before-after");
  assert.equal((html.match(/class="ba-menu-vector"/g) ?? []).length, 6);
  assert.doesNotMatch(html, /class="ba-menu-icon"/);
  const css = readFileSync(`${repositoryRoot}/src/games/before-after/before-after.css`, "utf8");
  assert.match(css, /\.ba-theme-card\[data-preview="signature"\] \.ba-theme-preview/);
  assert.match(css, /\.ba-theme-card\[data-preview="neapolitan"\] \.ba-theme-preview/);
  assert.match(css, /\.ba-theme-card\[data-preview="midnight"\] \.ba-theme-preview/);
  assert.match(css, /\.ba-theme-card\[data-preview="terminal"\] \.ba-theme-preview/);
  assert.match(css, /\.ba-theme-card\.is-current \{ border-color:var\(--ba-focus\)/);
});

test("Syllabl keeps its playful staggered letter bounce without re-animating the whole shell", () => {
  const css = readFileSync(`${repositoryRoot}/src/games/syllabl/syllabl.css`, "utf8");
  assert.match(css, /\.syllabl-home-wordmark \.syllabl-wordmark > \*\s*\{[^}]*animation: syllabl-word-bounce 520ms/);
  assert.match(css, /:nth-child\(5\) \{ animation-delay: 530ms/);
  assert.match(css, /\.syllabl-view-frame\[data-syllabl-view="menu"\]:not\(\.is-leaving\)\s*\{\s*animation: none/);
  assert.match(css, /\.syllabl-home \*,\s*\.syllabl-view-frame \{ animation: none !important/);
});

test("Rarity restores only its current account and ignores stale validation replies", () => {
  const source = readFileSync(`${repositoryRoot}/src/games/rarity/rarity-game.tsx`, "utf8");
  assert.match(source, /restoration.ready\s*&& hydratedRevision === restoration.revision\s*&& savedSession\?\.puzzleDate === daily\?\.dateKey\s*\? savedSession\s*: null/);
  assert.match(source, /restoration.ready && daily/);
  assert.match(source, /generation !== validationGeneration.current\) return/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  const home = source.split('{view === "home" ? (')[1].split(') : view === "daily" ?')[0];
  assert.doesNotMatch(home, /\{token\}|puzzleString/);
  assert.match(source, /className="rarity-daily-string"[^>]*>\{token\}/);
});

test("Syllabl renders its real menu and navigation before account or puzzle restoration", () => {
  const html = render(true);
  assert.match(html, /game-local-bar--syllabl/);
  for (const label of ["syllabl menu", "how to play", "themes", "about", "syllabl-menu-daily"]) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /Loading your progress|preparing today|getting your daily ready|game-resume-loading/);
  assert.doesNotMatch(html, /id="syllabl-guess"|continue at level|start today’s puzzle|<i class="is-current"/);
});

test("routed games server-render the requested view instead of flashing their menu", () => {
  const cases = [
    ["syllabl", "syllabl-route-restoring", "syllabl-daily-pending", "syllabl-home", ">daily</button>"],
    ["rarity", "rarity-route-restoring", "rarity-daily-pending", "rarity-home", ">daily</button>"],
    ["before-after", "ba-route-restoring", "ba-startup-pending", "ba-menu", ">Daily</button>"],
    ["dual", "dual-route-restoring", "dual-startup-pending", "dual-menu", ">Diario</button>"],
  ];
  for (const [game, expectedView, obsoleteHoldingPage, wrongMenu, currentLabel] of cases) {
    const html = render(true, game, { initialRoute: { view: "daily" } });
    assert.ok(html.includes(expectedView), `${game} omitted its requested Daily shell`);
    assert.ok(!html.includes(obsoleteHoldingPage), `${game} exposed its old full-page loading state`);
    assert.ok(!html.includes("placeholder"), `${game} exposed an artificial loading mockup`);
    assert.ok(!html.includes(wrongMenu), `${game} server-rendered its menu before Daily`);
    assert.ok(html.includes(`aria-current="page" class="is-current"${game === "dual" ? " lang=\"es\"" : ""} type="button"${currentLabel}`)
      || html.includes(`aria-current="page" class="is-current" type="button"${currentLabel}`), `${game} did not select Daily in its first navigation render`);
  }
});

test("DUAL keeps its split field opaque while restored content appears", () => {
  const sharedCss = readFileSync(`${repositoryRoot}/app/styles/shell.css`, "utf8");
  const dualCss = readFileSync(`${repositoryRoot}/src/games/dual/dual.css`, "utf8");
  assert.match(sharedCss, /\.site-frame\[data-game="dual"\][^{]*\{[^}]*--game-canvas:\s*linear-gradient/);
  assert.match(dualCss, /\.dual-game\s*\{[^}]*background:\s*linear-gradient/);
  assert.match(dualCss, /\.dual-route-ready > \*,\s*\.dual-library-view:not\(\.dual-route-restoring\) > \* \{[\s\S]*?animation: dual-view-enter/);
  assert.doesNotMatch(dualCss, /\.dual-route-ready,\s*\.dual-library-view:not\(\.dual-route-restoring\) \{[\s\S]*?animation: dual-view-enter/);
});

test("the shared account control does not publish email before the preferred profile name", () => {
  const provider = readFileSync(`${repositoryRoot}/src/app-shell/auth-provider.tsx`, "utf8");
  const control = readFileSync(`${repositoryRoot}/src/app-shell/account-control.tsx`, "utf8");
  const layout = readFileSync(`${repositoryRoot}/app/layout.tsx`, "utf8");
  assert.match(provider, /const nextPresentation = profileLoaded[\s\S]*setSession\(nextSession\);[\s\S]*setPlayer\(profile\);[\s\S]*setPresentation\(nextPresentation\);[\s\S]*setReady\(true\);/);
  assert.match(control, /if \(!ready\) \{[\s\S]*if \(presentation\)/);
  assert.match(control, /player\?\.displayName \|\| presentation\?\.label \|\| session\.email/);
  assert.match(layout, /parseAuthPresentation[\s\S]*<AuthProvider initialPresentation=\{initialPresentation\}>/);
});

test("server route intent is allowlisted per game and preserves valid dated rounds", () => {
  assert.deepEqual(resolveGameRouteState("syllabl", { view: "daily" }), { view: "daily" });
  assert.deepEqual(resolveGameRouteState("syllabl", { view: "archive" }), { view: "archive" });
  assert.deepEqual(resolveGameRouteState("syllabl", { view: "daily", date: "2026-09-03" }), { view: "daily", date: "2026-09-03" });
  assert.deepEqual(resolveGameRouteState("syllabl", { view: "archive", date: "2026-09-03" }), { view: "archive" });
  assert.deepEqual(resolveGameRouteState("syllabl", { view: "not-real" }), { view: "menu" });
  assert.deepEqual(resolveGameRouteState("decode", { view: "daily-5" }), { view: "daily-5" });
  assert.deepEqual(resolveGameRouteState("decode", { view: "not-real" }), { view: "home" });
  assert.deepEqual(resolveGameRouteState("dual", { view: "archive", date: "2026-09-03" }), { view: "archive", date: "2026-09-03" });
  assert.deepEqual(resolveGameRouteState("dual", { view: "archive", date: "nope" }), { view: "archive" });
  assert.deepEqual(resolveGameRouteState("before-after", { view: "packs", pack: "after-101" }), { view: "packs", pack: "after-101" });
  assert.deepEqual(resolveGameRouteState("before-after", { view: "themes", pack: "after-101" }), { view: "themes" });
  assert.deepEqual(resolveGameRouteState("before-after", { view: "packs", pack: "not/valid" }), { view: "packs" });
  assert.deepEqual(resolveGameRouteState("before-after", { view: "archive", date: "2026-09-03" }), { view: "archive", date: "2026-09-03" });
  assert.deepEqual(resolveGameRouteState("before-after", { view: "archive", date: "September 3" }), { view: "archive" });
});

test("other games retain the default progress gate until individually migrated", () => {
  const html = render(false);
  assert.match(html, /Loading your progress/);
  assert.doesNotMatch(html, /syllabl-menu-daily/);
});

test("Syllabl restoration is account-bound and late dictionary replies cannot mutate a new session", () => {
  const source = readFileSync(`${repositoryRoot}/src/games/syllabl/syllabl-game.tsx`, "utf8");
  assert.match(source, /restoration.ready[\s\S]*hydratedRevision === restoration.revision[\s\S]*savedSession\?\.puzzleDate === setup\?\.dateKey[\s\S]*\? savedSession[\s\S]*: null/);
  assert.match(source, /restoration.ready && dailyPuzzle && setup/);
  assert.match(source, /generation !== validationGeneration.current\) return/);
  const provider = readFileSync(`${repositoryRoot}/src/platform/game-progress-provider.tsx`, "utf8");
  assert.match(provider, /ready && value\?\.sync.ownerId === owner \? value : null/);
  assert.doesNotMatch(provider, /<AccountProgress key=/);
  assert.match(provider, /if \(eagerShell\) return <RestorationContext.Provider/);
});
