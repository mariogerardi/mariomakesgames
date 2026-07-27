# Games Hub — Agent Guide

## Current phase

H4: complete classic Rarity migration.

Syllabl and Rarity are playable at their internal routes. Rarity preserves its
one-valid-submission lock, continuous score, tiers, device-local restoration,
and daily result flow. Gemboard remains retired. Do not begin Gridl hardening
(H5) until it is explicitly requested.

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
