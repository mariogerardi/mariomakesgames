# ADR 0004: Hub shell architecture

- Status: Accepted
- Date: 2026-07-26

## Context

The six games need to live inside one product while retaining independently
testable mechanics. H2 needs a deployable shell without prematurely coupling
game engines to navigation, branding, analytics, accounts, or persistence.

## Decision

Build the hub as a typed React application with:

- a catalog-driven home page;
- one internal `/games/:gameId` route family;
- one isolated manifest directory per launch game;
- shared shell components that know presentation but not gameplay;
- platform interfaces for daily keys, device-local storage, analytics events,
  completion summaries, and sharing;
- no database, uploads, authentication, or analytics provider in H2.

The canonical `catalog.json` determines route order. Each game manifest supplies
only product-facing presentation and status. Mechanics remain in the pure H1
contracts until their playable port begins.

## Consequences

- Adding or removing a launch game requires both a catalog decision and a game
  module, enforced by tests.
- No game card links to a legacy deployment.
- Shared visual work cannot silently change game rules.
- H3 can replace the Syllabl placeholder inside its existing route without
  restructuring the hub.
- Final naming, domain, public access, accounts, and analytics remain deferred.
