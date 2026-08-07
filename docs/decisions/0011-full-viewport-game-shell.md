# 0011 — Full-viewport game shell

## Status

Accepted before H13.

## Context

The first playable migrations placed a large editorial identity column beside
each game and constrained play to a card. That presentation worked as a catalog
case study, but made the game itself feel secondary and left much of a desktop
viewport unused.

The intended product is a unified game destination: a compact hub bar at the
top and a focused game surface filling the remainder of the screen.

## Decision

Every internal game route uses one shared two-level shell:

- the global Games header;
- a compact route bar with back navigation, game identity, and key traits;
- a full-width, full-height game canvas below it.

The six game components keep their mechanics and internal controls unchanged.
Their former card borders, rounded outer corners, shadows, and decorative
gradients are removed at the shared shell boundary. Each game receives a flat,
vibrant canvas color while interactive content stays centered at a readable
width. Mobile routes retain the same hierarchy with condensed labels.

## Consequences

Games now lead the route instead of appearing as previews inside an editorial
page. The shared header preserves a clear path back to the catalog, while each
game remains visually distinct without imitating another publisher's branding.
Future shared identity and progress work can attach to the global or compact
route bars without shrinking the play surface.
