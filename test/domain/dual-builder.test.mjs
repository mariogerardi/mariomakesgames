import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDualBuilderBulk,
  buildDualBuilderLexicon,
  calculateDualBuilderMetrics,
  calculateDualBuilderReviewSummary,
  deduplicateDualBuilderSenses,
  dualBuilderEntryState,
  dualBuilderFamilyAmbiguity,
  dualBuilderModernSharedLoanwordLanguages,
  dualBuilderPlayableLanguages,
  effectiveDualBuilderSenses,
  filterDualBuilderEntries,
  restoreDualBuilderDraft,
} from "../../src/games/dual/builder.mjs";

function entry(surface, senses, flags = {}) {
  return {
    surface,
    folded: surface,
    senses,
    policy: { accepted: senses.some((sense) => sense.status === "accepted"), reviewReasons: [], exclusionReasons: [], loanwordStatuses: [] },
    flags: { homograph: false, accentCollision: false, unfamiliar: false, ...flags },
  };
}

function sense(language, lemma, familyId, status = "accepted", extra = {}) {
  return { language, lemma, familyId, partOfSpeech: "noun", formKind: lemma === extra.surface ? "lemma" : "inflection", status, reason: "", gloss: "", zipf: 3, ...extra };
}

test("low or missing wordfreq never removes a dictionary-valid word such as unique", () => {
  const unique = entry("unique", [sense("en", "unique", "unique", "accepted", { surface: "unique", zipf: null })], { unfamiliar: true });
  assert.equal(buildDualBuilderLexicon([unique]).length, 0, "missing frequency defaults to review, not deletion");
  assert.equal(buildDualBuilderLexicon([unique], { unique: "en" }).length, 1, "the complete source candidate remains author-includable");
});

test("headword closure leaves qualifying headwords available beside their inflections", () => {
  const forms = [
    entry("potato", [sense("en", "potato", "potato", "accepted", { surface: "potato" })]),
    entry("potatoes", [sense("en", "potato", "potato", "accepted", { surface: "potatoes" })]),
  ];
  assert.deepEqual(buildDualBuilderLexicon(forms).map((item) => item.surface), ["potato", "potatoes"]);
  assert.equal(calculateDualBuilderMetrics(forms).en.capacity, 1.1);
});

test("unrelated homograph analyses remain in separate families", () => {
  const drug = entry("drug", [
    sense("en", "drag", "drag", "accepted", { surface: "drug", formKind: "inflection" }),
    sense("en", "drug", "drug", "accepted", { surface: "drug", formKind: "lemma" }),
  ], { homograph: true });
  const runtime = buildDualBuilderLexicon([drug])[0];
  assert.deepEqual(runtime.senses.map((item) => item.familyId), ["drag", "drug"]);
  assert.equal(runtime.familyAssignments.en, "drug", "the exact headword supplies the deterministic scoring family");
});

test("rugged keeps its ordinary lexicalized adjective family", () => {
  const senses = [
    sense("en", "rug", "rug", "accepted", { surface: "rugged", formKind: "inflection", partOfSpeech: "verb" }),
    sense("en", "rugged", "rugged", "accepted", { surface: "rugged", formKind: "lemma", partOfSpeech: "adj" }),
    sense("en", "rugged", "rugged", "accepted", { surface: "rugged", formKind: "lemma", partOfSpeech: "adj" }),
    sense("en", "rugged", "rugged", "accepted", { surface: "rugged", formKind: "lemma", partOfSpeech: "adj" }),
  ];
  const runtime = buildDualBuilderLexicon([entry("rugged", senses)])[0];
  assert.equal(runtime.familyAssignments.en, "rugged");
  assert.equal(runtime.senses.length, senses.length);
});

