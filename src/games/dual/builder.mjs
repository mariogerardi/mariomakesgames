import { dualEntryFamily, foldDualAccents, normalizeDualInput } from "./lexicon.mjs";

export const DUAL_BUILDER_ASSIGNMENTS = Object.freeze([
  "default", "en", "es", "both", "review", "exclude",
]);
export const DUAL_FAMILIARITY_INCLUDED_ZIPF = 2.5;
export const DUAL_FAMILIARITY_BORDERLINE_ZIPF = 2;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeDualBuilderAssignment(value) {
  if (value && typeof value === "object" && typeof value.assignment === "string") {
    return normalizeDualBuilderAssignment(value.assignment);
  }
  if (value === "include") return "both";
  if (value === "excluded") return "exclude";
  return DUAL_BUILDER_ASSIGNMENTS.includes(value) ? value : "default";
}

export function dualBuilderLanguageFamiliarity(entry, language) {
  const senses = entry.senses.filter((sense) => sense.language === language);
  const candidates = senses.filter((sense) => sense.status !== "excluded");
  const frequencies = candidates.map((sense) => sense.zipf).filter(Number.isFinite);
  const zipf = frequencies.length ? Math.max(...frequencies) : null;
  const tier = zipf == null ? "missing"
    : zipf >= DUAL_FAMILIARITY_INCLUDED_ZIPF ? "familiar"
      : zipf >= DUAL_FAMILIARITY_BORDERLINE_ZIPF ? "borderline"
        : "low";
  return { language, zipf, tier, hasAnalysis: candidates.length > 0 };
}

export function dualBuilderFamilyAmbiguity(entry, language) {
  if (language !== "es") return [];
  const surface = normalizeDualInput(entry.surface);
  const senses = entry.senses.filter((sense) => sense.language === language && sense.status !== "excluded");
  const exactLexicalNoun = senses.some((sense) => sense.formKind === "lemma" &&
    sense.partOfSpeech === "noun" && normalizeDualInput(sense.lemma) === surface);
  if (exactLexicalNoun) return [];
  const base = surface.endsWith("as") || surface.endsWith("os") ? surface.slice(0, -2)
    : surface.endsWith("a") ? surface.slice(0, -1) : "";
  const directGenderFamilies = unique(senses.filter((sense) => {
    const lemma = normalizeDualInput(sense.lemma);
    return sense.formKind === "inflection" && base && lemma === `${base}o` &&
      (sense.partOfSpeech === "adj" || sense.partOfSpeech === "noun");
  }).map((sense) => normalizeDualInput(sense.familyId || sense.lemma)));
  const pluralNounFamilies = unique(senses.filter((sense) => {
    if (sense.formKind !== "inflection" || sense.partOfSpeech !== "noun") return false;
    const foldedSurface = foldDualAccents(surface);
    const foldedLemma = foldDualAccents(sense.lemma);
    return foldedSurface === `${foldedLemma}s` || foldedSurface === `${foldedLemma}es`;
  }).map((sense) => normalizeDualInput(sense.familyId || sense.lemma)));

  // A participle/adjective may also point to its verb (agitada → agitar),
  // without making the direct gender/number parent ambiguous (→ agitado).
  if (directGenderFamilies.length === 1) {
    const [directFamily] = directGenderFamilies;
    const competingPluralNounFamilies = pluralNounFamilies.filter((family) => family !== directFamily);
    const directNounSenses = senses.filter((sense) =>
      normalizeDualInput(sense.familyId || sense.lemma) === directFamily && sense.partOfSpeech === "noun");
    const directNounIsParadigmatic = directNounSenses.some((sense) =>
      /\b(?:feminine|masculine|female equivalent|male equivalent|plural)\b/i.test(String(sense.gloss ?? "")));
    const directHasVerbAnalysis = senses.some((sense) =>
      normalizeDualInput(sense.familyId || sense.lemma) === directFamily && sense.partOfSpeech === "verb");
    const competingVerbFamilies = unique(senses.filter((sense) =>
      sense.formKind === "inflection" && sense.partOfSpeech === "verb" &&
      normalizeDualInput(sense.familyId || sense.lemma) !== directFamily,
    ).map((sense) => normalizeDualInput(sense.familyId || sense.lemma)));
    if (competingPluralNounFamilies.length && !directNounIsParadigmatic) {
      const lexicalDirectNoun = directNounSenses.length > 0;
      return unique([directFamily, ...competingPluralNounFamilies,
        ...(lexicalDirectNoun ? competingVerbFamilies : [])]).sort();
    }
    return competingVerbFamilies.length && !directHasVerbAnalysis
      ? [directFamily, ...competingVerbFamilies].sort()
      : [];
  }
  const families = new Set();
  for (const sense of senses) {
    if (sense.formKind !== "inflection") continue;
    if (sense.partOfSpeech === "verb") families.add(normalizeDualInput(sense.familyId || sense.lemma));
  }
  if (pluralNounFamilies.length && families.size) {
    return unique([...pluralNounFamilies, ...families]).sort();
  }
  return families.size > 1 ? [...families].sort() : [];
}

