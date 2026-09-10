# Mechanics contracts

Contracts capture the smallest pure statements of existing game behavior.

## Current coverage

- [Syllabl](syllabl/CONTRACT.md)
- [Rarity](rarity/CONTRACT.md)
- [Gridl](gridl/CONTRACT.md)
- [Expl41n](expl41n/CONTRACT.md)
- [Before&After](before-after/CONTRACT.md)
- [DECODE](decode/CONTRACT.md)

These six documents preserve the imported legacy games. TOKEN and DUAL are
native Hub games, so their behavior is covered by their production engines and
regression tests rather than legacy-port preservation contracts. Public Hub
availability is tracked separately from contract coverage.

## Contract rule

A contract is not a redesign. It records:

- accepted input;
- rejected input;
- validation order;
- state mutations;
- scores;
- completion;
- persistence-relevant state.

The executable modules under `src/contracts/` preserve legacy behavior. Tests
under `test/legacy/` compare them with the locked legacy revisions. Intentional
production deviations are recorded separately as architecture decisions; the
first is Syllabl's completion-only result model.
