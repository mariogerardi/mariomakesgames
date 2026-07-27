# 0006 — Keep Rarity playable when a daily puzzle is missing

Status: accepted for H4

## Context

Classic Rarity obtains its daily string from the legacy puzzle service. The
service contains 35 classic puzzles from February 1 through March 7, 2026, but
does not contain every later date. A missing record otherwise leaves the daily
game unplayable.

## Decision

The hub requests the authored puzzle for the player’s local date first. When
the service returns no puzzle, it selects deterministically from the exact
35-puzzle classic archive, using February 1, 2026 as index zero.

The fallback changes only puzzle availability. Local validation, remote word
validation, score calculation, tiers, first-valid-submission locking,
persistence, and results retain their audited behavior.

Gemboard records are excluded from the fallback catalog.

## Consequences

Every local date has a stable classic Rarity string. If an authored puzzle is
later added for that date, the live service remains authoritative.
