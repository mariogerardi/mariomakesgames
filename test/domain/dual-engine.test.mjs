import assert from "node:assert/strict";
import test from "node:test";
import {
  createDualSession,
  dualFamilyDiscoveries,
  dualProgress,
  dualWordProgress,
  finishDualSession,
  hydrateDualSession,
  serializeDualSession,
  submitDualWord,
} from "../../src/games/dual/engine.mjs";
import {
  createDualLexicon,
  foldDualAccents,
  resolveDualInput,
} from "../../src/games/dual/lexicon.mjs";

function entry(surface, senses, accepted = true) {
  return {
    surface,
    senses,
    policy: { accepted, loanwordStatus: "none" },
    source: { kind: "curated-fixture" },
  };
}

const entries = [
  entry("treat", [{ language: "en", lemma: "treat", formKind: "lemma" }]),
  entry("treated", [{ language: "en", lemma: "treat", formKind: "inflection" }]),
  entry("treating", [{ language: "en", lemma: "treat", formKind: "inflection" }]),
  entry("treatment", [{ language: "en", lemma: "treatment", formKind: "lemma" }]),
  entry("potato", [{ language: "en", lemma: "potato", formKind: "lemma" }]),
  entry("quota", [{ language: "en", lemma: "quota", formKind: "lemma" }]),
  entry("pelota", [{ language: "es", lemma: "pelota", formKind: "lemma" }]),
  entry("totaled", [{ language: "en", lemma: "total", formKind: "inflection" }]),
  entry("total", [
    { language: "en", lemma: "total", formKind: "lemma" },
    { language: "es", lemma: "total", formKind: "lemma" },
  ]),
  entry("camión", [{ language: "es", lemma: "camión", formKind: "lemma" }]),
  entry("papa", [{ language: "es", lemma: "papa", formKind: "lemma" }]),
  entry("papá", [{ language: "es", lemma: "papá", formKind: "lemma" }]),
  entry("año", [{ language: "es", lemma: "año", formKind: "lemma" }]),
  entry("ano", [{ language: "es", lemma: "ano", formKind: "lemma" }]),
  entry("internet", [{ language: "en", lemma: "internet", formKind: "lemma" }], false),
];

const lexicon = createDualLexicon(entries);
const familyPuzzle = {
  id: "tre-test",
  sequence: "TRE",
  targetScore: 20,
  minimumEnglish: 0,
  minimumSpanish: 0,
  dualCount: 0,
};
const otaPuzzle = {
  id: "ota-test",
  sequence: "OTA",
  targetScore: 4,
  minimumEnglish: 2,
  minimumSpanish: 2,
  dualCount: 1,
};

function submit(session, puzzle, input, now = 2_000) {
  return submitDualWord({ session, puzzle, lexicon, input, now });
}

test("the first submitted form establishes a game-family and later forms score +0.1", () => {
  let session = createDualSession({ puzzle: familyPuzzle, dateKey: "2026-08-30", startedAt: 1_000 });
  const first = submit(session, familyPuzzle, "treated");
  assert.equal(first.accepted, true);
  assert.equal(first.submission.kind, "new-lemma");
  assert.equal(first.submission.points, 1);
  session = first.state;

  const headword = submit(session, familyPuzzle, "treat", 3_000);
  assert.equal(headword.submission.kind, "inflection");
  assert.equal(headword.submission.points, 0.1);
  const another = submit(headword.state, familyPuzzle, "treating", 4_000);
  assert.equal(another.submission.points, 0.1);
});

test("family presentation follows recency and promotes a played headword", () => {
  let session = createDualSession({ puzzle: familyPuzzle, dateKey: "2026-08-30", startedAt: 1_000 });
  session = submit(session, familyPuzzle, "treated", 2_000).state;
  session = submit(session, familyPuzzle, "treatment", 3_000).state;
  session = submit(session, familyPuzzle, "treating", 4_000).state;

  let groups = dualFamilyDiscoveries({ session, lexicon, language: "en" });
  assert.deepEqual(groups.map((group) => group.family), ["treat", "treatment"], "a +0.1 form bumps its family to the origin");
  assert.equal(groups[0].anchor.surface, "treated", "the first discovered form anchors the family initially");
  assert.deepEqual(groups[0].forms.map((submission) => submission.surface), ["treating"]);

  session = submit(session, familyPuzzle, "treat", 5_000).state;
  groups = dualFamilyDiscoveries({ session, lexicon, language: "en" });
  assert.equal(groups[0].anchor.surface, "treat", "the family head replaces the initial anchor when found");
  assert.deepEqual(groups[0].forms.map((submission) => submission.surface), ["treated", "treating"]);
});

test("requirements, Duals, and every playable word remain independent milestones", () => {
  let session = createDualSession({ puzzle: familyPuzzle, dateKey: "2026-08-30" });
  assert.deepEqual(dualWordProgress(session, familyPuzzle, lexicon), { found: 0, total: 4, allWordsFound: false });
  for (const word of ["treated", "treating", "treat", "treatment"]) session = submit(session, familyPuzzle, word).state;
  assert.deepEqual(dualWordProgress(session, familyPuzzle, lexicon), { found: 4, total: 4, allWordsFound: true });
  assert.equal(dualProgress(session, familyPuzzle).allDualsFound, false);
});

