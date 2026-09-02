export const DUAL_LANGUAGES = Object.freeze(["en", "es"]);

export function normalizeDualInput(value) {
  return String(value ?? "").trim().toLocaleLowerCase().normalize("NFC");
}

export function foldDualAccents(value) {
  return Array.from(normalizeDualInput(value), (character) => {
    if (character === "ñ") return character;
    return character.normalize("NFD").replace(/\p{M}/gu, "");
  }).join("");
}

export function createDualLexicon(entries) {
  const acceptedEntries = entries.filter((entry) => entry.policy?.accepted === true);
  const byExact = new Map();
  const byFolded = new Map();

  for (const entry of acceptedEntries) {
    const exact = normalizeDualInput(entry.surface);
    const folded = foldDualAccents(entry.surface);
    if (!byExact.has(exact)) byExact.set(exact, []);
    if (!byFolded.has(folded)) byFolded.set(folded, []);
    byExact.get(exact).push(entry);
    byFolded.get(folded).push(entry);
  }

  return { entries: acceptedEntries, byExact, byFolded };
}

export function resolveDualInput(lexicon, input) {
  const normalized = normalizeDualInput(input);
  if (!normalized) return { status: "empty", entry: null, candidates: [] };

  const exactCandidates = lexicon.byExact.get(normalized) ?? [];
  if (exactCandidates.length === 1) {
    return { status: "resolved", entry: exactCandidates[0], candidates: exactCandidates, normalizedByAccent: false };
  }
  if (exactCandidates.length > 1) {
    return { status: "ambiguous", entry: null, candidates: exactCandidates };
  }

  const foldedCandidates = lexicon.byFolded.get(foldDualAccents(normalized)) ?? [];
  if (foldedCandidates.length === 1) {
    return { status: "resolved", entry: foldedCandidates[0], candidates: foldedCandidates, normalizedByAccent: true };
  }
  if (foldedCandidates.length > 1) {
    return { status: "ambiguous", entry: null, candidates: foldedCandidates };
  }
  return { status: "unknown", entry: null, candidates: [] };
}

export function canonicalContainsSequence(surface, sequence) {
  return normalizeDualInput(surface).includes(normalizeDualInput(sequence));
}

export function dualEntryLanguages(entry) {
  return [...new Set(entry.senses.map((sense) => sense.language))];
}

export function isDualEntry(entry) {
  const languages = dualEntryLanguages(entry);
  return languages.includes("en") && languages.includes("es");
}

function isTransparentEnglishVerbForm(surface, lemma) {
  if (!lemma || surface === lemma) return false;
  const forms = new Set([
    `${lemma}s`, `${lemma}ed`, `${lemma}ing`,
    lemma.endsWith("e") ? `${lemma.slice(0, -1)}ing` : "",
    lemma.endsWith("e") ? `${lemma}d` : "",
    lemma.endsWith("y") ? `${lemma.slice(0, -1)}ied` : "",
  ]);
  const final = lemma.at(-1);
  if (final && /[bdgmnprt]/.test(final)) {
    forms.add(`${lemma}${final}ed`);
    forms.add(`${lemma}${final}ing`);
  }
  return forms.has(surface);
}

function spanishParadigmFamily(entry, senses) {
  const surface = normalizeDualInput(entry.surface);
  const inflections = senses.filter((sense) => sense.formKind === "inflection" &&
    (sense.partOfSpeech === "adj" || sense.partOfSpeech === "noun"));
  const base = surface.endsWith("as") || surface.endsWith("os")
    ? surface.slice(0, -2)
    : surface.endsWith("a")
      ? surface.slice(0, -1)
      : "";
  if (!base) return null;
  const masculine = `${base}o`;
  const direct = inflections.find((sense) => normalizeDualInput(sense.lemma) === masculine);
  if (direct) return normalizeDualInput(direct.familyId || direct.lemma);
  const pluralParent = inflections.find((sense) => {
    const lemma = normalizeDualInput(sense.lemma);
    return surface === `${lemma}s` || surface === `${lemma}es`;
  });
  return pluralParent ? normalizeDualInput(pluralParent.familyId || pluralParent.lemma) : null;
}

