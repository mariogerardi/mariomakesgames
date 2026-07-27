# Expl41n mechanics contract

Canonical revision:
`f86996a7c5cdb34675c000c621d04bf4c18ac435`

## Puzzle and clue

- the challenge word is visible to the player and hidden from the AI;
- a clue is trimmed, non-empty, and at most 25 characters;
- the successful clue's character count is the score;
- lower scores are better;
- the first successful clue ends and locks the game.

## AI turn

The guess request receives:

- the current clue;
- every previous AI guess;
- the clue history, including the current clue.

The response contains one guess, confidence from 0–100, search space from
0–100, and a short reasoning message. The guess matches the challenge word
case-insensitively.

Transport failures do not consume a clue or attempt in the migrated game. The
legacy client consumed an attempt after substituting a failed response with
`Huh`; that behavior is treated as an availability defect, not a mechanic.

## Modes

- Daily: five attempts; win or loss restores for that local day.
- Shuffle: a random non-daily puzzle with unlimited attempts.
- Archive: any authored dated puzzle with unlimited attempts and a locally
  stored best successful clue length.
- Custom: one non-empty, single-word challenge chosen by the player, with
  unlimited attempts.

## Daily content

The locked corpus contains 380 records from February 1, 2025 through February
15, 2026. An exact authored date is authoritative. Dates after the authored
range use a deterministic rotation through the locked corpus so Daily remains
playable.

## Presentation and progress

Confidence controls the AI emotion thresholds:

- 0–10 angry;
- 11–30 confused;
- 31–50 suspicious;
- 51–60 side-eye;
- 61–80 happy;
- 81–100 surprised;
- victory and loss override the confidence mood.

Daily sessions, Daily best scores, Archive best scores, and the authored
archive restore locally. The legacy leaderboard remains a best-score boundary;
the local result stays authoritative if that service is unavailable.

Legacy theme skins and their achievement-gated unlocks are presentation-layer
systems, not gameplay rules. They are superseded by the shared hub identity;
shared achievements and identity remain H11 scope.
