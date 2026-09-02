import {
  canonicalContainsSequence,
  dualEntryFamily,
  dualEntryLanguages,
  isDualEntry,
  normalizeDualInput,
  resolveDualInput,
} from "./lexicon.mjs";

export const DUAL_SESSION_VERSION = 2;
export const DUAL_NEW_FAMILY_POINTS = 1;
export const DUAL_ADDITIONAL_FORM_POINTS = 0.1;

function roundPoints(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function createDualSession({ puzzle, dateKey, startedAt = Date.now() }) {
  return {
    version: DUAL_SESSION_VERSION,
    puzzleId: puzzle.id,
    dateKey,
    submissions: [],
    seenFamilies: [],
    score: 0,
    enScore: 0,
    esScore: 0,
    solvedAt: null,
    allDualsFoundAt: null,
    finishedAt: null,
    startedAt,
  };
}

export function dualProgress(session, puzzle) {
  const foundDuals = session.submissions.filter((submission) => submission.kind === "dual").length;
  const enFamilies = session.seenFamilies.filter((key) => key.startsWith("en:")).length;
  const esFamilies = session.seenFamilies.filter((key) => key.startsWith("es:")).length;
  return {
    score: session.score,
    enScore: session.enScore,
    esScore: session.esScore,
    enFamilies,
    esFamilies,
    foundDuals,
    isSolved:
      session.score >= puzzle.targetScore &&
      enFamilies >= puzzle.minimumEnglish &&
      esFamilies >= puzzle.minimumSpanish,
    allDualsFound: puzzle.dualCount > 0 && foundDuals >= puzzle.dualCount,
  };
}

export function dualWordProgress(session, puzzle, lexicon) {
  const playableSurfaces = new Set();
  for (const entry of lexicon.entries) {
    if (!canonicalContainsSequence(entry.surface, puzzle.sequence)) continue;
    const resolution = resolveDualInput(lexicon, entry.surface);
    if (resolution.status !== "resolved" || !resolution.entry) continue;
    playableSurfaces.add(normalizeDualInput(resolution.entry.surface));
  }
  const found = new Set(session.submissions
    .map((submission) => normalizeDualInput(submission.surface))
    .filter((surface) => playableSurfaces.has(surface))).size;
  const total = playableSurfaces.size;
  return { found, total, allWordsFound: total > 0 && found >= total };
}

export function dualFamilyDiscoveries({ session, lexicon, language }) {
  const families = new Map();
  session.submissions.forEach((submission, index) => {
    if (submission.kind === "dual" || !submission.languages.includes(language)) return;
    const resolution = resolveDualInput(lexicon, submission.surface);
    if (resolution.status !== "resolved" || !resolution.entry) return;
    const family = dualEntryFamily(resolution.entry, language);
    if (!families.has(family)) families.set(family, { family, items: [], lastIndex: index });
    const group = families.get(family);
    group.items.push({ submission, index });
    group.lastIndex = index;
  });

  return [...families.values()]
    .map((group) => {
      const headIndex = group.items.findIndex(({ submission }) =>
        normalizeDualInput(submission.surface) === normalizeDualInput(group.family));
      const anchorIndex = headIndex >= 0 ? headIndex : 0;
      return {
        family: group.family,
        anchor: group.items[anchorIndex].submission,
        forms: group.items.filter((_, index) => index !== anchorIndex).map(({ submission }) => submission),
        lastIndex: group.lastIndex,
      };
    })
    .sort((left, right) => right.lastIndex - left.lastIndex);
}

function rejected(session, reason, extra = {}) {
  return { accepted: false, reason, state: session, submission: null, ...extra };
}

export function submitDualWord({ session, puzzle, lexicon, input, now = Date.now() }) {
  const resolution = resolveDualInput(lexicon, input);
  if (resolution.status === "empty") return rejected(session, "empty");
  if (resolution.status === "ambiguous") {
    return rejected(session, "ambiguous", {
      candidates: resolution.candidates.map((entry) => entry.surface),
    });
  }
  if (resolution.status !== "resolved" || !resolution.entry) {
    return rejected(session, "invalid");
  }

  const entry = resolution.entry;
  if (!canonicalContainsSequence(entry.surface, puzzle.sequence)) {
    return rejected(session, "sequence-missing", { canonical: entry.surface });
  }

  const normalizedSurface = normalizeDualInput(entry.surface);
  if (session.submissions.some((submission) => normalizeDualInput(submission.surface) === normalizedSurface)) {
    return rejected(session, "duplicate", { canonical: entry.surface });
  }

  const languages = dualEntryLanguages(entry);
  const dual = isDualEntry(entry);
  const seenFamilies = new Set(session.seenFamilies);
  let points = 0;
  let enPoints = 0;
  let esPoints = 0;
  let kind = "new-lemma";

  for (const language of languages) {
    const family = dualEntryFamily(entry, language);
    const familyKey = `${language}:${family}`;
    const discoversFamily = !seenFamilies.has(familyKey);
    const contribution = discoversFamily ? DUAL_NEW_FAMILY_POINTS : DUAL_ADDITIONAL_FORM_POINTS;
    if (language === "en") enPoints = contribution;
    if (language === "es") esPoints = contribution;
    seenFamilies.add(familyKey);
  }
  points = roundPoints(enPoints + esPoints);
  if (dual) kind = "dual";
  else kind = points === DUAL_ADDITIONAL_FORM_POINTS ? "inflection" : "new-lemma";

  const submission = {
    typed: normalizeDualInput(input),
    surface: entry.surface,
    kind,
    languages,
    points,
    enPoints,
    esPoints,
    normalizedByAccent: resolution.normalizedByAccent === true,
    submittedAt: now,
  };
  let state = {
    ...session,
    submissions: [...session.submissions, submission],
    seenFamilies: [...seenFamilies],
    score: roundPoints(session.score + points),
    enScore: roundPoints(session.enScore + enPoints),
    esScore: roundPoints(session.esScore + esPoints),
  };
  const progress = dualProgress(state, puzzle);
  if (progress.isSolved && !state.solvedAt) state = { ...state, solvedAt: now };
  if (progress.allDualsFound && !state.allDualsFoundAt) state = { ...state, allDualsFoundAt: now };

  return { accepted: true, reason: null, state, submission, progress };
}

export function finishDualSession(session, now = Date.now()) {
  return session.finishedAt ? session : { ...session, finishedAt: now };
}

export function serializeDualSession(session) {
  return {
    version: DUAL_SESSION_VERSION,
    puzzleId: session.puzzleId,
    dateKey: session.dateKey,
    submissions: session.submissions.map((submission) => ({
      typed: submission.typed,
      surface: submission.surface,
      submittedAt: submission.submittedAt,
    })),
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  };
}

export function hydrateDualSession({ payload, puzzle, lexicon, dateKey }) {
  const parsed = typeof payload === "string" ? (() => {
    try { return JSON.parse(payload); } catch { return null; }
  })() : payload;
  const fresh = createDualSession({ puzzle, dateKey });
  if (!parsed || typeof parsed !== "object") return fresh;
  if (
    parsed.version !== DUAL_SESSION_VERSION ||
    parsed.puzzleId !== puzzle.id ||
    parsed.dateKey !== dateKey ||
    !Array.isArray(parsed.submissions)
  ) return fresh;

  let state = createDualSession({
    puzzle,
    dateKey,
    startedAt: Number.isFinite(parsed.startedAt) ? parsed.startedAt : Date.now(),
  });
  for (const stored of parsed.submissions) {
    const value = typeof stored?.surface === "string" ? stored.surface : stored?.typed;
    const result = submitDualWord({
      session: state,
      puzzle,
      lexicon,
      input: value,
      now: Number.isFinite(stored?.submittedAt) ? stored.submittedAt : Date.now(),
    });
    if (result.accepted) state = result.state;
  }
  if (Number.isFinite(parsed.finishedAt)) state = { ...state, finishedAt: parsed.finishedAt };
  return state;
}