const transparentInflectionCases = [
  {
    surface: "drugged", language: "en", parent: "drug", expected: "drug",
    senses: [sense("en", "drug", "drug", "accepted", { surface: "drugged", formKind: "inflection", partOfSpeech: "verb" }), sense("en", "drugged", "drugged", "accepted", { surface: "drugged", formKind: "lemma", partOfSpeech: "adj" })],
  },
  {
    surface: "drugging", language: "en", parent: "drug", expected: "drug",
    senses: [sense("en", "drug", "drug", "accepted", { surface: "drugging", formKind: "inflection", partOfSpeech: "verb" }), sense("en", "drugging", "drugging", "accepted", { surface: "drugging", formKind: "lemma", partOfSpeech: "noun" })],
  },
  {
    surface: "shrugging", language: "en", parent: "shrug", expected: "shrug",
    senses: [sense("en", "shrug", "shrug", "accepted", { surface: "shrugging", formKind: "inflection", partOfSpeech: "verb" }), sense("en", "shrugging", "shrugging", "accepted", { surface: "shrugging", formKind: "lemma", partOfSpeech: "noun" })],
  },
  {
    surface: "struggling", language: "en", parent: "struggle", expected: "struggle",
    senses: [sense("en", "struggle", "struggle", "accepted", { surface: "struggling", formKind: "inflection", partOfSpeech: "verb" }), sense("en", "struggling", "struggling", "accepted", { surface: "struggling", formKind: "lemma", partOfSpeech: "adj" })],
  },
  {
    surface: "uruguaya", language: "es", parent: "uruguayo", expected: "uruguayo",
    senses: [sense("es", "uruguayo", "uruguayo", "accepted", { surface: "uruguaya", formKind: "inflection", partOfSpeech: "adj" }), sense("es", "uruguaya", "uruguaya", "accepted", { surface: "uruguaya", formKind: "lemma", partOfSpeech: "unknown" })],
  },
  {
    surface: "uruguayas", language: "es", parent: "uruguayo", expected: "uruguayo",
    senses: [sense("es", "uruguaya", "uruguaya", "accepted", { surface: "uruguayas", formKind: "inflection", partOfSpeech: "noun" }), sense("es", "uruguayo", "uruguayo", "accepted", { surface: "uruguayas", formKind: "inflection", partOfSpeech: "adj" }), sense("es", "uruguayo", "uruguayo", "accepted", { surface: "uruguayas", formKind: "inflection", partOfSpeech: "noun", gloss: "feminine plural of uruguayo" })],
  },
  {
    surface: "uruguayos", language: "es", parent: "uruguayo", expected: "uruguayo",
    senses: [sense("es", "uruguayo", "uruguayo", "accepted", { surface: "uruguayos", formKind: "inflection", partOfSpeech: "adj" }), sense("es", "uruguayo", "uruguayo", "accepted", { surface: "uruguayos", formKind: "inflection", partOfSpeech: "noun" })],
  },
];

for (const fixture of transparentInflectionCases) {
  test(`${fixture.surface} scores in the intuitive ${fixture.expected} family without losing analyses`, () => {
    const source = entry(fixture.surface, fixture.senses);
    const runtime = buildDualBuilderLexicon([source])[0];
    assert.equal(runtime.familyAssignments[fixture.language], fixture.expected);
    assert.equal(runtime.senses.length, fixture.senses.length);
    assert.deepEqual(runtime.senses.map((item) => item.lemma), fixture.senses.map((item) => item.lemma));
  });
}

test("standalone nouns remain distinct from related verb analyses", () => {
  const forms = [
    entry("madrugada", [sense("es", "madrugar", "madrugar", "accepted", { surface: "madrugada", formKind: "inflection", partOfSpeech: "verb" }), sense("es", "madrugada", "madrugada", "accepted", { surface: "madrugada", formKind: "lemma", partOfSpeech: "noun" })]),
    entry("rugido", [sense("es", "rugir", "rugir", "accepted", { surface: "rugido", formKind: "inflection", partOfSpeech: "verb" }), sense("es", "rugido", "rugido", "accepted", { surface: "rugido", formKind: "lemma", partOfSpeech: "noun" })]),
  ];
  const runtime = buildDualBuilderLexicon(forms);
  assert.deepEqual(runtime.map((item) => item.familyAssignments.es), ["madrugada", "rugido"]);
  assert.deepEqual(runtime.map((item) => item.senses.length), [2, 2]);
});

test("genuinely identical source analyses are deduplicated", () => {
  const repeated = sense("es", "arruga", "arruga", "review", { surface: "arrugadla", reason: "morphology:enclitic-combination" });
  assert.equal(deduplicateDualBuilderSenses([repeated, { ...repeated }]).length, 1);
});

test("excluded surfaces participate in neither playtest lexicon nor capacity", () => {
  const forms = [entry("rug", [sense("en", "rug", "rug", "accepted", { surface: "rug" })])];
  assert.equal(buildDualBuilderLexicon(forms, { rug: "exclude" }).length, 0);
  assert.deepEqual(calculateDualBuilderMetrics(forms, { rug: "exclude" }), {
    en: { surfaces: 0, families: 0, capacity: 0, largestFamily: 0 },
    es: { surfaces: 0, families: 0, capacity: 0, largestFamily: 0 },
    duals: 0, totalCapacity: 0, balance: 0,
    suggested: { targetScore: 0, minimumEnglish: 0, minimumSpanish: 0, dualCount: 0 },
  });
});

