import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studioPage = await readFile(new URL("../../app/studio/page.tsx", import.meta.url), "utf8");
const studioGamePage = await readFile(new URL("../../app/studio/[gameId]/page.tsx", import.meta.url), "utf8");
const studioClient = await readFile(new URL("../../src/authoring/puzzle-studio.tsx", import.meta.url), "utf8");
const studioDashboard = await readFile(new URL("../../src/authoring/studio-dashboard.tsx", import.meta.url), "utf8");
const studioTopBar = await readFile(new URL("../../src/authoring/studio-top-bar.tsx", import.meta.url), "utf8");
const viteConfig = await readFile(new URL("../../vite.config.ts", import.meta.url), "utf8");
const devPlugin = await readFile(new URL("../../scripts/puzzle-studio-dev-plugin.ts", import.meta.url), "utf8");
const studioCatalog = await readFile(new URL("../../src/authoring/catalog.ts", import.meta.url), "utf8");
const studioPreview = await readFile(new URL("../../src/authoring/studio-preview.tsx", import.meta.url), "utf8");

test("Puzzle Studio is local-only and excluded from indexing", () => {
  for (const route of [studioPage, studioGamePage]) {
    assert.match(route, /process\.env\.NODE_ENV !== "development"/);
    assert.match(route, /isLocalStudioHost\(host\)/);
    assert.match(route, /notFound\(\)/);
    assert.match(route, /index: false, follow: false/);
  }
});

test("the Studio opens on a dashboard and gives every game a dedicated workspace", () => {
  assert.match(studioPage, /StudioDashboard/);
  assert.match(studioGamePage, /<PuzzleStudio gameId=\{gameId\}/);
  assert.match(studioDashboard, /Choose a workspace/);
  assert.match(studioDashboard, /What needs a puzzle\?/);
  assert.match(studioClient, /Daily schedule/);
  assert.match(studioClient, /StudioSchedule/);
  assert.match(studioClient, /studio-calendar-grid/);
  assert.match(studioClient, /Previous month/);
});

test("every Studio view shares one game-first navigation bar", () => {
  assert.match(studioDashboard, /<StudioTopBar/);
  assert.match(studioClient, /<StudioTopBar currentGameId=\{gameId\}/);
  assert.match(studioTopBar, /Puzzle Studio/);
  assert.match(studioTopBar, /href="\/studio">Dashboard/);
  assert.match(studioTopBar, /STUDIO_GAMES\.map/);
});

test("game editors prioritize puzzle inputs and keep record metadata optional", () => {
  assert.match(studioClient, /studio-primary-field/);
  assert.match(studioClient, /Three-letter string/);
  assert.match(studioClient, /studio-puzzle-details/);
  assert.match(studioClient, /Notes and file details/);
  assert.doesNotMatch(studioClient, />Title<input/);
  assert.doesNotMatch(studioClient, />Tags<input/);
  assert.doesNotMatch(studioClient, />Curator</);
});

test("the Studio gives all six games one shared draft workflow", () => {
  for (const editor of ["SyllablEditor", "RarityEditor", "BeforeAfterEditor", "DecodeEditor"]) {
    assert.match(studioClient, new RegExp(`function ${editor}\\(`));
  }
  assert.match(studioClient, /<TokenBuilder onStudioPayload=/);
  assert.match(studioClient, /<DualBuilder onStudioPayload=/);
  for (const action of ["Save draft", "Duplicate", "Export JSON", "Import JSON"]) {
    assert.match(studioClient, new RegExp(`>${action}<`));
  }
  assert.match(studioClient, /Save &amp; schedule/);
  assert.match(studioClient, /Test puzzle/);
  assert.match(studioClient, /Browser recovery updated/);
  assert.match(studioClient, /selectedLibraryItems/);
  assert.match(studioClient, /createSelectedCatalogDrafts/);
  assert.match(studioClient, /deleteSelectedDrafts/);
  assert.match(studioClient, /studio-control-button/);
});

test("Before&After authoring lives in Studio instead of the player shell", async () => {
  const gameClient = await readFile(new URL("../../src/games/before-after/before-after-game.tsx", import.meta.url), "utf8");
  assert.match(studioClient, /validateCustomBridgePuzzle/);
  assert.match(studioClient, /studio-ba-play-card/);
  assert.match(studioClient, /mg-games:v1:before-after:custom/);
  assert.match(studioClient, /Import into Studio/);
  assert.doesNotMatch(gameClient, /CreatorView|CUSTOM_KEY|label: "Custom"|view === "custom"/);
});

test("Studio file writes remain behind its development-server plugin", () => {
  assert.match(viteConfig, /puzzleStudioDevPlugin\(\)/);
  assert.match(devPlugin, /apply: "serve"/);
  assert.match(devPlugin, /\.local", "puzzle-studio"/);
  assert.match(devPlugin, /createFileScheduleRepository/);
  assert.match(devPlugin, /createFilePublishedRepository/);
  assert.doesNotMatch(studioPage, /node:fs|file-draft-repository/);
  assert.doesNotMatch(studioGamePage, /node:fs|file-draft-repository/);
});

test("the Studio exposes the shipped catalog without mutating it", () => {
  assert.match(studioClient, /Shipped <span>/);
  assert.match(studioClient, /Create editable draft/);
  assert.match(studioClient, /The original remains unchanged/);
  for (const catalog of ["syllablPuzzles", "rarityClassicPuzzles", "allBridgePuzzles", "allDecodePuzzles", "tokenPuzzles", "dualPuzzles"]) {
    assert.match(studioCatalog, new RegExp(catalog));
  }
});

test("player game shells no longer expose TOKEN or DUAL authoring", async () => {
  const [tokenGame, dualGame] = await Promise.all([
    readFile(new URL("../../src/games/token/token-game.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/games/dual/dual-game.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(tokenGame, /label: "Build"/);
  assert.doesNotMatch(dualGame, /label: localized\(language, "Build"/);
  assert.doesNotMatch(dualGame, /view === "builder"/);
});

test("all six Studio previews invoke production engine functions", () => {
  for (const preview of ["SyllablPreview", "RarityPreview", "BeforeAfterPreview", "DecodePreview", "TokenPreview", "DualPreview"]) {
    assert.match(studioPreview, new RegExp(`function ${preview}\\(`));
  }
  for (const engineCall of ["evaluateSyllablAttempt", "evaluateRarityAttempt", "submitBridgeAnswer", "evaluateDecodeAttempt", "scoreTokenEntry", "submitDualWord"]) {
    assert.match(studioPreview, new RegExp(`${engineCall}\\(`));
  }
  assert.doesNotMatch(studioPreview, /localStorage|sessionStorage/);
});
