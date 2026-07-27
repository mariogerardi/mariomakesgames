# ADR 0002: Behavioral source of truth

- Status: Accepted
- Date: 2026-07-26

## Context

The audited repositories contain documentation collisions:

- Syllabl’s top-level `SPEC.md` describes the founding Rarity concept.
- Rarity’s top-level `SPEC.md` describes the retired Gemboard experiment.
- Gridl’s `AGENTS.md` describes an obsolete one-file architecture.

Following those documents literally would remove or replace defining mechanics.

## Decision

Use this precedence for mechanics-preserving migration:

1. executable legacy behavior;
2. shipped puzzle and level data;
3. verified browser observations;
4. current implementation-oriented documentation;
5. comments and historical specifications.

Every migrated rule must be represented by:

- a pure contract function when practical;
- a golden fixture;
- a comparison with the legacy implementation or engine;
- an explicit decision when behavior is ambiguous.

## Known non-authoritative documents

| Repository | Document | Classification |
|---|---|---|
| `playsyllabl` | `SPEC.md` | Historical Rarity concept |
| `rarity` | `SPEC.md` | Retired Gemboard proposal |
| `wordgrid` | `AGENTS.md` | Stale architecture guide |

These files should be relabeled or moved in their own repositories only after a
separate approved change.