test("puzzle-scoped EN and ES overrides immediately change Dual status", () => {
  const dual = entry("mole", [sense("en", "mole", "mole", "accepted", { surface: "mole" }), sense("es", "mole", "mole", "accepted", { surface: "mole" })]);
  assert.equal(calculateDualBuilderMetrics([dual]).duals, 1);
  assert.equal(calculateDualBuilderMetrics([dual], { mole: "en" }).duals, 0);
  assert.equal(calculateDualBuilderMetrics([dual], { mole: "es" }).en.surfaces, 0);
  assert.deepEqual(effectiveDualBuilderSenses(dual, "both").map((item) => item.language), ["en", "es"]);
});

test("familiarity is language-specific and cannot create a false default Dual", () => {
  const rugosa = entry("rugosa", [
    sense("en", "rugosa", "rugosa", "accepted", { surface: "rugosa", zipf: 1.82 }),
    sense("es", "rugoso", "rugoso", "accepted", { surface: "rugosa", zipf: 2.64 }),
  ]);
  const state = dualBuilderEntryState(rugosa);
  assert.deepEqual(state.languages, ["es"]);
  assert.deepEqual(state.reviewLanguages, ["en"]);
  assert.equal(calculateDualBuilderMetrics([rugosa]).duals, 0);
  assert.equal(calculateDualBuilderMetrics([rugosa], { rugosa: "both" }).duals, 1);
  assert.equal(calculateDualBuilderReviewSummary([rugosa], { rugosa: "both" }).unfamiliarLanguageSides, 1);
  assert.deepEqual(filterDualBuilderEntries([rugosa], {}, { tab: "review" }).map((item) => item.surface), ["rugosa"]);
  assert.deepEqual(filterDualBuilderEntries([rugosa], {}, { tab: "playable" }).map((item) => item.surface), ["rugosa"]);
});

test("frequency review operates on each language side independently", () => {
  const abra = entry("abra", [
    sense("en", "abra", "abra", "accepted", { surface: "abra", zipf: 1.4 }),
    sense("es", "abrir", "abrir", "accepted", { surface: "abra", zipf: 3.7, formKind: "inflection", partOfSpeech: "verb", reason: "headword:abrir" }),
  ]);
  assert.deepEqual(dualBuilderPlayableLanguages([abra]).get("abra"), ["es"]);
  assert.equal(calculateDualBuilderMetrics([abra]).duals, 0);
  assert.equal(calculateDualBuilderMetrics([abra], { abra: "both" }).duals, 1);
  assert.deepEqual(filterDualBuilderEntries([abra], {}, { tab: "all", filters: ["en", "unfamiliar"] }).map((item) => item.surface), ["abra"]);
  assert.deepEqual(filterDualBuilderEntries([abra], {}, { tab: "all", filters: ["es", "unfamiliar"] }), []);
});

test("playable children restore eligible same-language family headwords", () => {
  const fixtures = [
    ["brandishing", "brandish", "en", "verb"],
    ["braised", "braise", "en", "verb"],
    ["esquirlas", "esquirla", "es", "noun"],
    ["plántulas", "plántula", "es", "noun"],
    ["dignitaries", "dignitary", "en", "noun"],
  ];
  for (const [child, parent, language, partOfSpeech] of fixtures) {
    const forms = [
      entry(child, [sense(language, parent, parent, "accepted", { surface: child, formKind: "inflection", partOfSpeech, reason: `headword:${parent}`, zipf: 3.5 })]),
      entry(parent, [sense(language, parent, parent, "accepted", { surface: parent, formKind: "lemma", partOfSpeech, zipf: null })]),
    ];
    const runtime = buildDualBuilderLexicon(forms);
    assert.deepEqual(runtime.map((item) => item.surface), [child, parent], `${parent} should be restored beside ${child}`);
    assert.equal(runtime.find((item) => item.surface === parent).familyAssignments[language], parent);
  }
});

test("headword closure respects explicit review and exclusion blocks", () => {
  const forms = [
    entry("brandishing", [sense("en", "brandish", "brandish", "accepted", { surface: "brandishing", formKind: "inflection", partOfSpeech: "verb", reason: "headword:brandish" })]),
    entry("brandish", [sense("en", "brandish", "brandish", "accepted", { surface: "brandish", formKind: "lemma", partOfSpeech: "verb", zipf: null })]),
  ];
  assert.deepEqual(buildDualBuilderLexicon(forms, { brandish: "review" }).map((item) => item.surface), ["brandishing"]);
  assert.deepEqual(buildDualBuilderLexicon(forms, { brandish: "exclude" }).map((item) => item.surface), ["brandishing"]);
});

