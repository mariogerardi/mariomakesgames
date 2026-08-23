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
  const heroPreviewSource = read("src/app-shell/hero-game-previews.tsx");
  const cardSource = read("src/app-shell/game-card.tsx");
  assert.match(cardSource, /href=\{`\/games\/\$\{game\.id\}`\}/);
  assert.doesNotMatch(homeSource, /mariogerardi\.github\.io/);
  assert.doesNotMatch(cardSource, /https?:\/\//);
  assert.doesNotMatch(homeSource, /hero-shape-blue/);
  assert.match(homeSource, /hero-marquee/);
  assert.match(homeSource, /HeroGamePreviews/);
  assert.match(heroPreviewSource, /preview-syllabl-panel/);
  assert.match(heroPreviewSource, /preview-rarity-brand/);
  assert.match(heroPreviewSource, /preview-rarity-entry/);
  assert.doesNotMatch(heroPreviewSource, /preview-rarity-keyboard/);
  assert.match(heroPreviewSource, /preview-card-before-after/);
  assert.match(heroPreviewSource, /preview-before-after-phrases/);
  assert.match(heroPreviewSource, /preview-before-after-keyboard/);
  assert.match(heroPreviewSource, /data-preview-game/);
  assert.match(heroPreviewSource, /data-preview-entry/);
  assert.match(heroPreviewSource, /IntersectionObserver/);
  assert.doesNotMatch(homeSource, /preview-card-gridl/);
  assert.match(cardSource, /game\.id === "expl41n" \|\| game\.id === "decode" \|\| game\.id === "gridl"/);
  assert.match(cardSource, /coming soon!/);
  assert.match(cardSource, /aria-disabled="true"/);
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
  assert.match(gameSource, /six for six/);
  assert.match(gameSource, /data-syllabl-theme/);
  assert.match(gameSource, /syllabl-play-primary/);
  assert.match(gameSource, /syllabl-current-level-summary/);
  assert.doesNotMatch(gameSource, /syllabl-play-sidebar/);
  assert.match(gameSource, /"light", name: "light"/);
  assert.match(gameSource, /"peachy", name: "peachy"/);
  assert.match(gameSource, /"menu" \| "daily" \| "how-to" \| "themes" \| "about"/);
  assert.doesNotMatch(gameSource, /syllabl-menu-stats|view === "stats"/);
  assert.doesNotMatch(gameSource, /shuffle|all-puzzles|create-puzzle/i);
  assert.doesNotMatch(gameSource, /frequency|Rarity score/);
});

test("the Syllabl facelift keeps its core flow responsive and addressable", () => {
  const gameSource = read("src/games/syllabl/syllabl-game.tsx");
  const localBarSource = read("src/app-shell/game-local-bar.tsx");
  const styles = read("app/globals.css");

  for (const landmark of [
    "syllabl-menu-daily",
    "syllabl-menu-secondary",
    "syllabl-step-progress",
    "syllabl-play-card",
    "syllabl-complete-answers",
    "syllabl-how-grid",
    "syllabl-theme-preview",
    "syllabl-about-grid",
    "syllabl-view-frame",
  ]) {
    assert.match(gameSource, new RegExp(landmark), `missing Syllabl facelift landmark: ${landmark}`);
  }

  assert.match(gameSource, /searchParams\.set\("view", nextView\)/);
  assert.match(gameSource, /addEventListener\("popstate", syncView\)/);
  assert.match(gameSource, /press enter or submit/);
  assert.match(styles, /Syllabl facelift/);
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /@media \(min-width: 861px\) and \(max-height: 800px\)/);
  assert.match(styles, /\.syllabl-game-card \.syllabl-entry button \{[\s\S]*?display: inline-flex/);
  assert.match(styles, /@keyframes syllabl-screen-out/);
  assert.match(styles, /@keyframes syllabl-word-bounce/);
  assert.match(styles, /@keyframes syllabl-token-flip/);
  assert.match(styles, /@keyframes syllabl-answer-pop/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(gameSource, /behavior: "instant"/);
  assert.match(localBarSource, /nav\.scrollTo/);
  assert.doesNotMatch(localBarSource, /scrollIntoView/);
  assert.match(styles, /@keyframes syllabl-token-flip \{\s*from[\s\S]*?to[\s\S]*?\}/);
});

test("the Rarity route exposes the complete playable migration", () => {
  const routeSource = read("app/games/[gameId]/page.tsx");
  const gameSource = read("src/games/rarity/rarity-game.tsx");
  const rarityStyles = read("src/games/rarity/rarity.module.css");
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
  assert.match(gameSource, /name: "alloy"/);
  assert.match(gameSource, /name: "oasis"/);
  assert.match(rarityStyles, /rarity-theme-picker/);
  assert.match(gameSource, /isRevealing/);
  assert.match(gameSource, /rarityViewFromUrl/);
  assert.match(gameSource, /searchParams\.set\("view", nextView\)/);
  assert.match(gameSource, /addEventListener\("popstate"/);
  assert.match(gameSource, /history\.replaceState/);
  assert.doesNotMatch(gameSource, /rarity-side-panel/);
  assert.match(rarityStyles, /--rarity-score-fill/);
  assert.match(rarityStyles, /@keyframes rarity-word-type/);
  assert.match(rarityStyles, /prefers-reduced-motion: reduce/);
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

test("every non-Expl41n game adopts the persistent local navigation bar", () => {
  const barSource = read("src/app-shell/game-local-bar.tsx");
  const styles = read("app/globals.css");
  assert.match(barSource, /className={`game-local-bar \$\{className\}`}/);
  assert.match(barSource, /aria-current=\{item\.current \? "page" : undefined\}/);
  assert.match(styles, /padding: 10px 28px 10px 116px/);
  assert.match(styles, /\.game-local-bar--syllabl/);
  assert.match(styles, /\.game-local-bar--rarity/);
  assert.match(styles, /\.game-local-bar--gridl/);
  assert.match(styles, /\.game-local-bar--before-after/);
  assert.match(styles, /\.game-local-bar--decode/);

  for (const game of ["syllabl", "rarity", "gridl", "before-after", "decode"]) {
    const source = read(`src/games/${game}/${game}-game.tsx`);
    assert.match(source, /GameLocalBar/, `${game} should render the shared local bar`);
  }
});

test("the starter preview is gone and social metadata is project-specific", () => {
  const layoutSource = read("app/layout.tsx");
  const gameRouteSource = read("app/games/[gameId]/page.tsx");
  const brandSource = read("src/app-shell/site-brand.ts");
  assert.doesNotMatch(layoutSource, /codex-preview|Starter Project/);
  assert.match(brandSource, /mariomakesgames!/);
  assert.match(layoutSource, /siteBrand\.name/);
  assert.match(layoutSource, /summary_large_image/);
  assert.match(gameRouteSource, /openGraph:/);
  assert.match(gameRouteSource, /images: \[\]/);
  assert.ok(fs.existsSync(path.join(repositoryRoot, "public", "og.png")));
  assert.equal(
    fs.existsSync(path.join(repositoryRoot, "app", "_sites-preview")),
    false,
  );
});
