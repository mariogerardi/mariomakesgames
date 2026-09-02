#!/usr/bin/env python3
import json
import math
import sys
import unicodedata
from importlib.metadata import version
from pathlib import Path

from wordfreq import get_frequency_dict

wordfreq_version = version("wordfreq")


def playable(value: str) -> bool:
    return 3 <= len(value) <= 32 and all(character.isalpha() for character in value)


output_root = Path(sys.argv[1])
output_root.mkdir(parents=True, exist_ok=True)
counts = {}

for language in ("en", "es"):
    frequencies = get_frequency_dict(language, wordlist="best")
    destination = output_root / f"wordfreq-{language}.tsv"
    count = 0
    with destination.open("w", encoding="utf-8") as output:
        for surface, frequency in frequencies.items():
            normalized = unicodedata.normalize("NFC", surface.strip().lower())
            if not playable(normalized) or frequency <= 0:
                continue
            zipf = round(math.log10(frequency) + 9, 2)
            output.write(f"{normalized}\t{zipf:.2f}\n")
            count += 1
    counts[language] = count
    print(f"wordfreq {language}: {count:,} single-word frequencies")

(output_root / "wordfreq-source.json").write_text(
    json.dumps(
        {
            "package": "wordfreq",
            "version": wordfreq_version,
            "citation": "Robyn Speer (2022), rspeer/wordfreq v3.0, DOI 10.5281/zenodo.7199437",
            "purpose": "Local-only familiarity calibration; not exported as a standalone frequency list",
            "counts": counts,
        },
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)
