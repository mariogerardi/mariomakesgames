# 0014 — Restore Gridl's authored player experience

## Decision

Gridl keeps the shared hub header and game route bar, then restores the visual
and navigational identity of the locked `mariogerardi/wordgrid` source within
the full game canvas:

- Jost typography, the powder-blue field, royal-blue fragments, crisp white
  surfaces, compact controls, and the original grid-derived menu mark;
- source-faithful filled, seed, staged, selected, goal, blocker, projection,
  and animated portal states;
- the animated ten-dot par meter and completion feedback;
- a Daily-first view, authored Puzzle Packs, pack-level browser, How to Play,
  Themes, and Milestones;
- Light, Dark, Contrast, and Frutiger Aero as the four complete themes, with
  Frutiger Aero unlocked by the real First Puzzle milestone;
- the original deterministic daily hash, restricted to migrated authored
  boards so a placeholder can never become the Daily Puzzle.

The play room uses a wide board-and-tray layout inside the hub. It collapses
to a vertical arrangement on narrow screens. Click selection and explicit
Place/Recall controls remain available for touch and keyboard use, while
desktop drag-and-drop restores the original tactile interaction path. Every
path delegates to the same migrated engine functions.

## Content boundary

The legacy repository contains 210 level records, but 179 identify themselves
as placeholders. The hub continues to ship only the 31 authored boards across
Tutorial, Basics, Building Blocks, Singles, and Portals.

The legacy theme catalog also names fifteen coming-soon themes without complete
styles. Three achievements contain placeholder copy or unavailable rewards,
Settings only says "Coming soon," and the level editor is experimental creator
tooling. None are presented as finished player features.

## Mechanics boundary

This restoration does not alter straight-line multi-placement, whole-board
allowlist validation, crossings, seed connectivity, blockers, recall turn
cost, reserve capacity, portal projection and connectivity, goal coverage,
turn counting, par, best-score persistence, level normalization, or the
documented portal-state preservation fix.
