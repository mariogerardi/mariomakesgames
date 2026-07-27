# ADR 0001: Launch catalog

- Status: Accepted
- Date: 2026-07-26
- Amended by: ADR 0003

## Context

Mario wants one NYT Games-like destination where games live inside a shared
hub rather than linking to independent sites.

The examined repositories include several current games, prototypes, native
applications, historical Syllabl versions, and one scrapped experiment.
Without an explicit catalog, repository names and stale specifications can
silently redefine product scope.

## Decision

The v1 launch catalog is:

1. Syllabl
2. Rarity
3. Gridl
4. Expl41n
5. Before&After
6. DECODE

Migration follows that order unless Mario explicitly changes it.

The hub will be a new standalone repository at:

```text
/Users/mg/Developer/games-hub
```

The existing game repositories remain behavioral references during H0–H1.

## Exclusions

- Gemboard is retired.
- Plotter is a separate portfolio track.
- Historical Syllabl repositories are not distinct games.
- Orange, Blanking, and Conversationalist remain candidates.
- Elevator, Keyz, Platformer, and CalorieGame do not block v1.

## Consequences

- The hub can be built incrementally.
- Each launch game needs an explicit mechanics contract.
- Before&After requires a web port rather than a direct component migration.
- Expl41n requires an AI-boundary audit.
- No final hub brand is required yet.
