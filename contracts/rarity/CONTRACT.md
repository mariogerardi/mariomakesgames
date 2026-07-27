# Rarity mechanics contract

Canonical revision:
`f28224c10fc6fbb03b3593bc825e5b2179bf95a4`

This contract covers classic Rarity only.

## Local validation order

1. Require a loaded puzzle string.
2. Require at least four letters.
3. Require letters only.
4. Require case-insensitive inclusion of the complete puzzle string.
5. Call the word-information service.
6. Reject invalid or unscoreable results.
7. Accept and store one submission.
8. Lock further submissions for that puzzle.

Rejected attempts do not create a result or lock the game.

## Score

The score is a continuous 0–99.9999 mapping of Datamuse frequency:

1. convert frequency to `-log10(frequency + 1e-9)`;
2. normalize rarity from `-4` through `3.8`;
3. apply contrast `1.35`;
4. apply smoothstep;
5. expand the upper region from 90 through 99.9999;
6. round to five decimals.

Tier boundaries:

| Score | Tier |
|---:|---:|
| `< 30` | 1 |
| `< 50` | 2 |
| `< 70` | 3 |
| `< 90` | 4 |
| `< 97` | 5 |
| `>= 97` | 6 |

## Lock behavior

- Invalid attempts remain available.
- The first accepted submission sets `hasSubmitted`.
- Later submission handlers return without mutation.
- Local hydration restores the accepted word, score, and lock.
- Persistence retains the legacy `rarity_daily_YYYY-MM-DD` payload shape.
- Hydration reads `exactScore`, then legacy `rarityScore`, then recomputes from
  frequency, and derives the tier from that exact score.

## Exclusion

Rarity’s Gemboard mode is retired and not part of this contract.