test("Spanish families are attested rather than synthesized from endings", () => {
  const fixtures = [
    ["perra", "perro"], ["perras", "perro"], ["orugas", "oruga"],
    ["cirugías", "cirugía"], ["verrugas", "verruga"],
  ];
  for (const [surface, parent] of fixtures) {
    const source = entry(surface, [sense("es", parent, parent, "accepted", {
      surface, formKind: "inflection", partOfSpeech: "noun", reason: `headword:${parent}`,
    })]);
    const runtime = buildDualBuilderLexicon([source])[0];
    assert.equal(runtime.familyAssignments.es, parent);
    assert.ok(source.senses.some((item) => item.familyId === runtime.familyAssignments.es));
  }
});

test("Spanish standalone nouns keep their lexical families and all source analyses", () => {
  const fixtures = [
    ["incógnita", "incógnito", "adj"],
    ["señorita", "señorito", "noun"],
    ["gordita", "gordito", "adj"],
    ["carnitas", "carnita", "noun"],
  ];
  for (const [surface, related, relatedPartOfSpeech] of fixtures) {
    const senses = [
      sense("es", related, related, "accepted", { surface, formKind: "inflection", partOfSpeech: relatedPartOfSpeech, reason: `headword:${related}` }),
      sense("es", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "noun", reason: `headword:${surface}` }),
    ];
    const runtime = buildDualBuilderLexicon([entry(surface, senses)])[0];
    assert.equal(runtime.familyAssignments.es, surface);
    assert.equal(runtime.senses.length, senses.length);
  }
});

test("translation-template forms cannot become cross-language scoring parents", () => {
  const fixtures = [
    ["risita", "risa", ["giggle", "snicker", "titter"]],
    ["abuelita", "abuela", ["granny"]],
  ];
  for (const [surface, spanishParent, garbage] of fixtures) {
    const senses = [
      sense("es", spanishParent, spanishParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "noun", reason: `headword:${spanishParent}` }),
      ...garbage.map((lemma) => sense("es", lemma, lemma, "accepted", { surface, formKind: "inflection", partOfSpeech: "noun", reason: "translation-template" })),
      sense("es", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "unknown", reason: `headword:${surface}` }),
    ];
    const runtime = buildDualBuilderLexicon([entry(surface, senses)])[0];
    assert.ok(!garbage.includes(runtime.familyAssignments.es));
    assert.equal(runtime.senses.length, senses.length);
  }
});

test("ambiguous Spanish family analyses remain in review instead of following source order", () => {
  const facilita = entry("facilita", [
    sense("es", "facilitar", "facilitar", "accepted", { surface: "facilita", formKind: "inflection", partOfSpeech: "verb", reason: "headword:facilitar" }),
    sense("es", "facilito", "facilito", "accepted", { surface: "facilita", formKind: "inflection", partOfSpeech: "adj", reason: "headword:facilito" }),
  ]);
  assert.deepEqual(dualBuilderFamilyAmbiguity(facilita, "es"), ["facilitar", "facilito"]);
  assert.equal(dualBuilderEntryState(facilita).status, "review");
  assert.equal(buildDualBuilderLexicon([facilita]).length, 0);
  assert.equal(facilita.senses.length, 2);
});

test("transparent attested forms bypass Review while obscure source-valid lemmas remain quarantined", () => {
  const ordinaryFamily = [
    entry("pervade", [sense("en", "pervade", "pervade", "accepted", { surface: "pervade", formKind: "lemma", partOfSpeech: "verb", zipf: 2.17 })]),
    entry("pervaded", [sense("en", "pervade", "pervade", "accepted", { surface: "pervaded", formKind: "inflection", partOfSpeech: "verb", zipf: 2.29 })]),
    entry("pervading", [sense("en", "pervade", "pervade", "accepted", { surface: "pervading", formKind: "inflection", partOfSpeech: "verb", zipf: 2.33 })]),
    entry("conservación", [sense("es", "conservación", "conservación", "accepted", { surface: "conservación", formKind: "lemma", partOfSpeech: "noun", zipf: 4.4 })]),
    entry("conservaciones", [sense("es", "conservación", "conservación", "accepted", { surface: "conservaciones", formKind: "inflection", partOfSpeech: "noun", zipf: null })]),
  ];
  const runtime = new Map(buildDualBuilderLexicon(ordinaryFamily).map((item) => [item.surface, item]));
  for (const [surface, language] of [["pervaded", "en"], ["pervading", "en"], ["conservaciones", "es"]]) {
    assert.deepEqual([...new Set(runtime.get(surface).senses.map((item) => item.language))], [language]);
  }
  assert.ok(filterDualBuilderEntries(ordinaryFamily, {}, { tab: "playable" }).some((item) => item.surface === "conservaciones"));
  assert.ok(!filterDualBuilderEntries(ordinaryFamily, {}, { tab: "review" }).some((item) => item.surface === "conservaciones"));
  const obscureFamilies = [
    entry("arva", [sense("en", "arva", "arva", "accepted", { surface: "arva", formKind: "lemma", partOfSpeech: "verb", zipf: 1.42 })]),
    entry("arvaing", [sense("en", "arva", "arva", "accepted", { surface: "arvaing", formKind: "inflection", partOfSpeech: "verb", zipf: null })]),
    entry("barodenervate", [sense("en", "barodenervate", "barodenervate", "accepted", { surface: "barodenervate", formKind: "lemma", partOfSpeech: "verb", zipf: null })]),
    entry("barodenervating", [sense("en", "barodenervate", "barodenervate", "accepted", { surface: "barodenervating", formKind: "inflection", partOfSpeech: "verb", zipf: null })]),
  ];
  assert.equal(buildDualBuilderLexicon(obscureFamilies).length, 0);
  assert.deepEqual(filterDualBuilderEntries(obscureFamilies, {}, { tab: "review" }).map((item) => item.surface),
    ["arva", "arvaing", "barodenervate", "barodenervating"]);
  for (const source of obscureFamilies.filter((item) => item.surface === "arva" || item.surface === "barodenervate")) {
    assert.equal(dualBuilderEntryState(source).status, "review");
  }
});

