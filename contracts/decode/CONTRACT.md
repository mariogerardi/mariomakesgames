# DECODE mechanics contract

Canonical revision:
`db2e50e16b04ef317f116583a37a19a72a0b8fc9`

Live reference: <https://mariogerardi.github.io/>

## Puzzle

Every puzzle contains an answer, a same-length clue word, a definition-style
answer clue, and one positional state for each clue-word letter:

- `correct`: the letter is in the answer at the same index;
- `present`: the letter is in the answer at another index;
- `absent`: no unmatched copy of the letter remains in the answer.

Feedback uses a two-pass comparison: exact matches consume letters first, then
misplaced matches consume the remaining answer-letter counts. This preserves
duplicate-letter behavior.

Answers are case-insensitive and must equal the complete answer. Incorrect or
incomplete attempts do not change score, time, or puzzle progress.

## Timed

- Start each puzzle with 20 seconds.
- A correct answer adds one point and resets the next puzzle to 20 seconds.
- Scores 0–9 use four-letter puzzles.
- Scores 10–19 use five-letter puzzles.
- Scores 20–29 use six-letter puzzles.
- Scores 30 and above use seven-letter puzzles.
- Reaching zero ends the run and reveals the current answer.

## Daily 5

- Solve exactly five puzzles in order.
- Lengths are 4, 5, 6, 6, and 7.
- The elapsed clock counts upward and does not impose a limit.
- The fifth correct answer completes the session and reports time, answers, and
  theme.

The locked legacy release contains one fixed sea-creature set; it does not
rotate by calendar date or persist completion.

## Known legacy defects

- The visible `ZEN` button calls an undefined function and is not a working
  mode, so it is excluded from the mechanics contract.
- Two authored feedback arrays disagree with the documented positional rules:
  `LURE`→`GLUE` and `PHOENIX`→`PARADOX`. H1 derives the intended feedback and
  records both source anomalies in the golden fixture.
- The six-letter `COBALT`→`BALLOT` puzzle is duplicated verbatim, unintentionally
  doubling its random-selection weight. The port should deduplicate it.

These corrections are explicit preservation decisions: retain the stated game
rules, not accidental data-entry errors or a nonfunctional control.
