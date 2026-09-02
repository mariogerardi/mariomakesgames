import assert from "node:assert/strict";
import test from "node:test";
import {
  TOKEN_BUILDER_DEFAULTS,
  createPlayablePuzzleFromDraft,
  createTokenBuilderExport,
  createTokenDraftFromGeneration,
  formatRawModelToken,
  normalizeBuilderSettings,
  scoreLogprob,
  validateAuthoringNotes,
  validateBuilderPrompt,
} from "../../src/games/token/authoring.mjs";

test("TOKEN authoring keeps a compact, bounded local generation budget and private notes", () => {
  assert.deepEqual(normalizeBuilderSettings({ maxOutputTokens: 1, temperature: -1 }), {
    maxOutputTokens: 96,
    temperature: 0,
  });
  assert.equal(TOKEN_BUILDER_DEFAULTS.topLogprobs, 10);
  assert.equal(scoreLogprob(0), 99);
  assert.equal(scoreLogprob(-20), 1);
  assert.equal(validateBuilderPrompt("short").valid, false);
  assert.equal(validateAuthoringNotes("Maximum five sentences.").valid, true);
  assert.equal(validateAuthoringNotes("x".repeat(1_201)).valid, false);
});

test("TOKEN authoring preserves every raw model token and makes manual easy and hard puzzles", () => {
  const responseText = "A calm interface makes model behavior readable.";
  const tokenLogprobs = [
    { token: "A", logprob: -0.1, top_logprobs: [{ token: "A", logprob: -0.1 }, { token: "The", logprob: -1.1 }] },
    { token: " calm", logprob: -0.2, top_logprobs: [{ token: " calm", logprob: -0.2 }, { token: " clear", logprob: -1.0 }] },
    { token: " interface", logprob: -0.3, top_logprobs: [{ token: " interface", logprob: -0.3 }, { token: " system", logprob: -1.4 }] },
    { token: " makes", logprob: -0.4, top_logprobs: [{ token: " makes", logprob: -0.4 }, { token: " keeps", logprob: -1.3 }] },
    { token: " model", logprob: -0.5, top_logprobs: [{ token: " model", logprob: -0.5 }, { token: " machine", logprob: -1.5 }] },
    { token: " behavior", logprob: -0.5, top_logprobs: [{ token: " behavior", logprob: -0.5 }, { token: " work", logprob: -1.5 }] },
    { token: " readable", logprob: -0.6, top_logprobs: [{ token: " readable", logprob: -0.6 }, { token: " visible", logprob: -1.7 }] },
    { token: ".", logprob: -0.2, top_logprobs: [{ token: ".", logprob: -0.2 }, { token: "!", logprob: -1.8 }] },
  ];
  const draft = createTokenDraftFromGeneration({
    authoringNotes: "Maximum five sentences.",
    id: "local-test",
    model: "gpt-5.6-terra",
    prompt: "Explain why prediction can make AI feel less mysterious.",
    responseText,
    tokenLogprobs,
  });
  assert.equal(draft.rawTokens.length, tokenLogprobs.length);
  assert.equal(draft.words.length, 7);
  assert.equal(draft.words[6].selectable, true);
  assert.equal(draft.words[6].easyStatus, "ready");
  assert.equal(formatRawModelToken(draft.rawTokens[1].token), "␠calm");

  const easy = createPlayablePuzzleFromDraft({ difficulty: "easy", draft, selectedStopIds: ["word-2", "word-5"] });
  assert.equal(easy.difficulty, "easy");
  assert.equal(easy.responseTokens.length, 7);
  assert.deepEqual(easy.stops.map((stop) => stop.token), ["interface", "behavior"]);
  assert.ok(easy.stops.every((stop) => stop.candidates.length));

  const punctuationBoundEasy = createPlayablePuzzleFromDraft({ difficulty: "easy", draft, selectedStopIds: ["word-6"] });
  assert.equal(punctuationBoundEasy.responseTokens[6], "readable.");
  assert.deepEqual(punctuationBoundEasy.stops.map((stop) => stop.token), ["readable"]);

  const hard = createPlayablePuzzleFromDraft({ difficulty: "hard", draft, selectedStopIds: ["token-1", "token-7"] });
  assert.equal(hard.difficulty, "hard");
  assert.equal(hard.responseTokens[1], "␠calm");
  assert.deepEqual(hard.stops.map((stop) => stop.token), ["calm", "."]);

  const exported = createTokenBuilderExport({ difficulty: "hard", draft, selectedStopIds: ["token-1"] });
  assert.equal(exported.authoring.authoringNotes, "Maximum five sentences.");
  assert.equal(exported.authoring.rawTokens.length, tokenLogprobs.length);
  assert.deepEqual(exported.selection.selectedStopIds, ["token-1"]);
});

test("TOKEN easy mode accepts words touched by opening and closing punctuation without making punctuation part of the answer", () => {
  const draft = createTokenDraftFromGeneration({
    id: "punctuation-test",
    prompt: "Use a quoted greeting in a short sentence.",
    responseText: "“Hello,” said the guide.",
    tokenLogprobs: [
      { token: "“Hello,”", logprob: -0.2, top_logprobs: [{ token: "“Hello,”", logprob: -0.2 }, { token: "“Welcome,”", logprob: -1.2 }] },
      { token: " said", logprob: -0.3, top_logprobs: [] },
      { token: " the", logprob: -0.4, top_logprobs: [] },
      { token: " guide.", logprob: -0.5, top_logprobs: [] },
    ],
  });
  const puzzle = createPlayablePuzzleFromDraft({ difficulty: "easy", draft, selectedStopIds: ["word-0"] });
  assert.equal(draft.words[0].selectable, true);
  assert.equal(puzzle.responseTokens[0], "“Hello,”");
  assert.equal(puzzle.stops[0].token, "Hello");
});

test("TOKEN easy mode excludes a written word that is split across raw model tokens", () => {
  const draft = createTokenDraftFromGeneration({
    id: "fragment-test",
    prompt: "Use a contraction in one short sentence.",
    responseText: "It doesn’t wait.",
    tokenLogprobs: [
      { token: "It", logprob: -0.1, top_logprobs: [] },
      { token: " doesn", logprob: -0.2, top_logprobs: [] },
      { token: "’t", logprob: -0.2, top_logprobs: [] },
      { token: " wait", logprob: -0.3, top_logprobs: [] },
      { token: ".", logprob: -0.1, top_logprobs: [] },
    ],
  });
  assert.equal(draft.words[1].text, "doesn’t");
  assert.equal(draft.words[1].easyStatus, "fragmented");
  assert.equal(draft.words[1].selectable, false);
  assert.equal(createPlayablePuzzleFromDraft({ difficulty: "easy", draft, selectedStopIds: ["word-1"] }).stops.length, 0);
});
