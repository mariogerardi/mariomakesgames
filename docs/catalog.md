# Catalog

## Public hub order

| Priority | Game | Canonical repository | Implementation | Hub status |
|---:|---|---|---|---|
| 1 | Syllabl | `mariogerardi/playsyllabl` | Migrated and playable | Live |
| 2 | Rarity | `mariogerardi/rarity` | Migrated and playable | Live |
| 3 | Before&After | `mariogerardi/before-after` | Migrated and playable | Live |
| 4 | DECODE | `mariogerardi/mariogerardi.github.io` | Migrated and playable | Live |
| 5 | TOKEN | `mariogerardi/games-hub` | Native prototype | Live preview |
| 6 | DUAL | `mariogerardi/games-hub` | Native prototype | Live preview |
| 7 | Expl41n | `mariogerardi/explain-game` | Migrated and playable | Coming soon |
| 8 | Gridl | `mariogerardi/wordgrid` | Migrated and playable | Coming soon |

Implementation status and hub status are deliberately separate. Expl41n and
Gridl have working internal routes but remain locked on the public collection.
TOKEN and DUAL are accessible because their mechanics need playtesting, but
their bundled puzzle catalogs are not yet publication-scale.

The order is the current hub presentation order, not a statement that one game
is permanently more valuable than another.

## Product roles

### Syllabl

The flagship six-stage daily. Each accepted word must satisfy a three-letter
string, a positional rule, and an exact syllable count. The bundled catalog
contains 125 daily puzzles.

### Rarity

The short companion daily. One accepted word must include the puzzle string;
rarer valid words earn a higher continuous score. The game uses a live service
when a dated puzzle exists and otherwise rotates through 35 bundled classics.

### Before&After

The association game. Players bridge two clues with a shared word appearing
before, after, or on opposite sides. Four packs provide 204 authored puzzles,
alongside Daily, Archive, Custom, Stats, Themes, and Settings views.

### DECODE

The clue-decoder. Players combine positional color feedback with a definition
to identify an answer. It ships 118 unique puzzles across Timed, Daily 5, and
Zen modes.

### TOKEN

The prediction game. Players guess selected words or raw model tokens in a
frozen AI response and receive probability-based partial credit. The checked-in
catalog currently contains two Easy and two Hard puzzles. Its OpenAI-assisted
Builder is intentionally local-only.

### DUAL

The bilingual word hunt. English and Spanish words share one three-letter
string, with distinct-family scoring and extra credit for Duals valid in both
languages. The checked-in runtime currently contains two curated fixture
puzzles; its full lexical authoring corpus remains local and Git-ignored.

### Expl41n

The AI wildcard. Players give concise clues so an AI can guess a secret word.
The migrated game includes Daily, Shuffle, Archive, and Custom modes, a
380-puzzle corpus, live AI guessing, scoring, and the connection-core mascot.
It remains intentionally locked in the public hub.

### Gridl

The campaign game. Players route word fragments from fixed seeds to a starred
goal using crossings, recalls, blockers, and portals while chasing par. It
ships 31 authored boards in five packs and remains intentionally locked in the
public hub.

## Not in the launch catalog

Future word-game candidates: Orange, Blanking, and Conversationalist.

Adjacent later candidates: Elevator, Keyz, Platformer, and CalorieGame.

Plotter (`mariogerardi/lettuce`) remains a separate portfolio product.
Gemboard remains retired and must not route.

## Catalog invariants

1. Every catalog game has one stable ID and one canonical repository.
2. Implementation readiness and public hub availability are tracked separately.
3. Retired concepts cannot have public routes.
4. Historical repositories do not become duplicate catalog entries.
5. Game-specific results remain domain-specific.
