# Third-party notices

## Sansita Swashed

The font files in `public/fonts/before-after/` are from the Sansita Swashed
project, copyright 2020 The Sansita Swashed Project Authors.

They are distributed under the SIL Open Font License, Version 1.1. The full
license is included at `public/fonts/before-after/OFL.txt`.

## Web fonts

The application loads Fredoka, IBM Plex Sans, Jost, and Manrope through Google
Fonts. Those typefaces remain subject to the licenses published with their
respective Google Fonts families.

## JavaScript packages

Third-party JavaScript dependencies remain subject to the licenses declared by
their package authors. Package names and locked versions are recorded in
`package-lock.json`.

## DUAL local authoring sources

DUAL currently ships a small manually curated fixture rather than a dictionary
export. Its Git-ignored local authoring pipeline uses structured Wiktionary data
extracted by Wiktextract and distributed by Kaikki. It also uses the local
`wordfreq` Python package as non-binding familiarity metadata; frequency never
determines dictionary validity. These source files and derived review artifacts
are not committed or distributed with the application. Wiktionary entry text is
available under the Creative Commons Attribution-ShareAlike 4.0 International
License and the GNU Free Documentation License; the exact generated snapshot,
revision, attribution, and applicable terms must be recorded when that data is
first bundled. See `docs/lexicon/dual.md` for the ingestion boundary.
