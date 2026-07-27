# Syllabl legacy mechanics contract

Canonical revision:
`1783c3ab2aa6ae117ea6af82f77969528e5a4f82`

## Puzzle

Each puzzle contains:

- one three-letter `puzzleLetters` string;
- six `inputsEnabled` placement codes;
- six `syllablesRequired` values.

Stage indexes run from 0 through 5.

## Placement codes

| Code | Rule |
|---:|---|
| 1 | word ends with the puzzle string |
| 2 | word begins with the puzzle string |
| 3 | word contains the string but neither begins nor ends with it |
| 4 | word begins and ends with the string |

## Legacy attempt order

1. Normalize to lowercase.
2. Reject fewer than four letters.
3. Reject incorrect placement.
4. Reject invalid/unscoreable dictionary response.
5. Accept if any returned syllable parse has the required count.
6. Score from frequency.
7. Append one guess.
8. Advance exactly one stage.
9. Persist daily progress.
10. Complete at stage 6.

Rejected attempts do not change stage, guesses, or score.

## Legacy frequency score

| Frequency | Points |
|---:|---:|
| `>= 100` | 1 |
| `>= 10` | 2 |
| `>= 1` | 3 |
| `>= 0.1` | 4 |
| `< 0.1` | 5 |

## Pronunciation

Acceptance uses any matching entry in `syllableParses`, not only the service’s
primary count.

## Persisted daily state

```json
{
  "puzzleLetters": "gue",
  "currentStage": 1,
  "guesses": [],
  "score": 0,
  "puzzleDate": "YYYY-MM-DD"
}
```

Storage key:

```text
syllabl_daily_YYYY-MM-DD
```

## H3 production deviation

The hub intentionally retires frequency-based scoring. The production engine
preserves normalization, minimum length, placement, remote validity, alternate
pronunciations, six-stage progression, rejection immutability, and completion.
An accepted word advances one stage; completing all six stages is the result.

Legacy score behavior remains documented and executable as migration evidence.
It is not part of the production Syllabl state or word-validation boundary. See
`docs/decisions/0005-syllabl-completion-only.md`.
