# Mechanics contracts

Contracts capture the smallest pure statements of existing game behavior.

## Current coverage

- [Syllabl](syllabl/CONTRACT.md)
- [Rarity](rarity/CONTRACT.md)
- [Gridl](gridl/CONTRACT.md)
- [DECODE](decode/CONTRACT.md)

Expl41n and Before&After receive contracts after their H7 and H9 audits.

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
