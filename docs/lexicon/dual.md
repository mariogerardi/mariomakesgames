# DUAL lexical data

DUAL's runtime engine does not query a dictionary. It consumes a compact,
normalized list of accepted surface spellings and their English/Spanish lexical
senses.

## Current first-pass data

`src/games/dual/data/lexicon.fixture.json` is a small manually curated fixture.
It is sufficient to exercise the complete game loop, but it is not presented as
an exhaustive English or Spanish dictionary. Each surface stores:

- canonical spelling;
- every language-specific analysis, dictionary lemma, and normalized game-family;
- part of speech where useful;
- an explicit lexical-policy decision;
- loanword review status;
- source provenance.

`lexicon.mjs` is the runtime boundary. The engine sees only entries whose policy
has already been resolved to `accepted: true`; it does not guess whether a word
is a loanword while somebody is playing.

## Local authoring pipeline

The implemented source is the English and Spanish JSONL extracted by
[Wiktextract](https://github.com/tatuylonen/wiktextract) and published by
[Kaikki](https://kaikki.org/). Run:

```bash
npm run dual:data
```

The resumable downloader stores its versioned source manifest and roughly 4 GB
of JSONL under `.local/dual-kaikki/raw/`. The streaming indexer then:

1. streams the English and Spanish source files rather than loading them whole;
2. retains canonical words, every sense, language, part of speech, headword/form-of links,
   and relevant etymology/source fields;
3. records exclusions for proper nouns, abbreviations, malformed artifacts, and unusable forms;
4. enforces headword closure and groups player-perceived morphology under stable,
   language-scoped game-family IDs;
5. retains homograph analyses instead of selecting one arbitrary sense;
6. runs loanword policy and manual inclusion/exclusion overrides;
7. calculates Duals only after lexical policy and family normalization;
8. computes complete substring pools, family-based capacity, and authoring metrics.

The resulting SQLite review database stays under `.local/dual-kaikki/`.
The Git-ignored `public/dual-builder-local/` directory contains a small
manifest and lazily loaded per-string pools for the browser Builder. Neither
location is part of a production checkout.

The Build destination appears only on localhost. The author enters the exact
three-letter string to analyze; the tool never selects or recommends a puzzle
string. For each chosen pool it exposes English/Spanish balance, score capacity, Dual count,
family concentration, homographs, accent collisions, low-frequency flags, and
words held for usage or loanword review. An author can explicitly include or exclude any surface,
edit the three puzzle goals, playtest the exact resulting lexicon, save a draft
to local storage, and download a complete review JSON file.

The `wordfreq` familiarity layer ranks and flags candidates for review. It is
never a validity gate and cannot silently remove a dictionary candidate.

## Current lexical policies

- **Homographs:** every source analysis remains visible. Connected analyses use
  one stable game-family for scoring, so source ordering cannot change points.
- **Accents:** exact spelling wins. Accent-folded input is accepted only when it
  resolves uniquely; collisions are flagged to the author.
- **Loanwords:** explicit English↔Spanish borrowing is held for review. Other
  etymologies remain visible and do not make ordinary words disappear.
- **Usage:** archaic, obsolete, misspelled, reconstructed, and unattested
  analyses carry explicit exclusions. Rare, dated, dialectal, slang, and
  similar analyses remain visible for review. A clean sense is not demoted by
  a restricted sense attached to the same spelling.
- **Forms:** ordinary inflections map back to their language-scoped headword;
  lemma closure guarantees that a qualifying headword is available whenever a
  related form is. A conservative morphology layer also joins player-obvious
  families such as `employ`/`employed` and `unique`/`uniquely`.
- **Coverage:** every eligible source record reaches SQLite or carries a
  recorded exclusion reason. Automated audits check lemma closure, named
  high-frequency regressions, and suspicious restricted vocabulary.

## Puzzle construction

Puzzle strings are selected from their answer pools, not generated blindly.
Before adding a puzzle, validate its available English and Spanish families,
achievable score, morphological concentration, and exact Dual count. A first
family on either language side earns `+1`; later inflected forms in that family
earn `+0.1`. A fresh Dual therefore earns `+2`, one point per language. EN/ES
minimums count distinct families, while inflections contribute only to the
overall score. Generated capacities and initial targets use these same rules.

## Licensing

The current shipped fixture is manually curated and is not a Kaikki export.
The generated authoring data remains local and ignored. Before any derived
lexicon is distributed, preserve the extraction revision and attribution,
include the applicable license notice, and review the share-alike requirements
against the exact source snapshot used.
