# H1 preservation harness

H1 is an executable acceptance gate for future ports. It does not rewrite a
game or make legacy repositories dependencies of the eventual production app.

## Current coverage

| Game | Locked oracle | Executable coverage |
| --- | --- | --- |
| Syllabl | `playsyllabl` source revision in `sources.lock.json` | Placement codes, frequency boundaries, rejection ordering, alternate pronunciation acceptance, immutable rejection, six-stage progression |
| Rarity | `rarity` source revision in `sources.lock.json` | Local validation order, exact scoring curve, tier boundaries, immutable rejection, one-submission lock, legacy save/restore shape |
| Gridl | `wordgrid` source revision in `sources.lock.json` | Golden tutorial solve, one-axis turns, crossing words, whole-board rejection, blocks, recall, reserve cap, portals, goal coverage, and the distinction between 31 authored boards and 179 placeholders |
| Expl41n | Remote revision locked | Input limits, AI-turn payloads, confidence outcomes, scoring, mode rules, Daily fallback, and service-failure behavior |
| Before&After | Local revision locked | Phrase direction, normalized answer acceptance, attempts, Daily timing, mode behavior, corpus composition, and legacy progress shape |
| DECODE | `mariogerardi.github.io` source revision in `sources.lock.json` | Duplicate-aware positional feedback, exact answer acceptance, Timed length thresholds and clock reset, Daily 5 sequence and elapsed clock, corpus size |

## Known legacy behavior

Gridl currently loses a portal cell's `special` marker when a staged tile is
moved away from that portal. The harness records this as a failing TODO rather
than silently canonizing it. Any correction still requires a separately
approved behavior change and regression.

The locked DECODE source ships two feedback-data errors (`LURE`→`GLUE` and
`PHOENIX`→`PARADOX`), one exact duplicate puzzle, and a nonfunctional Zen
button. Its legacy contract follows the documented color rules, records the
content anomalies, deduplicates the repeated puzzle, and excludes the broken
control. The current Hub adds a separately tested native Zen mode.

## Commands

```bash
npm test
npm run test:contracts
npm run test:legacy
npm run check
```

The full suite must have zero ordinary failures. Explicit TODO tests document
known legacy defects and must not be removed without a decision record.
