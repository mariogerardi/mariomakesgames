# 0010 — DECODE fixed Daily and source corrections

## Status

Accepted for H11–H12.

## Context

The locked DECODE release contains 119 records: 114 Timed records and the
five-puzzle Sea Creatures Daily. One six-letter Timed puzzle is an exact
duplicate, so the authored set contains 118 unique puzzles.

Two stored color arrays disagree with the game's documented positional rules.
The visible ZEN control calls an undefined function. Daily 5 is one fixed set;
it has no calendar schedule or completion persistence.

## Decision

The web port ships all 118 unique authored puzzles and derives positional
feedback from clue and answer letters with duplicate-aware matching. It does
not trust the two inconsistent stored color arrays, and it removes the exact
duplicate.

Timed and the original fixed Daily 5 are the only game modes. ZEN remains
excluded because it has no mechanics to preserve. The port does not invent a
calendar rotation. Device-local personal bests are presentation-only records
and do not alter puzzle selection, timing, acceptance, or progression.

## Consequences

The migrated game follows its stated rules rather than accidental source data.
The Daily 5 remains the authored Sea Creatures sequence on every play. A future
calendar-backed Daily or intentionally designed Zen mode would be a new product
decision, not preservation work.
