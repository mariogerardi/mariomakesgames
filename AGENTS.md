# Games Hub — Agent Guide

## Current phase

H9–H10: complete Before&After audit and web migration.

Syllabl, Rarity, Gridl, Expl41n, and Before&After are playable at their internal
routes. Before&After preserves all three bridge positions, unlimited pack
attempts, the 15-character answer cap, 60-second Daily play, Archive, Custom,
local progress, and the full 204-puzzle authored catalog. Explicit placeholders
are excluded. Gemboard remains retired. Do not begin shared identity and
progress work (H11) until it is explicitly requested.

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
