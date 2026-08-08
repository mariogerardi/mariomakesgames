# Games Hub — Agent Guide

## Current phase

Pre-H13: restore each migrated game's source-faithful styling inside the
full-viewport game shell. Syllabl, classic Rarity, Gridl, Expl41n, Before&After, and DECODE are complete;
proceed game-by-game only when explicitly requested.

All six launch games are playable at their internal routes. DECODE preserves
Timed and the original fixed Daily 5, duplicate-aware positional feedback,
20-second Timed resets, four difficulty tiers, the upward Daily clock, and all
118 unique authored puzzles. The exact duplicate and two incorrect source color
arrays are corrected; the nonfunctional ZEN control remains excluded. Gemboard
remains retired. Do not begin shared identity and progress work (H13) until it
is explicitly requested.

All game routes use the shared compact hub header and a full-viewport game
canvas with one floating back-to-Games control. Preserve that hierarchy and the flat game-specific color fields;
do not restore the former editorial identity column or constrained outer cards.
Syllabl owns its original eight scoped theme palettes within its canvas. Its
Daily, How to Play, Themes, and About views are functional; do not
add dead controls for legacy modes that have not been migrated.
Rarity owns its eight original scoped themes, gem identity, on-screen keyboard,
and five live-field Daily Insights panels. Preserve the classic one-valid-word
mechanic. Do not substitute the separate board-mode spec or advertise Vault,
Rarity-Off, auth, profiles, friends, or badges before they are migrated.
Gridl owns its Jost/blue grid identity, menu-first view, five authored packs,
four functional themes, First Puzzle milestone, and click/drag/touch-friendly
play room. Preserve the 31-board authored catalog and tested engine. Do not
restore the 179 placeholders, unfinished themes, `???` achievements, Settings,
or the experimental editor as player-facing features.
Expl41n owns its refined Galaxy identity, mode-first landing, two-column
connection room, dedicated Archive, Custom, and How views, circular live
metrics, restored source dialogue, and the new connection-core mascot family.
Preserve its tested engine, 380-puzzle corpus, four modes, five-attempt Daily,
25-character clue limit, shortest-clue scoring, AI-service failure hardening,
and original confidence thresholds. The eleven semantic mascot states include
idle, thinking, and 30-second sleepy behavior as well as every threshold and
terminal outcome. Keep the nine `/expl41n/emotions/` files as compatibility
aliases for already-open legacy clients, but never reference them from current
UI code. Do not restore the legacy themes, achievements, Settings, or stale
dialogue references to those unavailable features.
Before&After owns its bundled Sansita Swashed identity, menu-first navigation,
four complete themes, phrase-first play room, celebration, local Daily insights,
four real puzzle packs, playable archive, custom creator, statistics, and reset
control. Preserve the 204-puzzle authored corpus and tested bridge engine. Do
not restore placeholder rank packs, preview-only achievements, developer tools,
dead sharing, or fabricated community guesses and leaderboards.
DECODE owns its restrained dark decoding-console identity, two-mode landing
screen, semantic color-and-symbol clue tiles, responsive two-column play room,
Timed difficulty ladder, fixed Sea Creatures progress track, decoding protocol,
and mode-specific result summaries. Preserve both tested modes, all 118 unique
authored puzzles, duplicate-aware feedback, exact clocks, and the four Timed
length tiers. Do not add a calendar rotation, cosmetic themes, skips, power-ups,
or community features.

## Source-of-truth rule

Legacy repositories are read-only behavioral references during H0–H1:

- `../games/playsyllabl`
- `../games/rarity`
- `../games/wordgrid`
- `../games/wordlink`
- remote `mariogerardi/mariogerardi.github.io` at the revision in
  `sources.lock.json`

Do not modify, commit, push, or deploy from those repositories while working on
this phase.

When documentation and runtime disagree, use this precedence:

1. executable behavior;
2. shipped data;
3. verified browser observations;
4. current README;
5. comments and historical specs.

## Required checks

Run before committing:

```bash
npm run check
```

Known legacy defects may be represented as quarantined `todo` tests, but they
must be named and documented.
