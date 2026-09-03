"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createBridgeSession, submitBridgeAnswer, type BridgePuzzle, type BridgeSession } from "../games/before-after/engine.mjs";
import { BeforeAfterPhraseRows, BeforeAfterWordmark, beforeAfterInstruction } from "../games/before-after/before-after-game";
import { createDecodeState, deriveDecodeFeedback, evaluateDecodeAttempt, normalizeDecodeInput, type DecodeFeedback } from "../games/decode/engine.mjs";
import { createDualSession, dualProgress, submitDualWord, type DualSession } from "../games/dual/engine.mjs";
import { canonicalContainsSequence, createDualLexicon, type DualLexicalEntry } from "../games/dual/lexicon.mjs";
import { dualLexiconEntries } from "../games/dual/catalog.mjs";
import { createRaritySession, evaluateRarityAttempt, formatRarityScore, RARITY_TIER_LABELS, type RaritySession } from "../games/rarity/engine.mjs";
import { createRarityServices } from "../games/rarity/services.mjs";
import { createSyllablSession, evaluateSyllablAttempt, getSyllablConstraint, type SyllablSession } from "../games/syllabl/engine.mjs";
import { createSyllablWordValidator } from "../games/syllabl/word-validator.mjs";
import { createPlayablePuzzleFromDraft } from "../games/token/authoring.mjs";
import { averageTokenScore, scoreTokenEntry } from "../games/token/engine.mjs";
import type { TokenPuzzle } from "../games/token/catalog";
import type { AnyPuzzleDraft, AuthorableGameId, PublishedPayloadByGame } from "./contracts.mjs";
import { decodeAuthoringType, decodePayloadEntries } from "./decode-payload";
import type { StudioCatalogItem } from "./catalog";

const SYLLABL_WORD_ENDPOINT = "https://fr9m4nzsu1.execute-api.us-east-1.amazonaws.com/wordinfo";
const RARITY_API_ROOT = "https://rminygbqxd.execute-api.us-east-1.amazonaws.com";

type PreviewDocument = AnyPuzzleDraft | StudioCatalogItem;
export type CompiledPreview = {
  id: string;
  gameId: AuthorableGameId;
  payload: PublishedPayloadByGame[AuthorableGameId];
};