function isTransparentSpanishAdjectiveOrNounForm(surface, lemma) {
  if (!lemma || surface === lemma) return false;
  const forms = new Set([`${lemma}s`, `${lemma}es`]);
  if (lemma.endsWith("o")) {
    const stem = lemma.slice(0, -1);
    forms.add(`${stem}a`); forms.add(`${stem}os`); forms.add(`${stem}as`);
  }
  if (lemma.endsWith("or")) {
    forms.add(`${lemma}a`); forms.add(`${lemma}as`); forms.add(`${lemma}es`);
  }
  const superlativeStem = lemma.endsWith("e") ? lemma.slice(0, -1) : lemma;
  for (const ending of ["ísimo", "ísima", "ísimos", "ísimas"]) forms.add(`${superlativeStem}${ending}`);
  return forms.has(surface);
}

function isExplicitSpanishDerivedForm(sense) {
  return /\b(?:feminine|masculine|female equivalent|male equivalent|diminutive|augmentative|superlative degree)\b/i.test(String(sense.gloss ?? ""));
}

function isTransparentSpanishVerbForm(surface, lemma) {
  if (!lemma || surface === lemma) return false;
  const stem = lemma.slice(0, -2);
  const suffix = lemma.endsWith("ar") ? "ad" : lemma.endsWith("er") || lemma.endsWith("ir") ? "id" : "";
  if (!stem || !suffix) return false;
  return ["o", "a", "os", "as"].some((ending) => surface === `${stem}${suffix}${ending}`);
}

function transparentInflectionParent(entry, language, senses) {
  const surface = normalizeDualInput(entry.surface);
  if (language === "es") {
    const paradigm = spanishParadigmFamily(entry, senses);
    if (paradigm) return paradigm;
    const direct = senses.find((sense) => sense.formKind === "inflection" &&
      (sense.partOfSpeech === "adj" || sense.partOfSpeech === "noun") &&
      isTransparentSpanishAdjectiveOrNounForm(surface, normalizeDualInput(sense.lemma)));
    if (direct) return direct;
    const explicitlyDerived = senses.find((sense) => sense.formKind === "inflection" &&
      (sense.partOfSpeech === "adj" || sense.partOfSpeech === "noun") && isExplicitSpanishDerivedForm(sense));
    if (explicitlyDerived) return explicitlyDerived;
    return senses.find((sense) => sense.formKind === "inflection" && sense.partOfSpeech === "verb" &&
      isTransparentSpanishVerbForm(surface, normalizeDualInput(sense.lemma)));
  }
  return senses.find((sense) => {
    if (sense.formKind !== "inflection") return false;
    const lemma = normalizeDualInput(sense.lemma);
    if (language === "en") {
      return sense.partOfSpeech === "verb" && isTransparentEnglishVerbForm(surface, lemma);
    }
    return false;
  });
}

export function dualEntryFamily(entry, language) {
  const assigned = entry.familyAssignments?.[language];
  if (assigned) return normalizeDualInput(assigned);
  const senses = entry.senses.filter((sense) => sense.language === language);
  const exactHeadwords = senses.filter((sense) =>
    sense.formKind === "lemma" && normalizeDualInput(sense.lemma) === normalizeDualInput(entry.surface));
  const exactLexicalNoun = exactHeadwords.find((sense) => sense.partOfSpeech === "noun");
  if (language === "es" && exactLexicalNoun) {
    return normalizeDualInput(exactLexicalNoun.familyId || exactLexicalNoun.lemma);
  }
  if (language === "en" && exactHeadwords.length >= 3) {
    return normalizeDualInput(exactHeadwords[0].familyId || exactHeadwords[0].lemma);
  }
  const inflectionParent = transparentInflectionParent(entry, language, senses);
  if (typeof inflectionParent === "string") return inflectionParent;
  if (inflectionParent) return normalizeDualInput(inflectionParent.familyId || inflectionParent.lemma);
  const exactHeadword = exactHeadwords[0];
  if (exactHeadword) return normalizeDualInput(exactHeadword.familyId || exactHeadword.lemma);
  const families = [...new Set(senses.map((sense) => normalizeDualInput(sense.familyId || sense.lemma)))].sort();
  return families[0] ?? "";
}

export function dualFamilyKey(sense) {
  const family = sense.familyId || sense.lemma;
  return `${sense.language}:${normalizeDualInput(family)}`;
}

// Retained as a compatibility alias for older imports. Scoring is family-based.
export const dualLemmaKey = dualFamilyKey;