export function dualBuilderModernSharedLoanwordLanguages(entry) {
  const surface = normalizeDualInput(entry.surface);
  const loanwordStatuses = entry.policy.loanwordStatuses ?? [];
  if (loanwordStatuses.includes("historical") || loanwordStatuses.includes("cross-language")) return [];
  const exact = (language) => entry.senses.filter((sense) =>
    sense.language === language && sense.status !== "excluded" && sense.formKind === "lemma" &&
    normalizeDualInput(sense.lemma) === surface);
  const english = exact("en");
  const spanish = exact("es");
  const englishTerms = new Set(entry.senses.filter((sense) => sense.language === "en" && sense.status !== "excluded")
    .flatMap((sense) => [normalizeDualInput(sense.lemma), normalizeDualInput(sense.familyId)]));
  const spanishSignalsBorrowing = spanish.some((sense) => {
    const gloss = normalizeDualInput(sense.gloss);
    const isUnmarkedEcho = gloss === surface &&
      (loanwordStatuses.length === 0 || loanwordStatuses.every((status) => status === "unmarked"));
    const referencesDistinctEnglishFamily = gloss !== surface && englishTerms.has(gloss);
    return isUnmarkedEcho || gloss.startsWith("alternative spelling of ") || referencesDistinctEnglishFamily;
  });
  return english.length && spanishSignalsBorrowing ? ["es"] : [];
}

function hasSubstantiveAcceptedEvidence(entry, language) {
  return entry.senses.some((sense) =>
    sense.language === language && sense.status === "accepted" &&
    sense.partOfSpeech !== "unknown" &&
    !String(sense.reason ?? "").startsWith("lemma-closure:"));
}

function sourceLanguageStatus(entry, language) {
  const senses = entry.senses.filter((sense) => sense.language === language);
  if (senses.some((sense) => sense.status === "accepted")) {
    if (dualBuilderModernSharedLoanwordLanguages(entry).includes(language)) return "review";
    if (dualBuilderFamilyAmbiguity(entry, language).length > 1) return "review";
    if (!hasSubstantiveAcceptedEvidence(entry, language)) return "review";
    const familiarity = dualBuilderLanguageFamiliarity(entry, language);
    // Review remains quarantined by default. Borderline source frequency is enough
    // to seed an ordinary family; low or missing material needs a playable relation.
    return familiarity.tier === "familiar" || familiarity.tier === "borderline"
      ? "included"
      : "review";
  }
  if (senses.some((sense) => sense.status === "review")) return "review";
  return senses.length ? "excluded" : "absent";
}

export function defaultDualBuilderAssignment(entry) {
  const en = sourceLanguageStatus(entry, "en");
  const es = sourceLanguageStatus(entry, "es");
  if (en === "included" && es === "included") return "both";
  if (en === "included") return "en";
  if (es === "included") return "es";
  if (en === "review" || es === "review") return "review";
  return "exclude";
}

export function dualBuilderEntryState(entry, override = "default") {
  const normalizedOverride = normalizeDualBuilderAssignment(override);
  const sourceAssignment = defaultDualBuilderAssignment(entry);
  const assignment = normalizedOverride === "default" ? sourceAssignment : normalizedOverride;
  const languages = assignment === "both" ? ["en", "es"]
    : assignment === "en" ? ["en"]
      : assignment === "es" ? ["es"]
        : [];
  const reviewLanguages = normalizedOverride === "default"
    ? ["en", "es"].filter((language) => sourceLanguageStatus(entry, language) === "review")
    : assignment === "review"
      ? ["en", "es"].filter((language) => entry.senses.some((sense) => sense.language === language && sense.status !== "excluded"))
      : [];
  return {
    assignment,
    sourceAssignment,
    languages,
    reviewLanguages,
    status: languages.length ? "playable" : assignment === "review" ? "review" : "excluded",
    manual: normalizedOverride !== "default",
  };
}