export function compilePreview(document: PreviewDocument): { preview: CompiledPreview | null; errors: string[] } {
  if (!("kind" in document)) return { preview: { id: document.id, gameId: document.gameId, payload: document.payload }, errors: [] };
  const errors: string[] = [];
  let payload: PublishedPayloadByGame[AuthorableGameId] | null = null;
  switch (document.gameId) {
    case "syllabl": {
      const draft = document.payload;
      if (!/^[a-z]{3}$/.test(draft.puzzleLetters)) errors.push("Enter exactly three puzzle letters.");
      if (draft.stages.length !== 6) errors.push("Syllabl needs six stages.");
      payload = {
        puzzleLetters: draft.puzzleLetters,
        difficulty: draft.difficulty,
        inputsEnabled: draft.stages.map((stage) => stage.placementCode),
        syllablesRequired: draft.stages.map((stage) => stage.syllablesRequired),
      };
      break;
    }
    case "rarity": {
      if (document.payload.puzzleString.length < 2) errors.push("Enter at least two puzzle letters.");
      payload = {
        puzzleString: document.payload.puzzleString,
        difficulty: document.payload.difficulty,
        curatorName: document.payload.curatorName,
      };
      break;
    }
    case "before-after": {
      if (!document.payload.answer.trim() || document.payload.clueWords.some((clue) => !clue.trim())) errors.push("Add an answer and both clues.");
      payload = document.payload;
      break;
    }
    case "decode": {
      const entries = decodePayloadEntries(document.payload);
      const decodeType = decodeAuthoringType(document.payload);
      const expected = decodeType === "daily-5" ? 5 : 1;
      if (entries.length !== expected) errors.push(`Add exactly ${expected} ${expected === 1 ? "entry" : "entries"}.`);
      if (decodeType === "daily-5" && !document.payload.theme?.trim()) errors.push("Name the Daily 5 theme.");
      if (decodeType === "bank" && !document.payload.modes.some((mode) => mode === "timed" || mode === "zen")) errors.push("Choose Timed, Zen, or both for this bank entry.");
      entries.forEach((entry, index) => {
        if (!/^[A-Z]{4,7}$/.test(entry.answer) || entry.answer.length !== entry.clueWord.length) errors.push(`Entry ${index + 1}: answer and clue word must be matching four- to seven-letter words.`);
        if (!entry.clue.trim()) errors.push(`Entry ${index + 1}: add the definition clue.`);
      });
      payload = document.payload;
      break;
    }
    case "token": {
      if (!document.payload.generation) {
        errors.push("Attach a TOKEN generation before previewing.");
      } else {
        const puzzle = createPlayablePuzzleFromDraft({
          difficulty: document.payload.difficulty,
          draft: document.payload.generation,
          selectedStopIds: document.payload.selectedStopIds,
        });
        if (!puzzle.stops.length) errors.push("Select at least one playable prediction stop.");
        payload = { ...puzzle, summary: document.payload.summary };
      }
      break;
    }
    case "dual": {
      if (!/^[A-ZÑ]{3}$/u.test(document.payload.sequence)) errors.push("Enter exactly three puzzle letters.");
      const lexicon = document.payload.lexicon?.length
        ? document.payload.lexicon
        : dualLexiconEntries.filter((entry) => canonicalContainsSequence(entry.surface, document.payload.sequence));
      if (!lexicon.length) errors.push("No playable fixture lexicon entries match this sequence. Use the full DUAL workbench for corpus-built drafts.");
      payload = {
        sequence: document.payload.sequence,
        targetScore: document.payload.settings.targetScore,
        minimumEnglish: document.payload.settings.minimumEnglish,
        minimumSpanish: document.payload.settings.minimumSpanish,
        dualCount: createDualLexicon(lexicon).entries.filter((entry) => new Set(entry.senses.map((sense) => sense.language)).size === 2).length,
        lexicon,
      };
      break;
    }
  }
  return errors.length || !payload ? { preview: null, errors } : { preview: { id: document.id, gameId: document.gameId, payload }, errors: [] };
}

