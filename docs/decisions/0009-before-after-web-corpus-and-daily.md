# 0009 — Before&After web corpus and Daily rotation

## Status

Accepted for H9–H10.

## Context

The shipped native pack file mixes authored puzzles with explicit placeholders.
Its playable packs contain 4 Before, 10 After, 9 Before & After, and 10
Minecraft puzzles. The same locked repository also contains a broader authored
catalog with 168 Before, 15 After, and 11 Before & After puzzles.

The legacy Daily backend has a schedule boundary, but its fallback rotation is
an unfinished placeholder that always selects `puzzle-0001`.

## Decision

The web port treats the broader locked JSON catalog as authoritative authored
content, adds the themed Minecraft pack, and excludes all explicit `???` and
coming-soon records. This yields 204 playable puzzles.

Daily uses a deterministic local-date rotation through that locked corpus.
Authored puzzle mechanics remain unchanged: three phrase positions, a
15-character answer, unlimited pack attempts, and a 60-second Daily with
unlimited guesses until completion or expiry.

## Consequences

The migrated game launches with the full useful catalog instead of surfacing
placeholder packs. Daily remains self-contained and reproducible without
depending on the unfinished schedule fallback. A future server-authored
schedule can replace selection without changing the session rules.