export function effectiveDualBuilderSenses(entry, override = "default") {
  const state = dualBuilderEntryState(entry, override);
  if (state.status !== "playable") return [];
  return entry.senses.filter((sense) => {
    if (!state.languages.includes(sense.language)) return false;
    if (state.manual) return sense.status !== "excluded";
    return sense.status === "accepted";
  });
}

function overrideAllowsLanguage(override, language) {
  const assignment = normalizeDualBuilderAssignment(override);
  return assignment === "default" || assignment === "both" || assignment === language;
}

function reviewBlocksLanguage(entry, override, language) {
  const assignment = normalizeDualBuilderAssignment(override);
  if (assignment !== "default") return !overrideAllowsLanguage(override, language);
  return dualBuilderModernSharedLoanwordLanguages(entry).includes(language) ||
    !hasSubstantiveAcceptedEvidence(entry, language);
}

function familyHeadBlocksLanguage(entry, override, language) {
  const assignment = normalizeDualBuilderAssignment(override);
  if (assignment !== "default") return !overrideAllowsLanguage(override, language);
  // Same-language playable morphology is enough to corroborate an otherwise
  // accepted family head. Only explicit source/policy blocks survive that
  // closure; an inferred shared-spelling review signal does not.
  return !hasSubstantiveAcceptedEvidence(entry, language) ||
    entry.policy.loanwordStatuses?.includes("cross-language");
}

function isTransparentAttestedFamily(surface, family, sense, language) {
  if (sense.formKind !== "inflection") return false;
  if (language === "en" && sense.partOfSpeech === "verb") {
    const forms = new Set([
      `${family}s`, `${family}ed`, `${family}ing`,
      family.endsWith("e") ? `${family}d` : "",
      family.endsWith("e") ? `${family.slice(0, -1)}ing` : "",
      family.endsWith("y") ? `${family.slice(0, -1)}ied` : "",
    ]);
    const final = family.at(-1);
    if (final && /[bdgmnprt]/.test(final)) {
      forms.add(`${family}${final}ed`);
      forms.add(`${family}${final}ing`);
    }
    return forms.has(surface);
  }
  if (language === "es" && (sense.partOfSpeech === "adj" || sense.partOfSpeech === "noun")) {
    const foldedSurface = foldDualAccents(surface);
    const foldedFamily = foldDualAccents(family);
    return surface === `${family}s` || surface === `${family}es` ||
      foldedSurface === `${foldedFamily}s` || foldedSurface === `${foldedFamily}es` ||
      ((surface.endsWith("a") || surface.endsWith("as")) &&
        (family.endsWith("o") || family.endsWith("os")) &&
        surface.replace(/as?$/, "") === family.replace(/os?$/, ""));
  }
  return false;
}

function safeScoringFamily(sourceEntry, runtime, language, entriesBySurface, familyOverride) {
  const proposed = dualEntryFamily(runtime, language);
  const surface = normalizeDualInput(sourceEntry.surface);
  const familySenses = sourceEntry.senses.filter((sense) => sense.language === language && sense.status !== "excluded");
  const familyIsAttested = (family) => {
    const normalized = normalizeDualInput(family);
    const matching = familySenses.filter((sense) => normalizeDualInput(sense.familyId || sense.lemma) === normalized);
    if (!matching.length) return false;
    if (matching.some((sense) => sense.formKind === "lemma" && normalizeDualInput(sense.lemma) === surface)) return true;
    if (matching.some((sense) => String(sense.reason ?? "").startsWith("headword:"))) return true;
    if (matching.some((sense) => isTransparentAttestedFamily(surface, normalized, sense, language))) return true;
    const parent = entriesBySurface.get(normalized);
    return Boolean(parent?.senses.some((sense) => sense.language === language && sense.status !== "excluded"));
  };
  const terminalFamily = (family) => {
    let current = normalizeDualInput(family);
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const parent = entriesBySurface.get(current);
      if (!parent) break;
      const parentSenses = parent.senses.filter((sense) => sense.language === language && sense.status !== "excluded");
      if (!parentSenses.length) break;
      const next = normalizeDualInput(dualEntryFamily({ ...parent, senses: parentSenses }, language));
      if (!next || next === current || seen.has(next)) break;
      if (!parentSenses.some((sense) => normalizeDualInput(sense.familyId || sense.lemma) === next)) break;
      current = next;
    }
    return current;
  };
  const safeFamilies = unique(familySenses
    .map((sense) => normalizeDualInput(sense.familyId || sense.lemma))
    .filter(familyIsAttested)).sort();
  const selected = normalizeDualInput(familyOverride);
  if (selected && safeFamilies.includes(selected)) {
    const terminal = terminalFamily(selected);
    return familyIsAttested(terminal) ? terminal : selected;
  }
  if (dualBuilderFamilyAmbiguity(sourceEntry, language).length > 1) return null;
  if (proposed && familyIsAttested(proposed)) {
    const terminal = terminalFamily(proposed);
    return familyIsAttested(terminal) ? terminal : proposed;
  }
  return safeFamilies.length === 1 ? safeFamilies[0] : null;
}