export function StudioPreview({ document }: { document: PreviewDocument }) {
  const compiled = useMemo(() => compilePreview(document), [document]);
  const [viewport, setViewport] = useState<"desktop" | "compact">("desktop");
  return (
    <section className="studio-preview">
      <header><div><p>Production engine</p><h2>Playtest</h2></div><div className="studio-preview-tools"><span>Progress stays here and never touches a Daily save.</span><div><button aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")} type="button">Desktop</button><button aria-pressed={viewport === "compact"} onClick={() => setViewport("compact")} type="button">Compact</button></div></div></header>
      <div className={`studio-preview-viewport is-${viewport}`}>
      {compiled.preview ? <PreviewGame key={`${compiled.preview.gameId}:${compiled.preview.id}:${JSON.stringify(compiled.preview.payload)}`} preview={compiled.preview} /> : (
        <div className="studio-preview-blocked"><strong>Preview isn’t ready yet.</strong><ul>{compiled.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>
      )}
      </div>
    </section>
  );
}

function PreviewGame({ preview }: { preview: CompiledPreview }) {
  switch (preview.gameId) {
    case "syllabl": return <SyllablPreview id={preview.id} payload={preview.payload as PublishedPayloadByGame["syllabl"]} />;
    case "rarity": return <RarityPreview id={preview.id} payload={preview.payload as PublishedPayloadByGame["rarity"]} />;
    case "before-after": return <BeforeAfterPreview id={preview.id} payload={preview.payload as PublishedPayloadByGame["before-after"]} />;
    case "decode": return <DecodePreview payload={preview.payload as PublishedPayloadByGame["decode"]} />;
    case "token": return <TokenPreview id={preview.id} payload={preview.payload as PublishedPayloadByGame["token"]} />;
    case "dual": return <DualPreview id={preview.id} payload={preview.payload as PublishedPayloadByGame["dual"]} />;
  }
}

function PreviewFrame({ game, children, onReset }: { game: string; children: React.ReactNode; onReset: () => void }) {
  return <div className="studio-preview-frame" data-preview-game={game}><button className="studio-preview-reset" onClick={onReset} type="button">Reset preview</button>{children}</div>;
}

function SyllablPreview({ id, payload }: { id: string; payload: PublishedPayloadByGame["syllabl"] }) {
  const puzzle = useMemo(() => ({ ...payload }), [payload]);
  const fresh = () => createSyllablSession({ puzzle, puzzleDate: `studio-${id}`, mode: "studio" });
  const [session, setSession] = useState<SyllablSession>(fresh);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("Enter a word to test the current stage.");
  const [checking, setChecking] = useState(false);
  const validator = useMemo(() => createSyllablWordValidator({ fetcher: fetch, endpoint: SYLLABL_WORD_ENDPOINT }), []);
  const constraint = getSyllablConstraint(session);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!constraint || checking) return;
    setChecking(true);
    setFeedback(`Checking ${entry.trim().toLocaleLowerCase()}…`);
    try {
      const result = evaluateSyllablAttempt({ session, word: entry, wordInfo: await validator(entry) });
      if (result.accepted) {
        setSession(result.session);
        setEntry("");
        setFeedback(result.session.status === "complete" ? "All six stages work." : `${result.guess.syllableList.join("·")} accepted.`);
      } else setFeedback(`Not accepted: ${result.reason}.`);
    } catch { setFeedback("The live dictionary service is unavailable."); }
    setChecking(false);
  }
  function reset() { setSession(fresh()); setEntry(""); setFeedback("Enter a word to test the current stage."); }
  const placement = constraint ? ({ 1: "ends with", 2: "begins with", 3: "fully contains", 4: "begins and ends with" } as const)[constraint.placementCode] : null;
  return <PreviewFrame game="syllabl" onReset={reset}><div className="preview-progress">{Array.from({ length: 6 }, (_, index) => <i className={index < session.currentStage ? "is-done" : ""} key={index} />)}</div><strong className="preview-token">{payload.puzzleLetters.toLocaleUpperCase()}</strong>{constraint ? <p>Find a word that <b>{placement} {payload.puzzleLetters.toLocaleUpperCase()}</b> and has <b>{constraint.syllablesRequired} syllable{constraint.syllablesRequired === 1 ? "" : "s"}</b>.</p> : <p>Puzzle complete.</p>}<PreviewEntry entry={entry} feedback={feedback} onChange={setEntry} onSubmit={submit} disabled={checking || !constraint} /></PreviewFrame>;
}

function RarityPreview({ id, payload }: { id: string; payload: PublishedPayloadByGame["rarity"] }) {
  const puzzle = useMemo(() => ({ date: null, source: "fallback" as const, ...payload, difficulty: payload.difficulty ?? 0 }), [payload]);
  const fresh = () => createRaritySession({ puzzle, puzzleDate: `studio-${id}` });
  const [session, setSession] = useState<RaritySession>(fresh);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("One valid guess. Make it count.");
  const [checking, setChecking] = useState(false);
  const services = useMemo(() => createRarityServices({ fetcher: fetch, wordInfoApi: `${RARITY_API_ROOT}/wordinfo`, puzzleApi: `${RARITY_API_ROOT}/puzzle`, leaderboardApi: `${RARITY_API_ROOT}/leaderboard` }), []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (checking || session.hasSubmitted) return;
    setChecking(true);
    try {
      const result = evaluateRarityAttempt({ state: session, puzzleString: payload.puzzleString, word: entry, wordInfo: await services.validateWord(entry), timestamp: new Date().toISOString() });
      if (result.accepted) {
        setSession(result.state);
        setFeedback(`${formatRarityScore(result.submission.exactScore)} · ${RARITY_TIER_LABELS[result.submission.tier]}`);
      } else setFeedback(`Not accepted: ${result.reason}.`);
    } catch { setFeedback("The live word service is unavailable."); }
    setChecking(false);
  }
  function reset() { setSession(fresh()); setEntry(""); setFeedback("One valid guess. Make it count."); }
  return <PreviewFrame game="rarity" onReset={reset}><span className="preview-eyebrow">Today’s string</span><strong className="preview-token">{payload.puzzleString.toLocaleUpperCase()}</strong><PreviewEntry entry={entry} feedback={feedback} onChange={setEntry} onSubmit={submit} disabled={checking || session.hasSubmitted} /></PreviewFrame>;
}