test("legacy finished markers no longer prevent continued play", () => {
  const session = finishDualSession(createDualSession({ puzzle: familyPuzzle, dateKey: "2026-08-30" }), 1_500);
  const continued = submit(session, familyPuzzle, "treated", 2_000);
  assert.equal(continued.accepted, true);
  assert.equal(continued.state.submissions.at(-1).surface, "treated");
});

test("derivationally separate lemmas earn independent full points", () => {
  let session = createDualSession({ puzzle: familyPuzzle, dateKey: "2026-08-30" });
  session = submit(session, familyPuzzle, "treat").state;
  const derived = submit(session, familyPuzzle, "treatment");
  assert.equal(derived.submission.kind, "new-lemma");
  assert.equal(derived.submission.points, 1);
});

test("a fresh Dual scores +2 by contributing independently to both language families", () => {
  let session = createDualSession({ puzzle: otaPuzzle, dateKey: "2026-08-30" });
  const dual = submit(session, otaPuzzle, "TOTAL");
  assert.equal(dual.submission.kind, "dual");
  assert.equal(dual.submission.points, 2);
  assert.equal(dual.submission.enPoints, 1);
  assert.equal(dual.submission.esPoints, 1);
  assert.equal(dual.state.score, 2);
  assert.equal(dual.state.enScore, 1);
  assert.equal(dual.state.esScore, 1);
});

test("a Dual scores each language side from its own previously seen family state", () => {
  let session = createDualSession({ puzzle: otaPuzzle, dateKey: "2026-08-30" });
  session = submit(session, otaPuzzle, "totaled").state;
  const dual = submit(session, otaPuzzle, "TOTAL");
  assert.equal(dual.submission.kind, "dual");
  assert.equal(dual.submission.enPoints, 0.1);
  assert.equal(dual.submission.esPoints, 1);
  assert.equal(dual.submission.points, 1.1);
  assert.equal(dual.state.score, 2.1);
});

test("duplicate canonical surfaces do not score again and matching ignores case", () => {
  let session = createDualSession({ puzzle: otaPuzzle, dateKey: "2026-08-30" });
  const first = submit(session, otaPuzzle, "  POTATO ");
  assert.equal(first.accepted, true);
  session = first.state;
  const duplicate = submit(session, otaPuzzle, "potato");
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, "duplicate");
  assert.equal(duplicate.state.score, 1);
});

test("accent-insensitive input resolves one canonical spelling but canonical spelling controls eligibility", () => {
  const camPuzzle = { ...otaPuzzle, id: "cam", sequence: "CAM" };
  const ionPuzzle = { ...otaPuzzle, id: "ion", sequence: "ION" };
  const accepted = submit(createDualSession({ puzzle: camPuzzle, dateKey: "2026-08-30" }), camPuzzle, "camion");
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.submission.surface, "camión");
  assert.equal(accepted.submission.normalizedByAccent, true);

  const rejected = submit(createDualSession({ puzzle: ionPuzzle, dateKey: "2026-08-30" }), ionPuzzle, "camion");
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, "sequence-missing");
  assert.equal(rejected.canonical, "camión");
});

test("exact spelling wins before accent folding, ambiguity is exposed, and ñ remains distinct", () => {
  assert.equal(resolveDualInput(lexicon, "papa").entry.surface, "papa");
  assert.equal(resolveDualInput(lexicon, "pápá").status, "ambiguous");
  assert.equal(foldDualAccents("año"), "año");
  assert.equal(foldDualAccents("ano"), "ano");
  assert.equal(resolveDualInput(lexicon, "año").entry.surface, "año");
  assert.equal(resolveDualInput(lexicon, "ano").entry.surface, "ano");
  assert.equal(resolveDualInput(lexicon, "internet").status, "unknown");
});

test("language minimums count distinct families rather than fractional points", () => {
  let session = createDualSession({ puzzle: otaPuzzle, dateKey: "2026-08-30" });
  session = submit(session, otaPuzzle, "potato").state;
  session = submit(session, otaPuzzle, "pelota").state;
  assert.equal(dualProgress(session, otaPuzzle).isSolved, false);

  session = submit(session, otaPuzzle, "total").state;
  const completed = dualProgress(session, otaPuzzle);
  assert.equal(completed.enFamilies, 2);
  assert.equal(completed.esFamilies, 2);
  assert.equal(completed.isSolved, true);
  assert.equal(completed.allDualsFound, true);
  assert.ok(session.solvedAt);
  assert.ok(session.allDualsFoundAt);

  const continued = submit(session, otaPuzzle, "quota", 5_000);
  assert.equal(continued.accepted, true);
  assert.equal(continued.state.score, 5);
});

test("serialized sessions reconstruct score and lemma state by replaying submissions", () => {
  let session = createDualSession({ puzzle: familyPuzzle, dateKey: "2026-08-30", startedAt: 1_000 });
  session = submit(session, familyPuzzle, "treated", 2_000).state;
  session = submit(session, familyPuzzle, "treating", 3_000).state;
  const stored = serializeDualSession(session);
  const restored = hydrateDualSession({ payload: JSON.stringify(stored), puzzle: familyPuzzle, lexicon, dateKey: "2026-08-30" });
  assert.equal(restored.score, 1.1);
  assert.equal(restored.enScore, 1.1);
  assert.deepEqual(restored.submissions.map((submission) => submission.surface), ["treated", "treating"]);

  const wrongPuzzle = hydrateDualSession({ payload: stored, puzzle: { ...familyPuzzle, id: "other" }, lexicon, dateKey: "2026-08-30" });
  assert.equal(wrongPuzzle.submissions.length, 0);
});