function runtimeEntry(entry, override, forcedLanguages, entriesBySurface, familyOverrides) {
  const senses = effectiveDualBuilderSenses(entry, override);
  for (const language of forcedLanguages ?? []) {
    if (!overrideAllowsLanguage(override, language)) continue;
    for (const sense of entry.senses.filter((item) => item.language === language && item.status === "accepted")) {
      if (!senses.includes(sense)) senses.push(sense);
    }
  }
  if (senses.length === 0) return null;
  const runtime = {
    surface: entry.surface,
    senses: senses.map(({ language, lemma, familyId, formKind, partOfSpeech }) => ({
      language,
      lemma,
      familyId,
      formKind,
      partOfSpeech,
    })),
    familyAssignments: {},
    policy: {
      accepted: true,
      loanwordStatus: entry.policy.loanwordStatuses.join(",") || "unmarked",
      decision: dualBuilderEntryState(entry, override).manual ? "puzzle-override" : "generated-default",
    },
    source: { kind: "kaikki-builder" },
  };
  for (const language of ["en", "es"]) {
    if (runtime.senses.some((sense) => sense.language === language)) {
      const family = safeScoringFamily(entry, runtime, language, entriesBySurface, familyOverrides?.[entry.surface]?.[language]);
      if (family) runtime.familyAssignments[language] = family;
      else runtime.senses = runtime.senses.filter((sense) => sense.language !== language);
    }
  }
  return runtime.senses.length ? runtime : null;
}

export function buildDualBuilderLexicon(entries, overrides = {}, familyOverrides = {}) {
  const entriesBySurface = new Map(entries.map((entry) => [normalizeDualInput(entry.surface), entry]));
  const transparentChildren = new Map();
  for (const entry of entries) {
    const surface = normalizeDualInput(entry.surface);
    for (const sense of entry.senses.filter((item) => item.status === "accepted")) {
      const family = normalizeDualInput(sense.familyId || sense.lemma);
      if (!isTransparentAttestedFamily(surface, family, sense, sense.language)) continue;
      const key = `${sense.language}:${family}`;
      if (!transparentChildren.has(key)) transparentChildren.set(key, new Set());
      transparentChildren.get(key).add(entry);
    }
  }
  const forcedLanguages = new Map();
  const runtimeBySurface = new Map();
  const rebuild = (entry) => {
    const runtime = runtimeEntry(entry, overrides[entry.surface] ?? "default", forcedLanguages.get(entry.surface), entriesBySurface, familyOverrides);
    if (runtime) runtimeBySurface.set(entry.surface, runtime);
    else runtimeBySurface.delete(entry.surface);
    return runtime;
  };
  for (const entry of entries) rebuild(entry);

  // Establish confidence once from source-playable evidence. Keys include the
  // language so a strong English family can never bootstrap its Spanish side
  // (or vice versa), and no result depends on entry iteration order.
  const confidentFamilySides = new Map();
  for (const runtime of runtimeBySurface.values()) {
    for (const language of unique(runtime.senses.map((sense) => sense.language))) {
      const family = normalizeDualInput(runtime.familyAssignments[language]);
      if (family) confidentFamilySides.set(`${language}:${family}`, { language, family });
    }
  }

  const forceLanguage = (entry, language) => {
    if (!forcedLanguages.has(entry.surface)) forcedLanguages.set(entry.surface, new Set());
    forcedLanguages.get(entry.surface).add(language);
  };
  for (const { language, family } of confidentFamilySides.values()) {
    const parent = entriesBySurface.get(family);
    if (parent) {
      const parentOverride = overrides[parent.surface] ?? "default";
      const hasFamilyOverride = Boolean(familyOverrides?.[parent.surface]?.[language]);
      const familyIsAmbiguous = dualBuilderFamilyAmbiguity(parent, language).length > 1;
      if (overrideAllowsLanguage(parentOverride, language) &&
          !familyHeadBlocksLanguage(parent, parentOverride, language) &&
          (!familyIsAmbiguous || hasFamilyOverride)) {
        forceLanguage(parent, language);
      }
    }

    for (const child of transparentChildren.get(`${language}:${family}`) ?? []) {
      const childOverride = overrides[child.surface] ?? "default";
      const hasFamilyOverride = Boolean(familyOverrides?.[child.surface]?.[language]);
      const familyIsAmbiguous = dualBuilderFamilyAmbiguity(child, language).length > 1;
      if (!overrideAllowsLanguage(childOverride, language)) continue;
      if (reviewBlocksLanguage(child, childOverride, language)) continue;
      if (familyIsAmbiguous && !hasFamilyOverride) continue;
      forceLanguage(child, language);
    }
  }

  // Apply the completed language/family decision in one pass. This is
  // deliberately not a mutation-driven fixed point: siblings cannot make one
  // another eligible merely because one happened to be processed first.
  for (const entry of entries) rebuild(entry);
  return entries.flatMap((entry) => runtimeBySurface.has(entry.surface) ? [runtimeBySurface.get(entry.surface)] : []);
}

