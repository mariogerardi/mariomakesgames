# 0013 — Restore classic Rarity and its daily insights

## Decision

Classic Rarity keeps the shared hub header and game route bar, then restores
the identity of the locked `mariogerardi/rarity` source within the full game
canvas:

- IBM Plex Sans, the faceted gem motif, the original neutral-and-blue default,
  and the six-color rarity spectrum;
- the eight original scoped theme palettes with a device-local preference;
- a functional Rarity landing screen with Daily, How to Play, Themes, About,
  and post-submission Daily Insights;
- the original minimal word-entry idea, physical-keyboard support, and a
  complete on-screen keyboard;
- a bounded two-column Daily layout that collapses below tablet width.

## Insights

Daily Insights are part of Rarity's core identity and remain a first-class
post-game reward. The hub derives five interactive panels from the submitted
word and the real daily leaderboard response:

1. word, definition, score, and tier;
2. percentile, field average, best score, and field size;
3. common, longest, distinct, and matching words;
4. the field's six-tier score distribution;
5. a final benchmark comparison and sharing surface.

Empty or still-developing fields use honest waiting states. The UI does not
invent comparison data.

## Mechanics boundary

This work does not alter classic Rarity's one-valid-submission rule, rejection
ordering, token inclusion, dictionary boundary, continuous score curve, six
tier thresholds, daily puzzle fallback, persistence, leaderboard submission,
or sharing.

`SPEC.md` in the source repository describes a separate future board-puzzle
concept. It is not introduced by this restoration.

Vault, Rarity-Off, authentication, profiles, friends, and badges remain outside
the migrated scope and are not represented by dead controls.