function BeforeAfterPreview({ id, payload }: { id: string; payload: PublishedPayloadByGame["before-after"] }) {
  const puzzle: BridgePuzzle = { id, ...payload };
  const fresh = () => createBridgeSession({ puzzle, mode: "custom", startedAt: 0 });
  const [session, setSession] = useState<BridgeSession>(fresh);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("Find the bridge.");
  const solved = session.status === "solved";
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = submitBridgeAnswer(session, entry, 1);
    setSession(result.state);
    setFeedback(result.correct ? "Bridge found." : result.accepted ? "Not the bridge." : "Enter an answer.");
  }
  function reset() { setSession(fresh()); setEntry(""); setFeedback("Find the bridge."); }
  return <div className="before-after-game-card studio-ba-native-preview" data-theme="signature" data-view="play"><PreviewFrame game="before-after" onReset={reset}><BeforeAfterWordmark compact /><section className="ba-play"><div className="ba-puzzle-card"><p className="ba-instruction">{beforeAfterInstruction(puzzle)}</p><BeforeAfterPhraseRows puzzle={puzzle} answer={entry} revealed={solved} /><p className={`ba-feedback ${solved ? "is-success" : ""}`}>{feedback}</p></div><PreviewEntry entry={entry} feedback="Type the bridge, then press Enter." onChange={setEntry} onSubmit={submit} disabled={solved} /></section></PreviewFrame></div>;
}

function DecodePreview({ payload }: { payload: PublishedPayloadByGame["decode"] }) {
  const entries = decodePayloadEntries(payload);
  const [entryIndex, setEntryIndex] = useState(0);
  const puzzle = entries[Math.min(entryIndex, entries.length - 1)]!;
  const [state, setState] = useState(() => createDecodeState("zen"));
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("Read both signals.");
  const tileFeedback = deriveDecodeFeedback(puzzle.clueWord, puzzle.answer);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = evaluateDecodeAttempt({ state, answer: puzzle.answer, guess: entry });
    if (result.correct) { setState(result.state); setFeedback("Signal decoded."); }
    else setFeedback(entry.length === puzzle.answer.length ? "Signal mismatch." : `Enter ${puzzle.answer.length} letters.`);
  }
  function reset() { setState(createDecodeState("zen")); setEntry(""); setFeedback("Read both signals."); }
  return <PreviewFrame game="decode" onReset={reset}>{entries.length > 1 && <div className="preview-decode-steps">{entries.map((_, index) => <button aria-pressed={entryIndex === index} key={index} onClick={() => { setEntryIndex(index); reset(); }} type="button">{index + 1}</button>)}</div>}<div className="preview-decode-tiles">{puzzle.clueWord.split("").map((letter, index) => <span data-feedback={(tileFeedback[index] as DecodeFeedback)} key={`${letter}-${index}`}>{letter}</span>)}</div><p className="preview-definition">“{puzzle.clue}”</p><PreviewEntry entry={entry} feedback={feedback} onChange={(value) => setEntry(normalizeDecodeInput(value, puzzle.answer.length))} onSubmit={submit} disabled={false} /></PreviewFrame>;
}