test("family confidence is deterministic and isolated by language side", () => {
  const larva = entry("larva", [
    sense("en", "larva", "larva", "accepted", { surface: "larva", formKind: "lemma", partOfSpeech: "noun", gloss: "larva", zipf: 2.99 }),
    sense("es", "larva", "larva", "accepted", { surface: "larva", formKind: "lemma", partOfSpeech: "noun", gloss: "larva", zipf: 3.05 }),
  ]);
  larva.policy.loanwordStatuses = ["other-borrowing"];

  const servant = entry("servant", [
    sense("en", "servant", "servant", "accepted", { surface: "servant", formKind: "lemma", partOfSpeech: "noun", zipf: 4.09 }),
    sense("es", "servant", "servant", "accepted", {
      surface: "servant", formKind: "lemma", partOfSpeech: "unknown",
      reason: "lemma-closure:accepted-by-default", gloss: "female equivalent of siervo", zipf: 2.06,
    }),
  ]);

  const observable = entry("observable", [
    sense("en", "observable", "observable", "accepted", { surface: "observable", formKind: "lemma", partOfSpeech: "adj", gloss: "observable", zipf: 3.11 }),
    sense("es", "observable", "observable", "accepted", { surface: "observable", formKind: "lemma", partOfSpeech: "adj", gloss: "observable", zipf: null }),
  ]);
  observable.policy.loanwordStatuses = ["unmarked", "other-borrowing"];
  const observables = entry("observables", [
    sense("en", "observable", "observable", "accepted", { surface: "observables", formKind: "inflection", partOfSpeech: "adj", zipf: 2.4 }),
    sense("es", "observable", "observable", "accepted", { surface: "observables", formKind: "inflection", partOfSpeech: "adj", zipf: 2.62 }),
  ]);

  const forms = [servant, observables, larva, observable];
  const runtime = new Map(buildDualBuilderLexicon(forms).map((item) => [item.surface, item]));
  const languages = (surface) => [...new Set(runtime.get(surface).senses.map((item) => item.language))].sort();

  assert.deepEqual(languages("larva"), ["en", "es"]);
  assert.deepEqual(languages("servant"), ["en"]);
  assert.deepEqual(dualBuilderEntryState(servant).reviewLanguages, ["es"]);
  assert.deepEqual(languages("observable"), ["en", "es"]);
  assert.deepEqual(languages("observables"), ["en", "es"]);

  const reversed = new Map(buildDualBuilderLexicon([...forms].reverse()).map((item) => [
    item.surface,
    [...new Set(item.senses.map((sense) => sense.language))].sort(),
  ]));
  for (const surface of ["larva", "servant", "observable", "observables"]) {
    assert.deepEqual(reversed.get(surface), languages(surface), `${surface} should not depend on processing order`);
  }
});

