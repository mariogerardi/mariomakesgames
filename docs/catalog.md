# Catalog

## Launch order

| Priority | Game | Canonical repository | Phase |
|---:|---|---|---|
| 1 | Syllabl | `mariogerardi/playsyllabl` | Migrated and playable |
| 2 | Rarity | `mariogerardi/rarity` | Migrated and playable |
| 3 | Expl41n | `mariogerardi/explain-game` | Deep audit required |
| 4 | Before&After | `mariogerardi/before-after` | Deep audit and web port required |
| 5 | DECODE | `mariogerardi/mariogerardi.github.io` | Playable migration complete |
| 6 | Gridl | `mariogerardi/wordgrid` | Audited; preservation harness and content curation |

The order is the current hub presentation order, not a statement that one game
is permanently more valuable than another.

## Product roles

### Syllabl

The flagship. A six-stage daily constraint puzzle combining:

- a three-letter string;
- positional placement;
- syllable count;
- dictionary validation;
- completion after six accepted words.

### Rarity

The short companion daily. One accepted word must include the puzzle token.
Rarer valid words earn a higher continuous score.

Only classic Rarity is in scope. Gemboard is retired.

### Gridl

The campaign game. Players route allowed words from fixed seeds to a starred
goal using fragments, crossings, recalls, blockers, and portals while chasing
par.

Gridl is the product name; `wordgrid` is the repository name.

### Expl41n

The AI wildcard. The repository description identifies a game in which players
give concise clues so an AI can guess a secret word. Its exact current contract
must be audited before migration.

### Before&After

The association game. Players bridge clues with a shared word that can appear
before, after, or in both relationships. Its current implementation is native
SwiftUI and therefore requires a mechanics audit followed by a web port.

### DECODE

The clue-decoder. Players transform a colored clue word into the answer using
same-position, other-position, and absent-letter signals plus a
definition-style hint. It supports escalating Timed play and a themed
five-puzzle sequence.

The repository name reflects its original GitHub Pages deployment rather than
the product name.

## Not in the launch catalog

Future word-game candidates:

- Orange
- Blanking
- Conversationalist

Adjacent later candidates:

- Elevator
- Keyz
- Platformer
- CalorieGame

Separate portfolio product:

- Plotter (`mariogerardi/lettuce`)

Retired:

- Gemboard

Historical, not distinct catalog games:

- `mariogerardi/syllabl`
- `mariogerardi/syllabl2`
- `mariogerardi/syllabl3`

## Catalog invariants

1. Every launch game has one stable ID.
2. Every launch game has one canonical repository.
3. Retired concepts cannot have public routes.
4. Historical repositories do not become duplicate catalog entries.
5. A candidate moves into launch scope only through an explicit decision.
6. Game-specific results remain domain-specific.
