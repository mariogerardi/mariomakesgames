# Games Hub — Agent Guide

## Current phase

H3: complete Syllabl migration.

Syllabl is playable at its internal route with daily selection, the production
validation service, completion-only results, device-local restoration, and
sharing. Do not begin the Rarity migration (H4) until it is explicitly
requested.

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