test("playable language-side inflections restore their accepted family heads", () => {
  const forms = [];
  for (const [head, plural, headZipf, pluralZipf] of [
    ["actuarial", "actuariales", 2.21, 2.07],
    ["contractual", "contractuales", 3.32, 3.11],
  ]) {
    const parent = entry(head, [
      sense("en", head, head, "accepted", { surface: head, formKind: "lemma", partOfSpeech: "adj", gloss: `English ${head}`, zipf: 3 }),
      sense("es", head, head, "accepted", { surface: head, formKind: "lemma", partOfSpeech: "adj", gloss: head, zipf: headZipf }),
    ]);
    parent.policy.loanwordStatuses = ["unmarked"];
    forms.push(parent, entry(plural, [
      sense("es", head, head, "accepted", {
        surface: plural, formKind: "inflection", partOfSpeech: "adj",
        reason: "headword:accepted-by-default", gloss: `plural of ${head}`, zipf: pluralZipf,
      }),
    ]));
  }

  for (const head of ["actuarial", "contractual"]) {
    assert.deepEqual(dualBuilderEntryState(forms.find((entry) => entry.surface === head)).languages, ["en"]);
  }

  const runtime = new Map(buildDualBuilderLexicon(forms).map((item) => [item.surface, item]));
  for (const [head, plural] of [["actuarial", "actuariales"], ["contractual", "contractuales"]]) {
    assert.deepEqual([...new Set(runtime.get(head).senses.map((sense) => sense.language))].sort(), ["en", "es"]);
    assert.equal(runtime.get(head).familyAssignments.es, head);
    assert.deepEqual([...new Set(runtime.get(plural).senses.map((sense) => sense.language))], ["es"]);
    assert.equal(runtime.get(plural).familyAssignments.es, head);
  }
});

test("ordinary Spanish gender and number variants stay playable despite related verb analyses", () => {
  const fixtures = [
    ["agitada", "agitado", "agitar"],
    ["citados", "citado", "citar"],
    ["invitada", "invitado", "invitar"],
  ];
  for (const [surface, directParent, verbParent] of fixtures) {
    const senses = [
      sense("es", directParent, directParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "adj", reason: `headword:${directParent}` }),
      sense("es", directParent, directParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${directParent}` }),
      sense("es", verbParent, verbParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${verbParent}` }),
    ];
    const source = entry(surface, senses);
    assert.deepEqual(dualBuilderFamilyAmbiguity(source, "es"), []);
    assert.deepEqual(dualBuilderEntryState(source).languages, ["es"]);
    assert.equal(buildDualBuilderLexicon([source])[0].familyAssignments.es, directParent);
  }
});

test("genuinely competing Spanish noun and gender paradigms stay in Review", () => {
  const fixtures = [
    ["salidas", "salida", "salido"],
    ["salinas", "salina", "salino"],
  ];
  for (const [surface, nounParent, genderParent] of fixtures) {
    const source = entry(surface, [
      sense("es", nounParent, nounParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "noun", reason: `headword:${nounParent}` }),
      sense("es", genderParent, genderParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "adj", reason: `headword:${genderParent}` }),
    ]);
    assert.deepEqual(dualBuilderFamilyAmbiguity(source, "es"), [nounParent, genderParent].sort());
    assert.equal(dualBuilderEntryState(source).status, "review");
    assert.equal(buildDualBuilderLexicon([source]).length, 0);
  }
});

test("an exact unknown lemma does not displace a clear Spanish participle parent", () => {
  const fixtures = [
    ["asaltado", "asaltar"],
    ["desalojado", "desalojar"],
    ["resaltado", "resaltar"],
    ["salpicado", "salpicar"],
    ["saludado", "saludar"],
  ];
  for (const [surface, parent] of fixtures) {
    const senses = [
      sense("es", parent, parent, "accepted", { surface, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${parent}` }),
      sense("es", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "unknown", reason: "lemma-closure:accepted-by-default" }),
    ];
    const runtime = buildDualBuilderLexicon([entry(surface, senses)])[0];
    assert.equal(runtime.familyAssignments.es, parent);
    assert.equal(runtime.senses.length, senses.length);
  }
});

test("competing Spanish plural noun and verb paradigms remain in Review", () => {
  const fixtures = [
    ["intenciones", "intención", "intencionar"],
    ["interacciones", "interacción", "interaccionar"],
    ["intereses", "interés", "interesar"],
  ];
  for (const [surface, nounParent, verbParent] of fixtures) {
    const source = entry(surface, [
      sense("es", nounParent, nounParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "noun", reason: `headword:${nounParent}` }),
      sense("es", verbParent, verbParent, "accepted", { surface, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${verbParent}` }),
    ]);
    assert.deepEqual(dualBuilderFamilyAmbiguity(source, "es"), [nounParent, verbParent].sort());
    assert.equal(dualBuilderEntryState(source).status, "review");
    assert.equal(buildDualBuilderLexicon([source]).length, 0);
  }
});

test("an exact unknown lemma yields to a clear attested Spanish adjective or noun parent", () => {
  const fixtures = [
    ["interesantísimo", "interesante", "adj"],
    ["pintora", "pintor", "noun"],
  ];
  for (const [surface, parent, partOfSpeech] of fixtures) {
    const senses = [
      sense("es", parent, parent, "accepted", { surface, formKind: "inflection", partOfSpeech, reason: `headword:${parent}` }),
      sense("es", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "unknown", reason: "lemma-closure:accepted-by-default" }),
    ];
    const runtime = buildDualBuilderLexicon([entry(surface, senses)])[0];
    assert.equal(runtime.familyAssignments.es, parent);
    assert.equal(runtime.senses.length, senses.length);
  }
});

