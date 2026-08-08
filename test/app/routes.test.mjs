import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repositoryRoot } from "../../src/support/paths.mjs";

const catalog = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "catalog.json"), "utf8"),
);

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("every launch game has an isolated module and an internal route", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  assert.match(routeSource, /generateStaticParams/);

  for (const game of catalog.launch) {
    assert.ok(
      fs.existsSync(
        path.join(repositoryRoot, "src", "games", game.id, "manifest.ts"),
      ),
      `missing module for ${game.id}`,
    );
  }
});

test("the home page routes into the hub rather than legacy deployments", () => {
  const homeSource = read("app/page.tsx");
  const cardSource = read("src/app-shell/game-card.tsx");
  assert.match(cardSource, /href=\{`\/games\/\$\{game\.id\}`\}/);
  assert.doesNotMatch(homeSource, /mariogerardi\.github\.io/);
  assert.doesNotMatch(cardSource, /https?:\/\//);
});

test("the shared shell exposes accessible navigation and page landmarks", () => {
  const homeSource = read("app/page.tsx");
  const headerSource = read("src/app-shell/site-header.tsx");
  const footerSource = read("src/app-shell/site-footer.tsx");

  assert.match(homeSource, /<main>/);
  assert.match(homeSource, /<h1>/);
  assert.match(headerSource, /aria-label="Primary navigation"/);
  assert.match(footerSource, /<footer/);
});

test("H2 does not request persistence or upload infrastructure", () => {
  const hosting = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, ".openai", "hosting.json"),
      "utf8",
    ),
  );
  assert.equal(hosting.d1, null);
  assert.equal(hosting.r2, null);
  assert.equal(typeof hosting.project_id, "string");
});

test("the Syllabl route exposes the complete playable migration", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/syllabl/syllabl-game.tsx");
  assert.match(routeSource, /SyllablGame/);
  assert.match(gameSource, /handleSubmit/);
  assert.match(gameSource, /createSyllablWordValidator/);
  assert.match(gameSource, /syllablDailyStorageKey/);
  assert.match(gameSource, /handleShare/);
  assert.match(gameSource, /Six for six/);
  assert.match(gameSource, /data-syllabl-theme/);
  assert.match(gameSource, /syllabl-play-primary/);
  assert.match(gameSource, /syllabl-play-sidebar/);
  assert.match(gameSource, /"light", name: "Light"/);
  assert.match(gameSource, /"peachy", name: "Peachy"/);
  assert.match(gameSource, /"menu" \| "daily" \| "how-to" \| "themes" \| "about"/);
  assert.doesNotMatch(gameSource, /syllabl-menu-stats|view === "stats"/);
  assert.doesNotMatch(gameSource, /shuffle|all-puzzles|create-puzzle/i);
  assert.doesNotMatch(gameSource, /frequency|Rarity score/);
});

test("the Rarity route exposes the complete playable migration", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/rarity/rarity-game.tsx");
  assert.match(routeSource, /RarityGame/);
  assert.match(gameSource, /handleSubmit/);
  assert.match(gameSource, /validateRarityLocalRules/);
  assert.match(gameSource, /submitResultToLeaderboard/);
  assert.match(gameSource, /rarityDailyStorageKey/);
  assert.match(gameSource, /handleShare/);
  assert.match(gameSource, /first valid word locks/i);
  assert.match(gameSource, /data-rarity-theme/);
  assert.match(gameSource, /"home" \| "daily" \| "how-to" \| "themes" \| "about" \| "insights"/);
  assert.match(gameSource, /daily insights/i);
  assert.match(gameSource, /rarity-insight-panel/);
  assert.match(gameSource, /rarity-keyboard/);
  assert.match(gameSource, /\/rarity\/logo\.png/);
  assert.ok(fs.existsSync(path.join(repositoryRoot, "public", "rarity", "logo.png")));
  assert.doesNotMatch(gameSource, /rarity-off|vault|friends|badges/i);
});

test("the Gridl route exposes the complete playable campaign migration", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/gridl/gridl-game.tsx");
  const rulesSource = read("src/games/gridl/engine/rules.mjs");
  assert.match(routeSource, /GridlGame/);
  assert.match(gameSource, /tryStagePlacement/);
  assert.match(gameSource, /tryStageRecall/);
  assert.match(gameSource, /getPortalOverlayText/);
  assert.match(gameSource, /gridlChapters/);
  assert.match(gameSource, /PROGRESS_KEY/);
  assert.match(gameSource, /data-gridl-theme/);
  assert.match(gameSource, /gridlDailyLevelId/);
  assert.match(gameSource, /type GridlView/);
  assert.match(gameSource, /\| "home"/);
  assert.match(gameSource, /useState<GridlView>\("home"\)/);
  assert.match(gameSource, /\| "packs"/);
  assert.match(gameSource, /\| "pack"/);
  assert.match(gameSource, /\| "how"/);
  assert.match(gameSource, /\| "themes"/);
  assert.match(gameSource, /Frutiger Aero/);
  assert.match(gameSource, /Puzzle Packs/);
  assert.match(gameSource, /How to Play/);
  assert.match(gameSource, /GRIDL_DRAG_TYPE/);
  assert.doesNotMatch(gameSource, /Level Editor|Coming soon|\?\?\?/i);
  assert.match(rulesSource, /special: from\.special \|\| null/);
});