function TokenPreview({ id, payload }: { id: string; payload: PublishedPayloadByGame["token"] }) {
  const puzzle: TokenPuzzle = { id, schemaVersion: 1, ...payload };
  const [stopIndex, setStopIndex] = useState(0);
  const [submissions, setSubmissions] = useState<Array<{ score: number }>>([]);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("Predict the missing word or token.");
  const stop = puzzle.stops[stopIndex];
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!stop) return;
    const result = scoreTokenEntry(stop, entry, 12);
    if (!result.accepted) return setFeedback(`Not accepted: ${result.reason}.`);
    const next = [...submissions, { score: result.score ?? 0 }];
    setSubmissions(next);
    setFeedback(`${result.exact ? "Exact" : "Accepted"} · ${Math.round(result.score ?? 0)} points`);
    setEntry("");
    setStopIndex((current) => Math.min(current + 1, puzzle.stops.length));
  }
  function reset() { setStopIndex(0); setSubmissions([]); setEntry(""); setFeedback("Predict the missing word or token."); }
  const response = puzzle.responseTokens.map((token, index) => index === stop?.index ? "_____" : token).slice(0, (stop?.index ?? puzzle.responseTokens.length - 1) + 1).join(" ");
  return <PreviewFrame game="token" onReset={reset}><p className="preview-prompt">{puzzle.prompt}</p><div className="preview-token-response">{response}</div>{stop ? <PreviewEntry entry={entry} feedback={feedback} onChange={setEntry} onSubmit={submit} disabled={false} /> : <p className="preview-finished">Complete · average {averageTokenScore(submissions).toFixed(1)}</p>}</PreviewFrame>;
}

function DualPreview({ id, payload }: { id: string; payload: PublishedPayloadByGame["dual"] }) {
  const puzzle = useMemo(() => ({ id, sequence: payload.sequence, targetScore: payload.targetScore, minimumEnglish: payload.minimumEnglish, minimumSpanish: payload.minimumSpanish, dualCount: payload.dualCount }), [id, payload]);
  const lexicon = useMemo(() => createDualLexicon(payload.lexicon as DualLexicalEntry[]), [payload.lexicon]);
  const fresh = () => createDualSession({ puzzle, dateKey: `studio-${id}`, startedAt: 0 });
  const [session, setSession] = useState<DualSession>(fresh);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState("Type a word in English or Spanish.");
  const progress = dualProgress(session, puzzle);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = submitDualWord({ session, puzzle, lexicon, input: entry, now: session.submissions.length + 1 });
    if (result.accepted && result.submission) { setSession(result.state); setEntry(""); setFeedback(`${result.submission.surface} +${result.submission.points}`); }
    else setFeedback(`Not accepted: ${result.reason}.`);
  }
  function reset() { setSession(fresh()); setEntry(""); setFeedback("Type a word in English or Spanish."); }
  return <PreviewFrame game="dual" onReset={reset}><strong className="preview-token">{payload.sequence}</strong><div className="preview-dual-score"><span>EN {progress.enFamilies}/{payload.minimumEnglish}</span><b>{progress.score}/{payload.targetScore}</b><span>ES {progress.esFamilies}/{payload.minimumSpanish}</span></div><div className="preview-found-words">{session.submissions.map((submission) => <span data-kind={submission.kind} key={submission.surface}>{submission.surface}<small>+{submission.points}</small></span>)}</div><PreviewEntry entry={entry} feedback={feedback} onChange={setEntry} onSubmit={submit} disabled={false} /></PreviewFrame>;
}

function PreviewEntry({ disabled, entry, feedback, onChange, onSubmit }: { disabled: boolean; entry: string; feedback: string; onChange: (value: string) => void; onSubmit: (event: React.FormEvent) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!disabled) ref.current?.focus(); }, [disabled, feedback]);
  return <><form className="studio-preview-entry" onSubmit={onSubmit}><input autoComplete="off" disabled={disabled} onChange={(event) => onChange(event.target.value)} ref={ref} value={entry} /><button disabled={disabled} type="submit">Enter</button></form><p className="studio-preview-feedback" role="status">{feedback}</p></>;
}