test("obvious modern shared English-Spanish borrowings are held for Spanish review", () => {
  for (const surface of ["sprint", "paintball", "powerpoint", "intranet"]) {
    const source = entry(surface, [
      sense("en", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "noun", gloss: "English definition", zipf: 3 }),
      sense("es", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "noun", gloss: surface === "sprint" ? "alternative spelling of esprint" : surface, zipf: 3 }),
    ]);
    assert.deepEqual(dualBuilderModernSharedLoanwordLanguages(source), ["es"]);
    assert.deepEqual(dualBuilderEntryState(source).languages, ["en"]);
    assert.deepEqual(dualBuilderEntryState(source).reviewLanguages, ["es"]);
    assert.equal(calculateDualBuilderMetrics([source]).duals, 0);
    assert.equal(calculateDualBuilderMetrics([source], { [surface]: "both" }).duals, 1);
  }
});

test("headword closure cannot revive a language side held for loanword review", () => {
  const parent = entry("serval", [
    sense("en", "serval", "serval", "accepted", { surface: "serval", formKind: "lemma", partOfSpeech: "noun", gloss: "serval", zipf: 3 }),
    sense("es", "serval", "serval", "review", { surface: "serval", formKind: "lemma", partOfSpeech: "noun", gloss: "serval", zipf: 3 }),
  ]);
  const child = entry("servales", [
    sense("es", "serval", "serval", "accepted", { surface: "servales", formKind: "inflection", partOfSpeech: "noun", reason: "headword:serval", zipf: 3 }),
  ]);
  const runtime = new Map(buildDualBuilderLexicon([child, parent]).map((item) => [item.surface, item]));
  assert.deepEqual(runtime.get("serval").senses.map((sense) => sense.language), ["en"]);
});

test("historically marked shared terms are not auto-classified as modern loanwords", () => {
  const source = entry("total", [
    sense("en", "total", "total", "accepted", { surface: "total", formKind: "lemma", gloss: "total" }),
    sense("es", "total", "total", "accepted", { surface: "total", formKind: "lemma", gloss: "total" }),
  ]);
  source.policy.loanwordStatuses = ["historical"];
  assert.deepEqual(dualBuilderModernSharedLoanwordLanguages(source), []);
});

test("family assignments follow attested parent chains to their terminal canonical family", () => {
  const fixtures = [
    ["comparada", "comparado", "comparar"],
    ["separada", "separado", "separar"],
  ];
  for (const [surface, middle, terminal] of fixtures) {
    const forms = [
      entry(surface, [
        sense("es", middle, middle, "accepted", { surface, formKind: "inflection", partOfSpeech: "adj", reason: `headword:${middle}` }),
        sense("es", middle, middle, "accepted", { surface, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${middle}` }),
        sense("es", terminal, terminal, "accepted", { surface, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${terminal}` }),
      ]),
      entry(middle, [
        sense("es", terminal, terminal, "accepted", { surface: middle, formKind: "inflection", partOfSpeech: "verb", reason: `headword:${terminal}` }),
        sense("es", middle, middle, "accepted", { surface: middle, formKind: "lemma", partOfSpeech: "adj" }),
      ]),
      entry(terminal, [sense("es", terminal, terminal, "accepted", { surface: terminal, formKind: "lemma", partOfSpeech: "verb" })]),
    ];
    const runtime = new Map(buildDualBuilderLexicon(forms).map((item) => [item.surface, item]));
    assert.equal(runtime.get(surface).familyAssignments.es, terminal);
  }
});

test("terminal family resolution is cycle-safe", () => {
  const first = entry("loopa", [sense("es", "loopb", "loopb", "accepted", { surface: "loopa", formKind: "inflection", reason: "headword:loopb" })]);
  const second = entry("loopb", [sense("es", "loopa", "loopa", "accepted", { surface: "loopb", formKind: "inflection", reason: "headword:loopa" })]);
  second.familyAssignments = { es: "loopa" };
  const runtime = buildDualBuilderLexicon([first, second]);
  assert.equal(runtime.length, 2);
  assert.equal(runtime[0].familyAssignments.es, "loopb");
});

