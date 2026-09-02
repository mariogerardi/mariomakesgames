export const TOKEN_BUILDER_DEFAULTS = Object.freeze({
  maxOutputTokens: 256,
  model: "gpt-5.6-terra",
  temperature: 0,
  topLogprobs: 10,
});

const WORD_TOKEN = /^\p{L}+(?:['’]\p{L}+)?$/u;
const EDGE_PUNCTUATION = /^\p{P}+|\p{P}+$/gu;

export function clampBuilderNumber(value, { fallback, max, min, step = 1 }) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const clamped = Math.max(min, Math.min(max, number));
  return Number((Math.round(clamped / step) * step).toFixed(6));
}

export function normalizeBuilderSettings(value = {}) {
  return {
    maxOutputTokens: clampBuilderNumber(value.maxOutputTokens, {
      fallback: TOKEN_BUILDER_DEFAULTS.maxOutputTokens,
      min: 96,
      max: 512,
      step: 16,
    }),
    temperature: clampBuilderNumber(value.temperature, {
      fallback: TOKEN_BUILDER_DEFAULTS.temperature,
      min: 0,
      max: 1.2,
      step: 0.05,
    }),
  };
}

export function scoreLogprob(logprob) {
  const number = Number(logprob);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(99, Math.round(Math.exp(number) * 100)));
}

function rawEntry(value) {
  return String(value ?? "");
}

function trimmedEntry(value) {
  return rawEntry(value).trim();
}

function wordWithoutEdgePunctuation(value) {
  const word = trimmedEntry(value).replace(EDGE_PUNCTUATION, "");
  return WORD_TOKEN.test(word) ? word : null;
}

export function formatRawModelToken(value) {
  return rawEntry(value)
    .replace(/ /g, "␠")
    .replace(/\n/g, "↵")
    .replace(/\t/g, "⇥");
}

function positionsFor(records) {
  let cursor = 0;
  return records.map((record, index) => {
    const token = rawEntry(record?.token);
    const start = cursor;
    cursor += token.length;
    return {
      alternatives: (Array.isArray(record?.top_logprobs) ? record.top_logprobs : []).map((alternative) => ({
        logprob: Number(alternative?.logprob),
        token: rawEntry(alternative?.token),
      })),
      end: cursor,
      id: `token-${index}`,
      index,
      logprob: Number(record?.logprob),
      start,
      token,
    };
  });
}

function wordsFor(responseText, rawTokens) {
  const words = [];
  for (const match of String(responseText ?? "").matchAll(/\S+/gu)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const sourceTokenIndexes = rawTokens
      .filter((token) => token.end > start && token.start < end)
      .map((token) => token.index);
    const answer = wordWithoutEdgePunctuation(match[0]);
    const contentSourceTokens = sourceTokenIndexes
      .map((index) => ({ index, word: wordWithoutEdgePunctuation(rawTokens[index]?.token) }))
      .filter((token) => token.word);
    const isWholeModelWord = Boolean(
      answer
      && contentSourceTokens.length === 1
      && contentSourceTokens[0].word.toLocaleLowerCase() === answer.toLocaleLowerCase(),
    );
    words.push({
      easyStatus: !answer ? "not-word" : isWholeModelWord ? "ready" : "fragmented",
      id: `word-${words.length}`,
      index: words.length,
      selectable: isWholeModelWord,
      sourceTokenIndexes,
      text: match[0],
    });
  }
  return words;
}

export function createTokenDraftFromGeneration({
  authoringNotes = "",
  id = `local-${Date.now()}`,
  model = TOKEN_BUILDER_DEFAULTS.model,
  prompt,
  responseText,
  tokenLogprobs = [],
}) {
  const rawTokens = positionsFor(tokenLogprobs);
  const rawResponse = rawTokens.map((token) => token.token).join("");
  return {
    authoringNotes: String(authoringNotes ?? "").trim(),
    id,
    model,
    prompt: String(prompt ?? "").trim(),
    rawTokens,
    responseText: String(responseText ?? "").trim(),
    schemaVersion: 1,
    // Use the joined model-token stream for character positions. The visible
    // response may be trimmed, while the model's first or last token can
    // legitimately contain whitespace.
    words: wordsFor(rawResponse || responseText, rawTokens),
  };
}

function candidatesFor(rawToken, canonical, { wordsOnly }) {
  const candidates = [];
  const seen = new Set([canonical.toLocaleLowerCase()]);
  for (const alternative of rawToken?.alternatives ?? []) {
    const candidate = wordsOnly ? wordWithoutEdgePunctuation(alternative.token) : trimmedEntry(alternative.token);
    if (!candidate) continue;
    const key = candidate.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ token: candidate, score: scoreLogprob(alternative.logprob) });
  }
  return candidates;
}

export function createPlayablePuzzleFromDraft({ difficulty, draft, selectedStopIds }) {
  const selected = new Set(selectedStopIds);
  const isHard = difficulty === "hard";
  const units = isHard ? draft.rawTokens : draft.words;
  const responseTokens = isHard
    ? draft.rawTokens.map((token) => formatRawModelToken(token.token))
    : draft.words.map((word) => word.text);
  const stops = [];

  units.forEach((unit, index) => {
    if (!selected.has(unit.id)) return;
    if (!isHard && !unit.selectable) return;
    const sourceIndex = isHard ? unit.index : unit.sourceTokenIndexes[0];
    const source = draft.rawTokens[sourceIndex];
    const canonical = isHard ? trimmedEntry(unit.token) : wordWithoutEdgePunctuation(unit.text);
    if (!source || !canonical) return;
    stops.push({
      candidates: candidatesFor(source, canonical, { wordsOnly: !isHard }),
      index,
      token: canonical,
    });
  });

  return {
    difficulty: isHard ? "hard" : "easy",
    id: `${draft.id}-${isHard ? "tokens" : "words"}`,
    prompt: draft.prompt,
    responseTokens,
    schemaVersion: 1,
    stops,
    tokenizer: {
      id: isHard ? "openai-logprob-raw-token-v1" : "openai-logprob-word-group-v1",
      note: isHard
        ? "Raw model-token mode: leading spaces and line breaks are visibly marked in the response."
        : "Word mode: model tokens are grouped into readable written words.",
    },
  };
}

export function createTokenBuilderExport({ difficulty, draft, selectedStopIds }) {
  return {
    authoring: {
      authoringNotes: draft.authoringNotes,
      model: draft.model,
      rawTokens: draft.rawTokens,
      responseText: draft.responseText,
    },
    puzzle: createPlayablePuzzleFromDraft({ difficulty, draft, selectedStopIds }),
    schemaVersion: 1,
    selection: { difficulty, selectedStopIds: [...selectedStopIds] },
  };
}

export function validateBuilderPrompt(value) {
  const prompt = String(value ?? "").trim();
  if (prompt.length < 12) return { prompt, valid: false, reason: "Describe a fuller response to generate." };
  if (prompt.length > 1_200) return { prompt, valid: false, reason: "Keep the prompt under 1,200 characters." };
  return { prompt, valid: true, reason: null };
}

export function validateAuthoringNotes(value) {
  const notes = String(value ?? "").trim();
  if (notes.length > 1_200) return { notes, valid: false, reason: "Keep private authoring constraints under 1,200 characters." };
  return { notes, valid: true, reason: null };
}