export function dualBuilderPlayableLanguages(entries, overrides = {}, familyOverrides = {}) {
  return new Map(buildDualBuilderLexicon(entries, overrides, familyOverrides).map((entry) => [
    entry.surface,
    unique(entry.senses.map((sense) => sense.language)),
  ]));
}

function clamp(minimum, value, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateDualBuilderMetrics(entries, overrides = {}, familyOverrides = {}) {
  const lexicon = buildDualBuilderLexicon(entries, overrides, familyOverrides);
  const familySurfaces = { en: new Map(), es: new Map() };
  const surfaceCounts = { en: 0, es: 0 };
  let duals = 0;

  for (const entry of lexicon) {
    const languages = unique(entry.senses.map((sense) => sense.language));
    if (languages.includes("en") && languages.includes("es")) duals += 1;
    for (const language of languages) {
      surfaceCounts[language] += 1;
      const family = dualEntryFamily(entry, language);
      if (!familySurfaces[language].has(family)) familySurfaces[language].set(family, new Set());
      familySurfaces[language].get(family).add(entry.surface);
    }
  }

  function summarize(language) {
    const groups = [...familySurfaces[language].values()];
    const capacity = groups.reduce((sum, forms) => sum + 1 + Math.max(0, forms.size - 1) * 0.1, 0);
    return {
      surfaces: surfaceCounts[language],
      families: groups.length,
      capacity: Math.round(capacity * 10) / 10,
      largestFamily: groups.reduce((largest, forms) => Math.max(largest, forms.size), 0),
    };
  }

  const en = summarize("en");
  const es = summarize("es");
  const totalCapacity = Math.round((en.capacity + es.capacity) * 10) / 10;
  const smaller = Math.min(en.families, es.families);
  const larger = Math.max(en.families, es.families, 1);
  const minimumEnglish = en.families ? clamp(1, Math.round(en.families * 0.34), 8) : 0;
  const minimumSpanish = es.families ? clamp(1, Math.round(es.families * 0.34), 8) : 0;
  const minimumTotal = minimumEnglish + minimumSpanish;
  const targetScore = totalCapacity
    ? clamp(minimumTotal, Math.round(totalCapacity * 0.46), Math.min(22, Math.floor(totalCapacity)))
    : 0;
  return {
    en,
    es,
    duals,
    totalCapacity,
    balance: smaller / larger,
    suggested: { targetScore, minimumEnglish, minimumSpanish, dualCount: duals },
  };
}

export function calculateDualBuilderReviewSummary(entries, overrides = {}, familyOverrides = {}) {
  const runtimeBySurface = new Map(buildDualBuilderLexicon(entries, overrides, familyOverrides)
    .map((entry) => [entry.surface, entry]));
  let reviewSurfaces = 0;
  let homographs = 0;
  let accentCollisions = 0;
  let unfamiliarLanguageSides = 0;
  let borderlineLanguageSides = 0;
  let missingFrequencyLanguageSides = 0;

  for (const entry of entries) {
    const state = dualBuilderEntryState(entry, overrides[entry.surface] ?? "default");
    const runtime = runtimeBySurface.get(entry.surface);
    const languages = unique(runtime?.senses.map((sense) => sense.language) ?? []);
    const pendingReview = state.reviewLanguages.some((language) => !languages.includes(language));
    if ((!languages.length && state.status === "review") || pendingReview) reviewSurfaces += 1;
    if (!runtime) continue;
    const playableSenses = runtime.senses;
    if (["en", "es"].some((language) => unique(playableSenses
      .filter((sense) => sense.language === language)
      .map((sense) => `${sense.lemma}:${sense.familyId}:${sense.partOfSpeech}`)).length > 1)) homographs += 1;
    if (entry.flags.accentCollision) accentCollisions += 1;
    for (const language of languages) {
      const familiarity = dualBuilderLanguageFamiliarity(entry, language);
      if (familiarity.tier !== "familiar") unfamiliarLanguageSides += 1;
      if (familiarity.tier === "borderline") borderlineLanguageSides += 1;
      if (familiarity.tier === "missing") missingFrequencyLanguageSides += 1;
    }
  }
  const metrics = calculateDualBuilderMetrics(entries, overrides, familyOverrides);
  const familyConcentration = Math.max(
    metrics.en.surfaces ? metrics.en.largestFamily / metrics.en.surfaces : 0,
    metrics.es.surfaces ? metrics.es.largestFamily / metrics.es.surfaces : 0,
  );
  return {
    reviewSurfaces, homographs, accentCollisions, unfamiliarLanguageSides,
    borderlineLanguageSides, missingFrequencyLanguageSides, familyConcentration,
  };
}

export function createDualBuilderPuzzle(sequence, settings, entries, overrides = {}, familyOverrides = {}) {
  const metrics = calculateDualBuilderMetrics(entries, overrides, familyOverrides);
  return {
    id: settings.id || `${sequence.toLocaleLowerCase()}-draft`,
    sequence: sequence.toLocaleUpperCase(),
    targetScore: Number(settings.targetScore),
    minimumEnglish: Number(settings.minimumEnglish),
    minimumSpanish: Number(settings.minimumSpanish),
    dualCount: metrics.duals,
  };
}

export function filterDualBuilderEntries(entries, overrides, criteria = {}, familyOverrides = {}) {
  const text = String(criteria.text ?? "").trim().toLocaleLowerCase();
  const filters = new Set(criteria.filters ?? []);
  const tab = criteria.tab ?? "playable";
  const playableBySurface = dualBuilderPlayableLanguages(entries, overrides, familyOverrides);
  return entries.filter((entry) => {
    const state = dualBuilderEntryState(entry, overrides[entry.surface] ?? "default");
    const languages = new Set(playableBySurface.get(entry.surface) ?? []);
    const pendingReview = state.reviewLanguages.some((language) => !languages.has(language));
    if (tab === "review" && !pendingReview && !(state.status === "review" && languages.size === 0)) return false;
    if (tab === "playable" && languages.size === 0) return false;
    if (tab === "excluded" && (languages.size > 0 || state.status !== "excluded")) return false;
    if (text && !entry.surface.includes(text) && !entry.senses.some((sense) =>
      sense.lemma.includes(text) || sense.familyId.includes(text) || sense.gloss?.toLocaleLowerCase().includes(text))) return false;
    const familiarityFilter = filters.has("unfamiliar") || filters.has("borderline") || filters.has("missing");
    if (filters.has("en") && !(familiarityFilter ? dualBuilderLanguageFamiliarity(entry, "en").hasAnalysis : languages.has("en"))) return false;
    if (filters.has("es") && !(familiarityFilter ? dualBuilderLanguageFamiliarity(entry, "es").hasAnalysis : languages.has("es"))) return false;
    if (filters.has("dual") && !(languages.has("en") && languages.has("es"))) return false;
    if (filters.has("flagged") && !(
      entry.policy.reviewReasons.length || entry.policy.exclusionReasons.length ||
      entry.flags.unfamiliar || entry.flags.homograph || entry.flags.accentCollision ||
      dualBuilderFamilyAmbiguity(entry, "en").length || dualBuilderFamilyAmbiguity(entry, "es").length
    )) return false;
    const scopedLanguages = filters.has("en") || filters.has("es")
      ? [filters.has("en") ? "en" : null, filters.has("es") ? "es" : null].filter(Boolean)
      : ["en", "es"];
    if (filters.has("unfamiliar") && !scopedLanguages.some((language) => {
      const familiarity = dualBuilderLanguageFamiliarity(entry, language);
      return familiarity.hasAnalysis && familiarity.tier !== "familiar";
    })) return false;
    if (filters.has("borderline") && !scopedLanguages.some((language) => dualBuilderLanguageFamiliarity(entry, language).tier === "borderline")) return false;
    if (filters.has("missing") && !scopedLanguages.some((language) => dualBuilderLanguageFamiliarity(entry, language).tier === "missing")) return false;
    if (filters.has("homograph") && !entry.flags.homograph) return false;
    if (filters.has("accent") && !entry.flags.accentCollision) return false;
    if (filters.has("included") && state.status !== "playable") return false;
    if (filters.has("excluded") && state.status !== "excluded") return false;
    return true;
  });
}

export function applyDualBuilderBulk(overrides, surfaces, assignment) {
  const next = { ...overrides };
  for (const surface of surfaces) {
    if (assignment === "default") delete next[surface];
    else next[surface] = normalizeDualBuilderAssignment(assignment);
  }
  return next;
}

export function deduplicateDualBuilderSenses(senses) {
  const seen = new Set();
  return senses.filter((sense) => {
    const signature = [sense.language, sense.lemma, sense.familyId, sense.partOfSpeech,
      sense.formKind, sense.status, sense.reason, sense.gloss, sense.zipf].join("\u0000");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function restoreDualBuilderDraft(payload, expectedSequence = "") {
  if (!payload || typeof payload !== "object" || !payload.puzzle || typeof payload.puzzle !== "object") {
    throw new Error("This is not a DUAL Builder draft.");
  }
  const sequence = String(payload.puzzle.sequence ?? "").toLocaleLowerCase();
  if (!/^[a-zñ]{3}$/.test(sequence)) throw new Error("The draft has no valid three-letter sequence.");
  if (expectedSequence && sequence !== expectedSequence.toLocaleLowerCase()) {
    throw new Error(`This draft belongs to ${sequence.toLocaleUpperCase()}, not ${expectedSequence.toLocaleUpperCase()}.`);
  }
  const overrides = {};
  for (const [surface, value] of Object.entries(payload.overrides ?? {})) {
    const assignment = normalizeDualBuilderAssignment(value);
    if (assignment !== "default") overrides[surface] = assignment;
  }
  return {
    sequence,
    overrides,
    familyOverrides: payload.familyOverrides && typeof payload.familyOverrides === "object" ? payload.familyOverrides : {},
    settings: {
      id: String(payload.puzzle.id ?? `${sequence}-draft`),
      targetScore: Number(payload.puzzle.targetScore ?? 0),
      minimumEnglish: Number(payload.puzzle.minimumEnglish ?? 0),
      minimumSpanish: Number(payload.puzzle.minimumSpanish ?? 0),
    },
  };
}

export function dualBuilderWarnings(metrics) {
  const warnings = [];
  if (metrics.reviewSurfaces > 0) warnings.push(`${metrics.reviewSurfaces} source surfaces still have a language side awaiting review`);
  if (metrics.homographs > 0) warnings.push(`${metrics.homographs} playable homograph surfaces retain multiple analyses`);
  if (metrics.accentCollisions > 0) warnings.push(`${metrics.accentCollisions} playable accent-folded collisions need review`);
  if (metrics.unfamiliarLanguageSides > 0) warnings.push(`${metrics.unfamiliarLanguageSides} manually playable language sides have low or missing frequency data`);
  if (metrics.borderlineLanguageSides > 0) warnings.push(`${metrics.borderlineLanguageSides} of those language sides are borderline rather than missing or deeply obscure`);
  if (metrics.familyConcentration > 0.3) warnings.push("One word family dominates more than 30% of a language pool");
  return warnings;
}
