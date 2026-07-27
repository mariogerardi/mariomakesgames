# ADR 0003: Add DECODE to the launch catalog

- Status: Accepted
- Date: 2026-07-26

## Context

DECODE is deployed at <https://mariogerardi.github.io/> from
`mariogerardi/mariogerardi.github.io`. It was omitted from the initial catalog
because the repository and deployment are named for GitHub Pages rather than
the game.

The shipped implementation contains a complete standalone word game with
distinct mechanics and therefore belongs inside the unified hub.

## Decision

Add DECODE as launch priority 6, after Before&After. The order is provisional
and may be changed explicitly without changing the game's inclusion.

Lock revision `db2e50e16b04ef317f116583a37a19a72a0b8fc9` as the H1 oracle and add an
executable contract for feedback, progression, submissions, and clocks.

Preserve the documented color mechanic rather than two inconsistent authored
color arrays. Deduplicate one repeated six-letter puzzle. Exclude the visible
but nonfunctional Zen control until a Zen mode is intentionally designed.

## Consequences

- The launch catalog contains six games.
- DECODE remains available at its original URL while the hub is developed.
- The future port must move puzzle content into validated data rather than
  copying the monolithic DOM event handler.
- A calendar-backed daily rotation and persistence would be product additions,
  not legacy mechanics, and require separate decisions.
