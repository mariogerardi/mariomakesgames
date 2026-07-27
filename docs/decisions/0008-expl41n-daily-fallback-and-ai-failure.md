# 0008 — Expl41n daily fallback and AI failure behavior

## Status

Accepted for H7–H8.

## Context

The locked Expl41n archive ends on February 15, 2026. The legacy client requires
an exact date match and therefore has no Daily puzzle after that date.

The legacy client also records a clue before requesting an AI guess. When the
request fails, it substitutes a generic guess and can consume one of the five
Daily attempts.

## Decision

Authored date matches remain authoritative. Missing dates rotate
deterministically through the 380 locked puzzles, keyed by the player's local
calendar day.

AI transport and response failures do not create an attempt. The player can
resubmit after the service recovers.

## Consequences

Daily remains available after the authored archive ends without inventing new
puzzle content. A network outage cannot silently spend a limited attempt.
