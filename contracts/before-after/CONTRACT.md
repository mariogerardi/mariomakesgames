# Before&After mechanics contract

Canonical revision:
`131c28d87debd7bc2560b66caf8b671555ae7eb6`

## Puzzle

Every puzzle has exactly two clue words and one bridge answer. The position
selects one of three phrase layouts:

- Before: `answer + clue one`, `answer + clue two`;
- After: `clue one + answer`, `clue two + answer`;
- Before & After: `answer + clue one`, `clue two + answer`.

Answers are trimmed and compared case-insensitively. The input accepts at most
15 characters. A non-empty submission counts as an attempt; rejected empty
submissions and post-completion submissions do not mutate state.

## Modes

- Packs: unlimited guesses, previous/next navigation, and locally restored
  solved progress.
- Daily: one deterministic puzzle for the local calendar day, 60 seconds, and
  unlimited guesses until the timer expires. A correct answer or timeout locks
  the session. Retry restarts the same puzzle.
- Archive: the prior 30 Daily selections with unlimited guesses.
- Custom: a player-created answer, two non-empty unique clues, and one of the
  three bridge positions. Created puzzles are stored on the device.

## Content

The web catalog includes 168 Before puzzles, 15 After puzzles, 11 Before &
After puzzles, and the 10-puzzle Minecraft pack: 204 authored puzzles total.
Explicit `???` and coming-soon placeholders from the shipped native packs are
not playable content.

## Progress

Solved puzzle IDs, attempts, duration, Daily completion dates, current streak,
and created puzzles restore from namespaced, device-local storage. Shared
cross-game identity and achievements remain H11 scope.
