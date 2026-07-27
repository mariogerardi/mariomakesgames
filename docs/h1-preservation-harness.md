# H1 preservation harness

H1 is an executable acceptance gate for future ports. It does not rewrite a
game or make legacy repositories dependencies of the eventual production app.

## Current coverage

| Game | Locked oracle | Executable coverage |
| --- | --- | --- |
| Syllabl | `playsyllabl` source revision in `sources.lock.json` | Placement codes, frequency boundaries, rejection ordering, alternate pronunciation acceptance, immutable rejection, six-stage progression |
| Rarity | `rarity` source revision in `sources.lock.json` | Local validation order, exact scoring curve, tier boundaries, immutable rejection, one-submission lock, legacy save/restore shape |
| Gridl | `wordgrid` source revision in `sources.lock.json` | Golden tutorial solve, one-axis turns, crossing words, whole-board rejection, blocks, recall, reserve cap, portals, goal coverage, all 210 level files |
| Expl41n | Remote revision locked | Contract extraction begins when its port reaches the launch queue |
| Before&After | Local revision locked | Contract extraction begins when its port reaches the launch queue |
| DECODE | `mariogerardi.github.io` source revision in `sources.lock.json` | Duplicate-aware positional feedback, exact answer acceptance, Timed length thresholds and clock reset, Daily 5 sequence and elapsed clock, corpus size |

## Known legacy behavior

Gridl currently loses a portal cell's `special` marker when a staged tile is
moved away from that portal. The harness records this as a failing TODO rather
than silently canonizing it. Before the Gridl port, decide whether to preserve
the defect for exact parity or correct it with a separately approved behavior
change.

DECODE ships two feedback-data errors (`LURE`→`GLUE` and
`PHOENIX`→`PARADOX`), one exact duplicate puzzle, and a nonfunctional Zen
button. Its contract follows the documented color rules, records the content
anomalies, deduplicates the repeated puzzle, and excludes Zen rather than
preserving accidental behavior.

## Commands

```bash
npm test
npm run test:contracts
npm run test:legacy
npm run check
```

The full suite must have zero ordinary failures. Explicit TODO tests document
known legacy defects and must not be removed without a decision record.