test("competing Spanish noun, participle, and verb paradigms remain in Review", () => {
  const source = entry("paradas", [
    sense("es", "parada", "parada", "accepted", { surface: "paradas", formKind: "inflection", partOfSpeech: "noun", gloss: "plural of parada" }),
    sense("es", "parado", "parado", "accepted", { surface: "paradas", formKind: "inflection", partOfSpeech: "adj", gloss: "feminine plural of parado" }),
    sense("es", "parado", "parado", "accepted", { surface: "paradas", formKind: "inflection", partOfSpeech: "noun", gloss: "unemployed person" }),
    sense("es", "parar", "parar", "accepted", { surface: "paradas", formKind: "inflection", partOfSpeech: "verb", gloss: "to stop" }),
  ]);
  assert.deepEqual(dualBuilderFamilyAmbiguity(source, "es"), ["parada", "parado", "parar"]);
  assert.equal(dualBuilderEntryState(source).status, "review");
});

test("explicit Spanish derivations beat exact unknown lemma-closure records", () => {
  const fixtures = [
    ["parienta", "pariente", "female equivalent of pariente"],
    ["parejita", "pareja", "diminutive of pareja"],
  ];
  for (const [surface, parent, gloss] of fixtures) {
    const runtime = buildDualBuilderLexicon([entry(surface, [
      sense("es", parent, parent, "accepted", { surface, formKind: "inflection", partOfSpeech: "noun", gloss, reason: `headword:${parent}` }),
      sense("es", surface, surface, "accepted", { surface, formKind: "lemma", partOfSpeech: "unknown", reason: "lemma-closure:accepted-by-default" }),
    ])])[0];
    assert.equal(runtime.familyAssignments.es, parent);
  }
});

test("shared terms can be identified through an attested English family gloss", () => {
  const source = entry("paparazzi", [
    sense("en", "paparazzi", "paparazzi", "accepted", { surface: "paparazzi", formKind: "lemma", partOfSpeech: "noun", gloss: "paparazzi" }),
    sense("en", "paparazzo", "paparazzo", "accepted", { surface: "paparazzi", formKind: "inflection", partOfSpeech: "noun", gloss: "plural of paparazzo" }),
    sense("es", "paparazzi", "paparazzi", "accepted", { surface: "paparazzi", formKind: "lemma", partOfSpeech: "noun", gloss: "paparazzo" }),
  ]);
  assert.deepEqual(dualBuilderModernSharedLoanwordLanguages(source), ["es"]);
  assert.deepEqual(dualBuilderEntryState(source).languages, ["en"]);
  assert.deepEqual(dualBuilderEntryState(source).reviewLanguages, ["es"]);
});

test("bulk actions affect only the explicitly selected filtered surfaces", () => {
  const starting = { hidden: "exclude" };
  const next = applyDualBuilderBulk(starting, ["rug", "rugosa"], "es");
  assert.deepEqual(next, { hidden: "exclude", rug: "es", rugosa: "es" });
  const forms = [entry("rug", [sense("en", "rug", "rug")]), entry("rugosa", [sense("es", "rugoso", "rugoso")]), entry("total", [sense("en", "total", "total")])];
  assert.deepEqual(filterDualBuilderEntries(forms, {}, { tab: "playable", text: "rug" }).map((item) => item.surface), ["rug", "rugosa"]);
});

test("saved drafts restore exact author overrides and targets", () => {
  const restored = restoreDualBuilderDraft({
    puzzle: { id: "rug-01", sequence: "RUG", targetScore: 10, minimumEnglish: 4, minimumSpanish: 3 },
    overrides: { rug: "en", rugosa: { assignment: "review" }, maruga: "exclude" },
    familyOverrides: { drug: { en: "drug" } },
  }, "rug");
  assert.deepEqual(restored.overrides, { rug: "en", rugosa: "review", maruga: "exclude" });
  assert.deepEqual(restored.settings, { id: "rug-01", targetScore: 10, minimumEnglish: 4, minimumSpanish: 3 });
  assert.deepEqual(restored.familyOverrides, { drug: { en: "drug" } });
});

test("metrics and suggestions recalculate from the authored playable pool", () => {
  const forms = [
    entry("rug", [sense("en", "rug", "rug", "accepted", { surface: "rug" }), sense("es", "rug", "rug", "accepted", { surface: "rug" })]),
    entry("rugged", [sense("en", "rug", "rug", "accepted", { surface: "rugged" })]),
    entry("rugosa", [sense("es", "rugoso", "rugoso", "accepted", { surface: "rugosa" })]),
  ];
  const before = calculateDualBuilderMetrics(forms);
  const after = calculateDualBuilderMetrics(forms, { rugosa: "exclude", rug: "en" });
  assert.equal(before.totalCapacity, 3.1);
  assert.equal(before.duals, 1);
  assert.equal(after.totalCapacity, 1.1);
  assert.equal(after.duals, 0);
  assert.equal(after.es.families, 0);
});
