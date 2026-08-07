# Games Hub — Agent Guide

## Current phase

Pre-H13: restore each migrated game's source-faithful styling inside the
full-viewport game shell. Syllabl is complete; proceed game-by-game only when
explicitly requested.

All six launch games are playable at their internal routes. DECODE preserves
Timed and the original fixed Daily 5, duplicate-aware positional feedback,
20-second Timed resets, four difficulty tiers, the upward Daily clock, and all
118 unique authored puzzles. The exact duplicate and two incorrect source color
arrays are corrected; the nonfunctional ZEN control remains excluded. Gemboard
remains retired. Do not begin shared identity and progress work (H13) until it
is explicitly requested.

All game routes use the shared compact hub header, route bar, and full-viewport
game canvas. Preserve that hierarchy and the flat game-specific color fields;
do not restore the former editorial identity column or constrained outer cards.
Syllabl owns its original eight scoped theme palettes within its canvas. Its
Daily, How to Play, Themes, Statistics, and About views are functional; do not
add dead controls for legacy modes that have not been migrated.

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
