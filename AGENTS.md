# Games Hub — Agent Guide

## Current phase

H11–H12: complete DECODE audit and web migration.

All six launch games are playable at their internal routes. DECODE preserves
Timed and the original fixed Daily 5, duplicate-aware positional feedback,
20-second Timed resets, four difficulty tiers, the upward Daily clock, and all
118 unique authored puzzles. The exact duplicate and two incorrect source color
arrays are corrected; the nonfunctional ZEN control remains excluded. Gemboard
remains retired. Do not begin shared identity and progress work (H13) until it
is explicitly requested.

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
