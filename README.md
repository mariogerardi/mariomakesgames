# Games Hub

This repository is the mechanics-preserving home for a unified web hub containing:

1. Syllabl
2. Rarity
3. Gridl
4. Expl41n
5. Before&After
6. DECODE

H0–H1 established:

- lock the catalog and canonical source revisions;
- document the behavioral source of truth;
- build executable preservation contracts;
- compare those contracts with the legacy implementations;
- avoid changing any legacy game repository.

H2 adds the shared hub application:

- a catalog-driven home page;
- internal routes for all six launch games;
- isolated game modules;
- shared daily-date, storage, analytics, result, and sharing boundaries;
- a responsive, accessible visual shell.

H3 completes the playable Syllabl migration:

- the canonical 125-puzzle daily catalog;
- the exact six placement and syllable constraints;
- ordered, immutable attempt validation;
- versioned session persistence and migration;
- completion as the sole result, with legacy rarity scoring intentionally
  retired;
- a responsive daily game interface with live dictionary validation, accepted
  word history, completion, and result sharing.

H4 completes the playable classic Rarity migration:

- one valid submission per daily puzzle;
- the locked continuous rarity-score curve and six tiers;
- live word validation and dictionary context;
- device-local result restoration;
- result sharing and a lightweight daily field comparison;
- a deterministic rotation over the locked classic archive when the legacy
  service has no authored puzzle for a date.

H5–H6 complete the Gridl migration:

- the 31 authored boards from Tutorial, Basics, Building Blocks, Singles, and
  Portals, with 179 explicit placeholders excluded;
- fragment-per-cell placement with straight-line multi-placement turns;
- whole-board word validation, crossings, seed connectivity, blockers, and
  portal projections;
- committed-fragment recall into a two-slot reserve;
- turns, par, best scores, campaign completion, and device-local restoration;
- a production fix for the legacy defect that erased a portal cell's special
  state when moving or clearing a staged fragment.

H7–H8 complete the Expl41n audit and playable migration:

- Daily, Shuffle, Archive, and Custom modes;
- 25-character clues and the five-attempt Daily lock;
- AI guesses with confidence, search-space, reasoning, and preserved emotion
  thresholds;
- shortest-successful-clue scoring, result sharing, local restoration, and
  the legacy leaderboard boundary;
- all 380 authored puzzles from February 1, 2025 through February 15, 2026;
- a deterministic locked-corpus Daily fallback after the authored dates end;
- a hardening rule that AI service failures do not consume limited attempts.

H9–H10 complete the Before&After audit and playable web migration:

- the three Before, After, and Before & After bridge positions;
- unlimited pack attempts and a 15-character answer boundary;
- a 60-second Daily with unlimited guesses until completion or expiry;
- a prior-30-day Archive, custom puzzle creation, and device-local progress;
- 168 Before, 15 After, 11 Before & After, and 10 Minecraft puzzles;
- explicit `???` and coming-soon placeholders excluded from play.

H11–H12 complete the DECODE audit and playable migration:

- all 118 unique authored puzzles from the locked release;
- duplicate-aware green, blue, and gray positional feedback;
- Timed mode with a 20-second reset and 4/5/6/7-letter escalation;
- the original fixed Sea Creatures Daily 5 and its upward elapsed clock;
- device-local Timed and Daily personal bests;
- two incorrect authored color arrays derived correctly, one exact duplicate
  removed, and the nonfunctional ZEN control excluded.

All six launch games are now playable. Shared identity and cross-game progress
begin in H13.

Before H13, the game routes were consolidated into a full-viewport play shell:

- one compact global hub header and game route bar;
- the complete game surface filling the remaining screen;
- flat, vibrant game-specific canvases instead of card-like previews;
- centered readable controls on wide screens and the same hierarchy on mobile.

Syllabl is the first game to receive its source-faithful visual restoration:

- its Fredoka wordmark, rounded gradient controls, puzzle panel, progress bar,
  accepted-word chips, and original eight-theme family;
- a working in-game menu for Daily, How to Play, Themes, Statistics, and About;
- completion-only play and the H3 mechanics preserved without modification;
- unavailable legacy modes omitted instead of represented by dead controls.

## Checks

```bash
npm run dev
npm run build
npm test
npm run check:catalog
npm run check
```

The legacy parity suite expects the existing repositories under:

```text
/Users/mg/Developer/games/
```

Set `GAMES_DEVELOPER_ROOT` to a different Developer directory when needed.

## Repository principles

- Existing games are behavioral references, not packages to merge blindly.
- Mechanics receive executable contracts before UI rewrites.
- Rejected actions must not mutate game state.
- Each game keeps its own domain-specific result schema.
- Gemboard is retired and is not part of the launch catalog.
- Plotter is a separate portfolio product.

See [docs/catalog.md](docs/catalog.md) and
[docs/decisions/0001-launch-catalog.md](docs/decisions/0001-launch-catalog.md).
The executable H1 coverage matrix and known legacy defect are recorded in
[docs/h1-preservation-harness.md](docs/h1-preservation-harness.md).