test("the Expl41n route exposes its restored game room and all preserved modes", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/expl41n/expl41n-game.tsx");
  const presentationSource = read("src/games/expl41n/presentation.mjs");
  assert.match(routeSource, /Expl41nGame/);
  assert.match(gameSource, /type Expl41nView/);
  assert.match(gameSource, /"home" \| "play" \| "archive" \| "custom" \| "how"/);
  assert.match(gameSource, /useState<Expl41nView>\("home"\)/);
  assert.match(gameSource, /openMode\("daily"\)/);
  assert.match(gameSource, /openMode\("shuffle"\)/);
  assert.match(gameSource, /openMode\("archive"\)/);
  assert.match(gameSource, /openMode\("custom"\)/);
  assert.match(gameSource, /EXPL41N_CLUE_LIMIT/);
  assert.match(gameSource, /attemptsRemaining/);
  assert.match(gameSource, /services\.guess/);
  assert.match(gameSource, /serializeExpl41nSession/);
  assert.match(gameSource, /handleShare/);
  assert.match(gameSource, /greetingsData/);
  assert.match(gameSource, /SLEEP_DELAY = 30_000/);
  assert.match(gameSource, /EXPL41N_PRESENTATION = "galaxy-menu-v2"/);
  assert.match(gameSource, /data-presentation=\{EXPL41N_PRESENTATION\}/);
  assert.match(gameSource, /event\.currentTarget\.src = "\/expl41n\/mascot\/idle\.png"/);
  assert.match(gameSource, /expl41n-archive-screen/);
  assert.match(gameSource, /expl41n-custom-screen/);
  assert.match(gameSource, /expl41n-how-screen/);
  assert.match(gameSource, /\/expl41n\/mascot\/\$\{state\}\.png/);
  assert.doesNotMatch(gameSource, /\/expl41n\/emotions\//);
  assert.match(presentationSource, /EXPL41N_MASCOT_STATES/);
  assert.match(presentationSource, /expl41nAvatarMood/);
  for (const state of [
    "idle", "thinking", "frustrated", "confused", "suspicious",
    "skeptical", "confident", "surprised", "sleepy", "victory", "defeat",
  ]) {
    assert.ok(
      fs.existsSync(path.join(repositoryRoot, "public", "expl41n", "mascot", `${state}.png`)),
      `missing Expl41n mascot state: ${state}`,
    );
  }
  for (const legacyMood of [
    "angry", "confused", "happy", "sad", "side-eye", "sleepy",
    "surprised", "suspicious", "victory",
  ]) {
    assert.ok(
      fs.existsSync(path.join(repositoryRoot, "public", "expl41n", "emotions", `${legacyMood}.png`)),
      `missing Expl41n legacy expression alias: ${legacyMood}`,
    );
  }
});

test("the Before&After route exposes the complete bridge game", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read(
    "src/games/before-after/before-after-game.tsx",
  );
  assert.match(routeSource, /BeforeAfterGame/);
  assert.match(gameSource, /"daily", "packs", "archive", "custom", "stats"/);
  assert.match(gameSource, /BEFORE_AFTER_ANSWER_LIMIT/);
  assert.match(gameSource, /remainingBridgeSeconds/);
  assert.match(gameSource, /validateCustomBridgePuzzle/);
  assert.match(gameSource, /PROGRESS_KEY/);
});

test("the DECODE route exposes both preserved playable modes", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/decode/decode-game.tsx");
  assert.match(routeSource, /DecodeGame/);
  assert.match(gameSource, /"timed", "daily-5"/);
  assert.match(gameSource, /deriveDecodeFeedback/);
  assert.match(gameSource, /evaluateDecodeAttempt/);
  assert.match(gameSource, /tickDecodeClock/);
  assert.match(gameSource, /decodeDailyPuzzles/);
  assert.match(gameSource, /PROGRESS_KEY/);
  assert.doesNotMatch(gameSource, /zen/i);
});

test("game routes use the full-viewport shared play shell", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const styles = read("app/globals.css");
  assert.doesNotMatch(routeSource, /game-route-bar|game-route-features|game-route-identity/);
  assert.match(routeSource, /className="game-canvas-back"/);
  assert.match(routeSource, /className="game-canvas"/);
  assert.doesNotMatch(routeSource, /className="room-grid"/);
  assert.doesNotMatch(routeSource, /<SiteFooter/);
  assert.match(styles, /\.game-canvas > \.syllabl-game-card/);
  assert.match(styles, /--game-room-height: calc\(100dvh - 66px\)/);
  assert.match(styles, /--game-canvas: #ffca3a/);
  assert.match(styles, /--game-canvas: #73d4ec/);
});

test("the starter preview is gone and social metadata is project-specific", () => {
  const layoutSource = read("app/layout.tsx");
  assert.doesNotMatch(layoutSource, /codex-preview|Starter Project/);
  assert.match(layoutSource, /Games by Mario Gerardi/);
  assert.match(layoutSource, /summary_large_image/);
  assert.ok(fs.existsSync(path.join(repositoryRoot, "public", "og.png")));
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, "app", "_sites-preview")),
    false,
  );
});
