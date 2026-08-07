# 0012 — Restore Syllabl's original visual identity

## Decision

Syllabl keeps the shared hub header and full-viewport game room, then restores
the visual language of the locked `playsyllabl` source inside that room:

- the Fredoka typeface and `sy·lla·bl` wordmark;
- the original soft gray and blue Light theme as the default;
- all eight original theme palettes, stored as a device-local preference;
- rounded gradient menu controls, puzzle panel, large word input, progress bar,
  accepted-word chips, and restrained versions of the original motion cues;
- working Daily, How to Play, Themes, Statistics, and About views.

Shuffle, All Puzzles, and Create are not shown because those modes have not
been migrated into the hub. The interface does not advertise unavailable
actions.

## Mechanics boundary

This is a presentation and navigation restoration. The H3 engine, daily puzzle
selection, dictionary validation, placement rules, syllable rules, persistence,
completion, and sharing remain authoritative and unchanged.

Per decision 0005, completion remains the sole result. The old point system is
not restored, and accepted-word colors communicate theme and progress only.

## Adaptation

The original standalone page occupied the whole browser. In the hub, Syllabl
occupies the complete canvas below the compact global header and game route bar.
Desktop preserves the original tile-menu composition; mobile converts it to a
two-column flow and keeps submission available through the keyboard Enter key.
