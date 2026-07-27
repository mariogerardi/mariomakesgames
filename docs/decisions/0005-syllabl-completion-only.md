# 0005 — Make Syllabl completion-only

Status: accepted for H3

## Context

Legacy Syllabl awards one to five points per accepted word from dictionary
frequency. The hub's flagship version should focus on satisfying each of the
six constraints, without rewarding obscure vocabulary or exposing a rarity
score.

## Decision

Production Syllabl has a binary result: a session is either in progress or
complete. An accepted word advances exactly one stage, and stage six completes
the puzzle.

The production engine preserves the legacy game's:

- minimum four-letter input;
- placement codes and validation order;
- remote dictionary-validity boundary;
- acceptance of any qualifying pronunciation;
- six-stage puzzle progression;
- immutable rejected attempts;
- daily puzzle ordering and session restoration.

Frequency and score do not appear in production attempts, guesses, sessions,
serialized state, or the word-validation response. Restoring a legacy session
retains accepted words and progress while discarding those fields.

## Consequences

The locked legacy contract and parity tests continue to document the old score
formula. They are historical evidence, not the production implementation.
Sharing and analytics may report completion and progress but must not recreate
an obscurity score.
