"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import { gameStorageKey } from "../../platform/storage";
import {
  TOKEN_BUILDER_DEFAULTS,
  createPlayablePuzzleFromDraft,
  createTokenBuilderExport,
  createTokenDraftFromGeneration,
  formatRawModelToken,
  normalizeBuilderSettings,
  validateAuthoringNotes,
  validateBuilderPrompt,
  type TokenDraft,
} from "./authoring.mjs";
import {
  tokenDemoPuzzle,
  tokenPuzzles,
  type TokenCatalogPuzzle,
  type TokenPredictionStop,
  type TokenPuzzle,
} from "./catalog";
import {
  TOKEN_PHASES,
  averageTokenScore,
  hydrateTokenRun,
  scoreTokenEntry,
  serializeTokenRun,
  transitionTokenRun,
} from "./engine.mjs";
import { limitTokenEntry } from "./tokenizer.mjs";
import {
  parseLocalTokenLibrary,
  selectDailyTokenPuzzle,
  serializeLocalTokenLibrary,
  tokenDateKey,
  upsertLocalTokenLibraryEntry,
  type TokenLibraryEntry,
} from "./library.mjs";

const RUNS_STORAGE_KEY = gameStorageKey("token", "runs");
const LIBRARY_STORAGE_KEY = gameStorageKey("token", "library");
const TUTORIAL_STORAGE_KEY = gameStorageKey("token", "tutorial");

type TokenPhase = typeof TOKEN_PHASES[keyof typeof TOKEN_PHASES];

type TokenSubmission = {
  canonical: string;
  entry: string;
  exact: boolean;
  score: number;
  status: "exact" | "ok" | "warn" | "crit";
  stopIndex: number;
  tokenized: string[];
};

type TokenRun = {
  completed: boolean;
  cursor: number;
  phase: TokenPhase;
  puzzleId: string;
  stopCursor: number;
  submissions: TokenSubmission[];
};

type TokenView = "menu" | "daily" | "archive" | "play" | "how" | "build";

type BuilderSettings = {
  maxOutputTokens: number;
  temperature: number;
};

type GeneratedTokenPayload = {
  model: string;
  responseText: string;
  tokenLogprobs: Array<{
    logprob: number;
    token: string;
    top_logprobs: Array<{ logprob: number; token: string }>;
  }>;
};

type TokenDifficulty = "easy" | "hard";

type TokenArchiveEntry = {
  dailyDate?: string | null;
  origin: "edition" | "local";
  puzzle: TokenPuzzle;
  savedAt?: string;
  summary: string;
  title: string;
};

type TokenDailySelection = {
  dateKey: string;
  index: number;
  origin: "edition" | "local";
  puzzle: TokenPuzzle;
  summary: string;
  title: string;
  total: number;
} | null;

type BuilderSelectionUnit = {
  candidateCount: number;
  id: string;
  label: string;
  rank: number | null;
  selectable: boolean;
  status: "ready" | "fragmented" | "not-word" | "raw";
  title?: string;
};

function initialRun(puzzle: TokenPuzzle = tokenDemoPuzzle): TokenRun {
  return {
    puzzleId: puzzle.id,
    phase: TOKEN_PHASES.LOADING,
    cursor: 0,
    stopCursor: 0,
    submissions: [],
    completed: false,
  };
}

function parseStoredRuns(value: string | null): Record<string, unknown> {
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (!parsed || parsed.schemaVersion !== 1 || typeof parsed.runs !== "object" || !parsed.runs) return {};
    return parsed.runs as Record<string, unknown>;
  } catch {
    return {};
  }
}

function selectTokenDailyPuzzle({
  catalog,
  date,
  difficulty,
  localLibrary,
}: {
  catalog: readonly TokenCatalogPuzzle[];
  date: string;
  difficulty: TokenDifficulty;
  localLibrary: readonly TokenLibraryEntry[];
}): TokenDailySelection {
  const scheduled = localLibrary.find((entry) => entry.dailyDate === date && entry.puzzle.difficulty === difficulty);
  if (scheduled) {
    return {
      dateKey: date,
      index: 0,
      origin: "local",
      puzzle: scheduled.puzzle,
      summary: "Scheduled from this browser’s local Builder.",
      title: scheduled.title,
      total: 1,
    };
  }
  const selection = selectDailyTokenPuzzle(catalog, { date, difficulty });
  if (!selection) return null;
  return {
    ...selection,
    origin: "edition",
    summary: selection.puzzle.summary,
    title: selection.puzzle.title,
  };
}

function responseClass(index: number, cursor: number, inspected: number | null) {
  const classes = ["token-response-token"];
  if (index < cursor) classes.push("is-complete");
  if (inspected !== null && index !== inspected) classes.push("is-inspection-muted");
  return classes.join(" ");
}

function tokenStyle(entry: string): CSSProperties {
  return { "--token-entry-width": `${Math.max(3.5, Math.min(20, Array.from(entry).length + 1.4))}ch` } as CSSProperties;
}

function predictionEntryLimit(stop: TokenPredictionStop | null) {
  if (!stop) return 12;
  const longestChoice = Math.max(
    Array.from(stop.token).length,
    ...stop.candidates.map((candidate) => Array.from(candidate.token).length),
  );
  return Math.max(12, Math.min(64, longestChoice));
}

function modelChoiceRank(token: { alternatives: Array<{ token: string }>; token: string }) {
  const index = token.alternatives.findIndex((alternative) => alternative.token === token.token);
  return index === -1 ? null : index + 1;
}

function defaultArchiveTitle(prompt: string) {
  const title = prompt.replace(/\s+/gu, " ").trim().replace(/[.?!]+$/u, "");
  return title.length > 62 ? title.slice(0, 59).trimEnd() + "…" : title;
}

function TokenWordmark({ compact = false }: { compact?: boolean }) {
  return <span className={`token-wordmark${compact ? " is-compact" : ""}`} aria-label="TOKEN">TOKEN<i /></span>;
}

function isLocalBuilderHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function TokenGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [puzzle, setPuzzle] = useState<TokenPuzzle>(tokenDemoPuzzle);
  const [run, setRun] = useState<TokenRun>(initialRun(tokenDemoPuzzle));
  const [localLibrary, setLocalLibrary] = useState<TokenLibraryEntry[]>([]);
  const [todayKey] = useState(() => tokenDateKey());
  const [entry, setEntry] = useState("");
  const [characterCursor, setCharacterCursor] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [resultsDismissed, setResultsDismissed] = useState(false);
  const [inspectedStop, setInspectedStop] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [view, setView] = useState<TokenView>("menu");
  const [builderAvailable, setBuilderAvailable] = useState(false);

  const dailyEasy = useMemo(
    () => selectTokenDailyPuzzle({
      catalog: tokenPuzzles,
      date: todayKey,
      difficulty: "easy",
      localLibrary,
    }),
    [localLibrary, todayKey],
  );
  const dailyHard = useMemo(
    () => selectTokenDailyPuzzle({
      catalog: tokenPuzzles,
      date: todayKey,
      difficulty: "hard",
      localLibrary,
    }),
    [localLibrary, todayKey],
  );
  const archiveEntries = useMemo<TokenArchiveEntry[]>(() => [
    ...tokenPuzzles.map((catalogPuzzle) => ({
      origin: "edition" as const,
      puzzle: catalogPuzzle,
      summary: catalogPuzzle.summary,
      title: catalogPuzzle.title,
    })),
    ...localLibrary.map((stored) => ({
      dailyDate: stored.dailyDate,
      origin: "local" as const,
      puzzle: stored.puzzle,
      savedAt: stored.savedAt,
      summary: stored.dailyDate
        ? "Scheduled locally for " + stored.dailyDate + "."
        : "Saved from this browser’s local Builder.",
      title: stored.title,
    })),
  ], [localLibrary]);
  const activeStop = puzzle.stops[run.stopCursor] ?? null;
  const entryLimit = predictionEntryLimit(activeStop);
  const activeSubmission = run.submissions.at(-1) ?? null;
  const overallScore = useMemo(() => averageTokenScore(run.submissions), [run.submissions]);
  const exactCount = useMemo(() => run.submissions.filter((submission) => submission.exact).length, [run.submissions]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const storedLibrary = parseLocalTokenLibrary(localStorage.getItem(LIBRARY_STORAGE_KEY));
        const starter = selectTokenDailyPuzzle({
          catalog: tokenPuzzles,
          date: tokenDateKey(),
          difficulty: "easy",
          localLibrary: storedLibrary,
        })?.puzzle ?? tokenDemoPuzzle;
        const storedRuns = parseStoredRuns(localStorage.getItem(RUNS_STORAGE_KEY));
        const saved = hydrateTokenRun(storedRuns[starter.id], starter) as TokenRun | null;
        setPuzzle(starter);
        setRun(saved ?? initialRun(starter));
        setLocalLibrary(storedLibrary);
        setTutorialOpen(localStorage.getItem(TUTORIAL_STORAGE_KEY) !== "complete");
      } catch {
        setPuzzle(tokenDemoPuzzle);
        setRun(initialRun(tokenDemoPuzzle));
        setTutorialOpen(true);
      } finally {
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setBuilderAvailable(isLocalBuilderHost(window.location.hostname)));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      const storedRuns = parseStoredRuns(localStorage.getItem(RUNS_STORAGE_KEY));
      storedRuns[puzzle.id] = JSON.parse(serializeTokenRun(run));
      localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, runs: storedRuns }));
    } catch {
      // Local progress is optional when storage is unavailable.
    }
  }, [hydrated, puzzle, run]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LIBRARY_STORAGE_KEY, serializeLocalTokenLibrary(localLibrary));
    } catch {
      // Local archives are optional when storage is unavailable.
    }
  }, [hydrated, localLibrary]);

  useEffect(() => {
    if (!hydrated || view !== "play" || run.phase !== TOKEN_PHASES.LOADING) return;
    const timer = window.setTimeout(() => setRun((current) => transitionTokenRun(current, TOKEN_PHASES.GENERATING) as TokenRun), 220);
    return () => window.clearTimeout(timer);
  }, [hydrated, run.phase, view]);

  useEffect(() => {
    if (!hydrated || view !== "play" || run.phase !== TOKEN_PHASES.GENERATING) return;
    const nextStop = puzzle.stops[run.stopCursor];
    if (run.cursor >= puzzle.responseTokens.length) {
      const timer = window.setTimeout(() => {
        setRun((current) => ({ ...transitionTokenRun(current, TOKEN_PHASES.COMPLETE), completed: true }) as TokenRun);
        window.setTimeout(() => setShowResults(true), 440);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (nextStop && run.cursor === nextStop.index) {
      const timer = window.setTimeout(() => {
        setRun((current) => transitionTokenRun(current, TOKEN_PHASES.PREDICTING) as TokenRun);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const streamingToken = puzzle.responseTokens[run.cursor];
    if (characterCursor < streamingToken.length) {
      const delay = 24 + ((run.cursor * 17 + characterCursor * 13) % 20);
      const timer = window.setTimeout(() => {
        setCharacterCursor((current) => Math.min(streamingToken.length, current + 1));
      }, delay);
      return () => window.clearTimeout(timer);
    }

    const delay = 52 + ((run.cursor * 29) % 34);
    const timer = window.setTimeout(() => {
      setCharacterCursor(0);
      setRun((current) => ({ ...current, cursor: Math.min(current.cursor + 1, puzzle.responseTokens.length) }));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [characterCursor, hydrated, puzzle, run.cursor, run.phase, run.stopCursor, view]);

  useEffect(() => {
    if (view !== "play" || run.phase !== TOKEN_PHASES.PREDICTING || tutorialOpen) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [run.phase, tutorialOpen, view]);

  useEffect(() => {
    if (view !== "play" || (run.phase !== TOKEN_PHASES.REVEAL_EXACT && run.phase !== TOKEN_PHASES.REVEAL_MISS)) return;
    const delay = run.phase === TOKEN_PHASES.REVEAL_EXACT ? 760 : 1_100;
    const timer = window.setTimeout(() => {
      setEntry("");
      setCharacterCursor(0);
      setRun((current) => {
        const cursor = current.cursor + 1;
        const stopCursor = current.stopCursor + 1;
        if (cursor >= puzzle.responseTokens.length) {
          return { ...transitionTokenRun(current, TOKEN_PHASES.COMPLETE), cursor, stopCursor, completed: true } as TokenRun;
        }
        return { ...transitionTokenRun(current, TOKEN_PHASES.GENERATING), cursor, stopCursor } as TokenRun;
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [puzzle.responseTokens.length, run.phase, view]);

  useEffect(() => {
    if (view !== "play" || run.phase !== TOKEN_PHASES.COMPLETE || !run.completed || showResults || resultsDismissed) return;
    const timer = window.setTimeout(() => setShowResults(true), 420);
    return () => window.clearTimeout(timer);
  }, [resultsDismissed, run.completed, run.phase, showResults, view]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;
    const sync = () => setKeyboardOpen(window.innerHeight - visualViewport.height > 150);
    sync();
    visualViewport.addEventListener("resize", sync);
    return () => visualViewport.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    if (!showResults) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissResults();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showResults]);

  function completeTutorial() {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "complete");
    } catch {
      // The tutorial can remain ephemeral when storage is unavailable.
    }
    setTutorialOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function restart() {
    setEntry("");
    setCharacterCursor(0);
    setInspectedStop(null);
    setShowResults(false);
    setResultsDismissed(false);
    setView("play");
    setRun({ ...initialRun(puzzle), phase: TOKEN_PHASES.GENERATING });
  }

  function play() {
    if (run.completed) {
      restart();
      return;
    }
    setView("play");
  }

  function dismissResults() {
    setResultsDismissed(true);
    setShowResults(false);
  }

  function startPuzzle(nextPuzzle: TokenPuzzle) {
    let saved: TokenRun | null = null;
    try {
      const storedRuns = parseStoredRuns(localStorage.getItem(RUNS_STORAGE_KEY));
      saved = hydrateTokenRun(storedRuns[nextPuzzle.id], nextPuzzle) as TokenRun | null;
    } catch {
      // Starting a puzzle never depends on storage.
    }
    setPuzzle(nextPuzzle);
    setEntry("");
    setCharacterCursor(0);
    setInspectedStop(null);
    setShowResults(false);
    setResultsDismissed(false);
    setRun(saved && !saved.completed ? saved : initialRun(nextPuzzle));
    setView("play");
  }

  function playDraft(draft: TokenPuzzle) {
    setPuzzle(draft);
    setEntry("");
    setCharacterCursor(0);
    setInspectedStop(null);
    setShowResults(false);
    setResultsDismissed(false);
    setRun({ ...initialRun(draft), phase: TOKEN_PHASES.GENERATING });
    setView("play");
  }

  function saveToLocalArchive(nextPuzzle: TokenPuzzle, title: string, dailyDate: string | null) {
    setLocalLibrary((current) => upsertLocalTokenLibraryEntry(current, {
      dailyDate,
      puzzle: nextPuzzle,
      title,
    }));
  }

  function removeFromLocalArchive(puzzleId: string) {
    setLocalLibrary((current) => current.filter((entry) => entry.puzzle.id !== puzzleId));
    if (puzzle.id === puzzleId) {
      const fallback = dailyEasy?.puzzle ?? tokenDemoPuzzle;
      setPuzzle(fallback);
      setRun(initialRun(fallback));
      setView("menu");
    }
  }

  function submitPrediction() {
    if (!activeStop || run.phase !== TOKEN_PHASES.PREDICTING) return;
    const result = scoreTokenEntry(activeStop, entry, entryLimit);
    if (!result.accepted || result.score === undefined || !result.status || !result.tokenized) {
      inputRef.current?.focus();
      return;
    }
    const submission: TokenSubmission = {
      stopIndex: activeStop.index,
      canonical: activeStop.token,
      entry: result.entry,
      tokenized: result.tokenized,
      score: result.score,
      status: result.status as TokenSubmission["status"],
      exact: Boolean(result.exact),
    };
    setRun((current) => ({
      ...transitionTokenRun(current, submission.exact ? TOKEN_PHASES.REVEAL_EXACT : TOKEN_PHASES.REVEAL_MISS),
      submissions: [...current.submissions, submission],
    }) as TokenRun);
  }

  const displayedUntil = run.phase === TOKEN_PHASES.COMPLETE || run.phase === TOKEN_PHASES.RESULTS || run.phase === TOKEN_PHASES.INSPECTION
    ? puzzle.responseTokens.length
    : run.cursor + (run.phase === TOKEN_PHASES.REVEAL_EXACT || run.phase === TOKEN_PHASES.REVEAL_MISS ? 1 : 0);
  const inspectedSubmission = inspectedStop === null
    ? null
    : run.submissions.find((submission) => submission.stopIndex === inspectedStop) ?? null;
  const streamingToken = run.phase === TOKEN_PHASES.GENERATING && (!activeStop || activeStop.index !== run.cursor)
    ? puzzle.responseTokens[run.cursor]
    : null;

  return (
    <div className={`token-game${keyboardOpen ? " is-keyboard-open" : ""}${view === "build" ? " is-builder" : ""}`}>
      <GameLocalBar
        ariaLabel="TOKEN"
        brand={<TokenWordmark compact />}
        className="game-local-bar--token"
        items={[
          { label: "Menu", current: view === "menu", onSelect: () => setView("menu") },
          { label: "Daily", current: view === "daily", onSelect: () => setView("daily") },
          { label: "Archive", current: view === "archive", onSelect: () => setView("archive") },
          { label: "Play", current: view === "play", onSelect: play },
          { label: "How to play", current: view === "how", onSelect: () => setView("how") },
          ...(builderAvailable ? [{ label: "Build", current: view === "build", onSelect: () => setView("build") }] : []),
        ]}
        onHome={() => setView("menu")}
      />

      {view === "menu" ? (
        <TokenMenu
          dailyEasy={dailyEasy}
          dailyHard={dailyHard}
          onArchive={() => setView("archive")}
          onDaily={() => setView("daily")}
          onPlay={play}
          puzzle={puzzle}
          run={run}
          todayKey={todayKey}
        />
      ) : view === "daily" ? (
        <TokenDaily
          activePuzzleId={puzzle.id}
          dailyEasy={dailyEasy}
          dailyHard={dailyHard}
          onPlay={startPuzzle}
          todayKey={todayKey}
        />
      ) : view === "archive" ? (
        <TokenArchive
          activePuzzleId={puzzle.id}
          entries={archiveEntries}
          onPlay={startPuzzle}
          onRemove={removeFromLocalArchive}
        />
      ) : view === "how" ? (
        <TokenHow onPlay={play} />
      ) : view === "build" && builderAvailable ? (
        <TokenBuilder onPlayDraft={playDraft} onSaveToArchive={saveToLocalArchive} />
      ) : (
      <main className="token-surface" aria-label="TOKEN prediction game">
        <p className="token-prompt">{puzzle.prompt}</p>
        <div className="token-response-viewport">
          <div className={`token-response${inspectedStop !== null ? " has-inspection" : ""}${puzzle.difficulty === "hard" ? " is-raw-token-mode" : ""}`}>
            {puzzle.responseTokens.slice(0, displayedUntil).map((token, index) => {
              const stop = puzzle.stops.find((entryStop) => entryStop.index === index);
              const submission = stop ? run.submissions.find((entry) => entry.stopIndex === index) : null;
              const isRevealing = index === run.cursor && (run.phase === TOKEN_PHASES.REVEAL_EXACT || run.phase === TOKEN_PHASES.REVEAL_MISS);
              const canInspect = run.phase === TOKEN_PHASES.COMPLETE && Boolean(submission);
              const tokenNode = (
                <span className={responseClass(index, run.cursor, inspectedStop)} data-token-index={index}>
                  {token}
                </span>
              );
              if (!stop) return <span className={`token-response-cell${puzzle.difficulty === "hard" ? " is-raw-token" : ""}`} key={`${token}-${index}`}>{tokenNode}</span>;
              return (
                <span className={`token-response-cell is-stop${puzzle.difficulty === "hard" ? " is-raw-token" : ""}${isRevealing ? " is-revealing" : ""}`} key={`${token}-${index}`}>
                  {canInspect ? (
                    <button aria-label={`Inspect prediction for ${token}`} className="token-inspect-marker" onClick={() => setInspectedStop(index)} type="button">
                      {tokenNode}
                    </button>
                  ) : tokenNode}
                  {isRevealing && activeSubmission && !activeSubmission.exact && (
                    <span className="token-displaced-guess">
                      <i>{activeSubmission.entry}</i><b className={`is-${activeSubmission.status}`}>{activeSubmission.score.toFixed(0)}</b>
                    </span>
                  )}
                </span>
              );
            })}

            {streamingToken && characterCursor > 0 && (
              <span className={`token-response-cell is-streaming${puzzle.difficulty === "hard" ? " is-raw-token" : ""}`} aria-label={streamingToken}>
                <span className="token-response-token is-streaming-token">
                  {Array.from(streamingToken.slice(0, characterCursor)).map((character, index, characters) => (
                    <span className={index >= characters.length - 3 ? "is-bulge" : ""} key={`${character}-${index}`}>{character}</span>
                  ))}
                </span>
              </span>
            )}

            {run.phase === TOKEN_PHASES.PREDICTING && (
              <span className="token-inline-entry" style={tokenStyle(entry)}>
                <input
                  aria-label="Predict TOKEN’s next token"
                  autoCapitalize="none"
                  autoComplete="off"
                  onChange={(event) => setEntry(limitTokenEntry(event.target.value, entryLimit))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitPrediction();
                    }
                  }}
                  ref={inputRef}
                  spellCheck={false}
                  value={entry}
                />
                {Array.from(entry).length >= Math.min(10, entryLimit) && <small>{Array.from(entry).length}/{entryLimit}</small>}
              </span>
            )}
            {(run.phase === TOKEN_PHASES.GENERATING || run.phase === TOKEN_PHASES.PREDICTING) && (
              <span aria-hidden="true" className={`token-cursor${run.phase === TOKEN_PHASES.PREDICTING ? " is-steady" : ""}`} />
            )}
          </div>
        </div>

        {inspectedSubmission && (
          <Inspection
            onClose={() => setInspectedStop(null)}
            stop={puzzle.stops.find((stop) => stop.index === inspectedSubmission.stopIndex)!}
            submission={inspectedSubmission}
          />
        )}
      </main>
      )}

      {view === "play" && tutorialOpen && run.phase === TOKEN_PHASES.PREDICTING && (
        <aside className="token-tutorial" aria-label="How TOKEN works">
          <div>
            <p><b>1</b><span>TOKEN streams a frozen response, then stops.</span></p>
            <p><b>2</b><span>Type the next complete token. Its length is unknown.</span></p>
            <p><b>3</b><span>Press <kbd>Enter</kbd> to submit. Likely alternatives earn partial credit.</span></p>
            <button onClick={completeTutorial} type="button">Start predicting</button>
            <button className="token-tutorial-skip" onClick={completeTutorial} type="button">Skip</button>
          </div>
        </aside>
      )}

      {view === "play" && showResults && (
        <div className="token-results-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismissResults();
        }} role="presentation">
          <section aria-labelledby="token-results-title" aria-modal="true" className="token-results" role="dialog">
            <p>Response complete</p>
            <strong>{overallScore.toFixed(1)}</strong>
            <h2 id="token-results-title">average prediction score</h2>
            <dl>
              <div><dt>Exact matches</dt><dd>{exactCount}</dd></div>
              <div><dt>Predictions</dt><dd>{run.submissions.length}</dd></div>
            </dl>
            <button autoFocus onClick={dismissResults} type="button">Inspect the response</button>
          </section>
        </div>
      )}
    </div>
  );
}

function TokenMenu({ dailyEasy, dailyHard, onArchive, onDaily, onPlay, puzzle, run, todayKey }: {
  dailyEasy: TokenDailySelection;
  dailyHard: TokenDailySelection;
  onArchive: () => void;
  onDaily: () => void;
  onPlay: () => void;
  puzzle: TokenPuzzle;
  run: TokenRun;
  todayKey: string;
}) {
  const resumed = run.submissions.length > 0 && !run.completed;
  const action = run.completed ? "Start a new response" : resumed ? "Continue this response" : "Start predicting";
  return (
    <main className="token-home" aria-label="TOKEN menu">
      <div className="token-home-inner">
        <header className="token-home-heading">
          <p>frozen response prediction</p>
          <h2><TokenWordmark /></h2>
          <span>Predict what the machine will generate next.</span>
        </header>
        <div className="token-menu-grid" aria-label="TOKEN menu choices">
          <button className="token-menu-play" onClick={onPlay} type="button">
            <span>{puzzle.difficulty} · {resumed ? String(run.submissions.length) + " of " + String(puzzle.stops.length) + " predictions logged" : String(puzzle.stops.length) + " authored predictions"}</span>
            <strong>{action}</strong>
            <small>{puzzle.id === dailyEasy?.puzzle.id || puzzle.id === dailyHard?.puzzle.id ? "Today’s selected response is ready." : "TOKEN stops. You supply the next token."}</small>
            <b aria-hidden="true">→</b>
          </button>
          <button className="token-menu-daily" onClick={onDaily} type="button">
            <span>Daily · {todayKey}</span>
            <strong>Two ways in.</strong>
            <small>{dailyEasy ? "Easy words" : "Easy coming soon"} · {dailyHard ? "Hard tokens" : "Hard coming soon"}</small>
            <b aria-hidden="true">→</b>
          </button>
          <button className="token-menu-archive" onClick={onArchive} type="button">
            <span>Archive</span>
            <strong>Pick a response.</strong>
            <small>Published puzzles and your local Builder saves.</small>
            <b aria-hidden="true">→</b>
          </button>
        </div>
      </div>
    </main>
  );
}

function TokenDaily({ activePuzzleId, dailyEasy, dailyHard, onPlay, todayKey }: {
  activePuzzleId: string;
  dailyEasy: TokenDailySelection;
  dailyHard: TokenDailySelection;
  onPlay: (puzzle: TokenPuzzle) => void;
  todayKey: string;
}) {
  return (
    <main className="token-library" aria-label="TOKEN daily puzzles">
      <header className="token-library-heading">
        <p>Daily response · {todayKey}</p>
        <h2>Two ways to predict.</h2>
        <span>Easy uses readable words. Hard leaves the model’s raw token boundaries visible.</span>
      </header>
      <div className="token-library-grid">
        {([dailyEasy, dailyHard] as const).map((daily) => daily ? (
          <TokenArchiveCard
            active={daily.puzzle.id === activePuzzleId}
            entry={{
              origin: daily.origin,
              puzzle: daily.puzzle,
              summary: daily.summary,
              title: daily.title,
            }}
            key={daily.puzzle.id}
            label={daily.puzzle.difficulty === "easy" ? "Today · Easy" : "Today · Hard"}
            onPlay={onPlay}
          />
        ) : null)}
      </div>
    </main>
  );
}

function TokenArchive({ activePuzzleId, entries, onPlay, onRemove }: {
  activePuzzleId: string;
  entries: readonly TokenArchiveEntry[];
  onPlay: (puzzle: TokenPuzzle) => void;
  onRemove: (puzzleId: string) => void;
}) {
  const easy = entries.filter((entry) => entry.puzzle.difficulty === "easy");
  const hard = entries.filter((entry) => entry.puzzle.difficulty === "hard");
  return (
    <main className="token-library token-archive" aria-label="TOKEN archive">
      <header className="token-library-heading">
        <p>Archive</p>
        <h2>Frozen responses.</h2>
        <span>Published fixtures stay separate from work you save from the local Builder.</span>
      </header>
      <section className="token-archive-section">
        <header><p>Easy · readable words</p><span>{easy.length} {easy.length === 1 ? "puzzle" : "puzzles"}</span></header>
        <div className="token-library-grid">
          {easy.map((entry) => (
            <TokenArchiveCard active={entry.puzzle.id === activePuzzleId} entry={entry} key={entry.puzzle.id} label={entry.origin === "local" ? "Local Builder" : "Edition"} onPlay={onPlay} onRemove={onRemove} />
          ))}
        </div>
      </section>
      <section className="token-archive-section">
        <header><p>Hard · raw tokens</p><span>{hard.length} {hard.length === 1 ? "puzzle" : "puzzles"}</span></header>
        <div className="token-library-grid">
          {hard.map((entry) => (
            <TokenArchiveCard active={entry.puzzle.id === activePuzzleId} entry={entry} key={entry.puzzle.id} label={entry.origin === "local" ? "Local Builder" : "Edition"} onPlay={onPlay} onRemove={onRemove} />
          ))}
        </div>
      </section>
    </main>
  );
}

function TokenArchiveCard({ active, entry, label, onPlay, onRemove }: {
  active: boolean;
  entry: TokenArchiveEntry;
  label: string;
  onPlay: (puzzle: TokenPuzzle) => void;
  onRemove?: (puzzleId: string) => void;
}) {
  return (
    <article className={"token-archive-card" + (active ? " is-active" : "")}>
      <p>{label}</p>
      <h3>{entry.title}</h3>
      <span>{entry.summary}</span>
      <footer>
        <small>{entry.puzzle.stops.length} predictions · {entry.puzzle.difficulty}</small>
        <div>
          {entry.origin === "local" && onRemove && <button className="token-archive-remove" onClick={() => onRemove(entry.puzzle.id)} type="button">Remove</button>}
          <button onClick={() => onPlay(entry.puzzle)} type="button">{active ? "Play again" : "Play"} <b aria-hidden="true">→</b></button>
        </div>
      </footer>
    </article>
  );
}

function TokenHow({ onPlay }: { onPlay: () => void }) {
  return (
    <main className="token-how" aria-label="How to play TOKEN">
      <article>
        <header><p>How it works</p><h2>Predict the machine.</h2></header>
        <ol>
          <li><b>01</b><span><strong>Read the frozen response</strong><small>TOKEN streams an authored model response a character at a time.</small></span></li>
          <li><b>02</b><span><strong>Predict its next token</strong><small>When the cursor stops, type the next unit and press Enter. Builder drafts can use readable words or raw model-token pieces.</small></span></li>
          <li><b>03</b><span><strong>See how close you were</strong><small>The top token is worth 100. Stored alternatives can earn partial credit.</small></span></li>
        </ol>
        <footer><p>You are predicting the machine, not writing the response.</p><button onClick={onPlay} type="button">Start predicting <span aria-hidden="true">→</span></button></footer>
      </article>
    </main>
  );
}

function TokenBuilder({ onPlayDraft, onSaveToArchive }: {
  onPlayDraft: (draft: TokenPuzzle) => void;
  onSaveToArchive: (puzzle: TokenPuzzle, title: string, dailyDate: string | null) => void;
}) {
  const [prompt, setPrompt] = useState("Explain why a helpful machine should make its reasoning feel understandable rather than magical.");
  const [authoringNotes, setAuthoringNotes] = useState("Maximum five sentences.");
  const [settings, setSettings] = useState<BuilderSettings>(() => normalizeBuilderSettings(TOKEN_BUILDER_DEFAULTS));
  const [draft, setDraft] = useState<TokenDraft | null>(null);
  const [difficulty, setDifficulty] = useState<TokenDifficulty>("easy");
  const [selectedStopIds, setSelectedStopIds] = useState<Set<string>>(() => new Set());
  const [inspectedStopId, setInspectedStopId] = useState<string | null>(null);
  const [archiveTitle, setArchiveTitle] = useState("");
  const [dailyDate, setDailyDate] = useState("");
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validated = validateBuilderPrompt(prompt);
    if (!validated.valid) {
      setError(validated.reason);
      return;
    }
    const notes = validateAuthoringNotes(authoringNotes);
    if (!notes.valid) {
      setError(notes.reason);
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const response = await fetch("/api/token/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authoringNotes: notes.notes, prompt: validated.prompt, ...settings }),
      });
      const payload = await response.json() as GeneratedTokenPayload & { error?: string };
      if (!response.ok || !payload.responseText || !Array.isArray(payload.tokenLogprobs)) {
        throw new Error(payload.error || "The Builder could not prepare a draft.");
      }
      const nextDraft = createTokenDraftFromGeneration({
        authoringNotes: notes.notes,
        id: `local-${Date.now()}`,
        model: payload.model,
        prompt: validated.prompt,
        responseText: payload.responseText,
        tokenLogprobs: payload.tokenLogprobs,
      });
      setDraft(nextDraft);
      setDifficulty("easy");
      setSelectedStopIds(new Set());
      setInspectedStopId(null);
      setArchiveTitle(defaultArchiveTitle(nextDraft.prompt));
      setDailyDate("");
      setArchiveMessage(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Builder could not prepare a draft.");
    } finally {
      setIsGenerating(false);
    }
  }

  function downloadDraft() {
    if (!draft) return;
    const exportDraft = createTokenBuilderExport({ difficulty, draft, selectedStopIds });
    const blob = new Blob([JSON.stringify(exportDraft, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${draft.id}.token-draft.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function switchDifficulty(nextDifficulty: TokenDifficulty) {
    setDifficulty(nextDifficulty);
    setSelectedStopIds(new Set());
    setInspectedStopId(null);
  }

  function saveToArchive() {
    if (!playableDraft) return;
    onSaveToArchive(playableDraft, archiveTitle, dailyDate || null);
    setArchiveMessage(dailyDate
      ? "Saved locally and scheduled as this browser’s " + difficulty + " Daily for " + dailyDate + "."
      : "Saved locally. It is now available in Archive, but it will not replace a Daily puzzle.");
  }

  function toggleStop(id: string) {
    const isSelected = selectedStopIds.has(id);
    setSelectedStopIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setInspectedStopId(isSelected ? null : id);
  }

  const playableDraft = draft
    ? createPlayablePuzzleFromDraft({ difficulty, draft, selectedStopIds })
    : null;
  const selectionUnits: BuilderSelectionUnit[] = !draft
    ? []
    : difficulty === "easy"
      ? draft.words.map((word) => {
        const preview = createPlayablePuzzleFromDraft({ difficulty, draft, selectedStopIds: [word.id] }).stops[0];
        const source = draft.rawTokens[word.sourceTokenIndexes[0]];
        return {
          candidateCount: preview?.candidates.length ?? 0,
          id: word.id,
          label: word.text,
          rank: source ? modelChoiceRank(source) : null,
          selectable: word.selectable,
          status: word.easyStatus,
          title: word.easyStatus === "fragmented"
            ? "Split across model tokens. Use Hard mode to inspect it."
            : word.easyStatus === "not-word"
              ? "Punctuation cannot be an Easy-mode stop."
              : undefined,
        };
      })
      : draft.rawTokens.map((token) => {
        const preview = createPlayablePuzzleFromDraft({ difficulty, draft, selectedStopIds: [token.id] }).stops[0];
        return {
          candidateCount: preview?.candidates.length ?? 0,
          id: token.id,
          label: formatRawModelToken(token.token),
          rank: modelChoiceRank(token),
          selectable: Boolean(token.token.trim()),
          status: "raw",
          title: token.token || "Whitespace token",
        };
      });
  const canPlayDraft = Boolean(playableDraft?.stops.length);
  const inspectedStop = draft && inspectedStopId
    ? createPlayablePuzzleFromDraft({ difficulty, draft, selectedStopIds: [inspectedStopId] }).stops[0] ?? null
    : null;
  const inspectedRawToken = !draft || !inspectedStopId
    ? null
    : difficulty === "easy"
      ? draft.rawTokens[draft.words.find((word) => word.id === inspectedStopId)?.sourceTokenIndexes[0] ?? -1] ?? null
      : draft.rawTokens.find((token) => token.id === inspectedStopId) ?? null;
  const inspectedWord = difficulty === "easy" && draft && inspectedStopId
    ? draft.words.find((word) => word.id === inspectedStopId) ?? null
    : null;

  return (
    <main className="token-builder" aria-label="TOKEN Builder">
      <header className="token-builder-heading">
        <p>Local authoring</p>
        <h2>Make a frozen response.</h2>
        <span>Generate a small playtest, inspect the captured alternatives, then run it in TOKEN before anything becomes a fixture.</span>
      </header>

      <form className="token-builder-form" onSubmit={generate}>
        <label className="token-builder-prompt">
          <span>Player prompt</span>
          <textarea maxLength={1200} onChange={(event) => setPrompt(event.target.value)} value={prompt} />
        </label>
        <label className="token-builder-prompt token-builder-private-notes">
          <span>Private authoring constraints <i>never shown in the game</i></span>
          <textarea maxLength={1200} onChange={(event) => setAuthoringNotes(event.target.value)} placeholder="Maximum five sentences. Concrete examples. No jargon." value={authoringNotes} />
        </label>
        <div className="token-builder-controls">
          <label>
            <span>Model</span>
            <output>{TOKEN_BUILDER_DEFAULTS.model}</output>
          </label>
          <label>
            <span>Response budget</span>
            <input max="512" min="96" onChange={(event) => setSettings((current) => ({ ...current, maxOutputTokens: Number(event.target.value) }))} step="16" type="number" value={settings.maxOutputTokens} />
          </label>
          <label>
            <span>Variation</span>
            <input max="1.2" min="0" onChange={(event) => setSettings((current) => ({ ...current, temperature: Number(event.target.value) }))} step="0.05" type="number" value={settings.temperature} />
          </label>
          <button disabled={isGenerating} type="submit">{isGenerating ? "Generating…" : "Generate draft"}</button>
        </div>
        <p className="token-builder-note">Local-only: the key stays in the Worker. The full raw token stream and up to 10 alternatives per position remain in this draft until you download it.</p>
      </form>

      <p aria-live="polite" className="token-builder-message">{error || (isGenerating ? "Asking the model for a compact response and its likely next-token alternatives…" : "")}</p>

      {draft && (
        <section className="token-builder-draft" aria-label="Generated TOKEN draft">
          <header>
            <div><p>Generated response</p><h3>Choose your own stops.</h3></div>
            <span>{draft.rawTokens.length} model tokens captured</span>
          </header>
          <p className="token-builder-response">{draft.responseText}</p>
          <div className="token-builder-difficulty" aria-label="TOK difficulty">
            <div><b>Build for</b><span>{difficulty === "easy" ? "Readable words. Easy only allows words emitted as one model token." : "Raw model tokens, with spaces visibly marked. Experimental authoring mode."}</span></div>
            <div role="group" aria-label="Choose Builder difficulty">
              <button className={difficulty === "easy" ? "is-current" : ""} onClick={() => switchDifficulty("easy")} type="button">Easy · words</button>
              <button className={difficulty === "hard" ? "is-current" : ""} onClick={() => switchDifficulty("hard")} type="button">Hard · tokens</button>
            </div>
          </div>
          <div className="token-builder-selector">
            <header><span>Select every position where TOKEN should freeze.<small># shows the rank of the model’s chosen token.</small></span><b className={selectedStopIds.size === 10 ? "is-target" : selectedStopIds.size > 10 ? "is-over" : ""}>{selectedStopIds.size} / 10 selected</b></header>
            <div className={`token-builder-token-grid is-${difficulty}`}>
              {selectionUnits.map((unit) => {
                return (
                  <button
                    aria-pressed={selectedStopIds.has(unit.id)}
                    className={`${selectedStopIds.has(unit.id) ? "is-selected" : ""} is-${unit.status}`}
                    disabled={!unit.selectable}
                    key={unit.id}
                    onClick={() => toggleStop(unit.id)}
                    title={unit.title}
                    type="button"
                  ><span>{unit.label}</span>{unit.rank !== null && <i>#{unit.rank}</i>}{unit.selectable && unit.candidateCount === 0 && <em>exact</em>}</button>
                );
              })}
            </div>
            <p className="token-builder-selection-guide">Aim for 10 stops. Exact-only positions remain selectable so you can review them, but they have no captured alternatives.</p>
          </div>
          {inspectedStop && inspectedRawToken && (
            <section className="token-builder-selection-detail" aria-label={`Alternatives for ${inspectedStop.token}`}>
              <header>
                <div>
                  <p>Selected stop</p>
                  <h4>{inspectedStop.token}</h4>
                </div>
                <span>{difficulty === "easy" ? "player answer" : "raw token"}<b>{modelChoiceRank(inspectedRawToken) === null ? "rank unavailable" : `chosen #${modelChoiceRank(inspectedRawToken)}`}</b></span>
              </header>
              {difficulty === "easy" && inspectedWord && inspectedWord.text !== inspectedStop.token && (
                <p className="token-builder-selection-note">The response keeps <code>{inspectedWord.text}</code>; the player supplies <code>{inspectedStop.token}</code>.</p>
              )}
              <p className={`token-builder-selection-quality${inspectedStop.candidates.length === 0 ? " is-exact-only" : ""}`}>{inspectedStop.candidates.length === 0 ? "Exact only — no alternate player entries were captured here." : `${inspectedStop.candidates.length} alternate ${inspectedStop.candidates.length === 1 ? "entry" : "entries"} captured — review before publishing.`}</p>
              <p className="token-builder-selection-label">Top raw model alternatives at this position</p>
              <ol>
                {inspectedRawToken.alternatives.map((alternative, index) => (
                  <li className={alternative.token === inspectedRawToken.token ? "is-canonical" : ""} key={`${alternative.token}-${index}`}>
                    <code>{formatRawModelToken(alternative.token)}</code>
                    <span>{Number.isFinite(alternative.logprob) ? alternative.logprob.toFixed(2) : "—"}</span>
                  </li>
                ))}
                {!inspectedRawToken.alternatives.length && <li className="is-empty">No alternatives returned for this model token.</li>}
              </ol>
            </section>
          )}
          <details className="token-builder-raw-data">
            <summary>Inspect all {draft.rawTokens.length} raw model tokens and their top alternatives</summary>
            <ol>
              {draft.rawTokens.map((token) => (
                <li key={token.id}>
                  <div><b>{String(token.index + 1).padStart(3, "0")}</b><code>{formatRawModelToken(token.token)}</code><span>{Number.isFinite(token.logprob) ? token.logprob.toFixed(2) : "—"}</span></div>
                  <p>{token.alternatives.map((alternative) => `${formatRawModelToken(alternative.token)} ${Number.isFinite(alternative.logprob) ? alternative.logprob.toFixed(2) : "—"}`).join(" · ") || "No alternatives returned for this token."}</p>
                </li>
              ))}
            </ol>
          </details>
          <footer>
            <button className="token-builder-export" onClick={downloadDraft} type="button">Download fixture JSON</button>
            <label className="token-builder-save">
              <span>Archive title</span>
              <input maxLength={80} onChange={(event) => setArchiveTitle(event.target.value)} value={archiveTitle} />
            </label>
            <label className="token-builder-save token-builder-schedule">
              <span>Daily date <i>optional</i></span>
              <input onChange={(event) => setDailyDate(event.target.value)} type="date" value={dailyDate} />
            </label>
            <button disabled={!canPlayDraft} onClick={saveToArchive} type="button">Save to local archive</button>
            <button disabled={!canPlayDraft} onClick={() => playableDraft && onPlayDraft(playableDraft)} type="button">{canPlayDraft ? `Play ${playableDraft?.stops.length} selected stops` : "Select a stop to play"} <span aria-hidden="true">→</span></button>
          </footer>
          {archiveMessage && <p className="token-builder-archive-message" role="status">{archiveMessage}</p>}
        </section>
      )}
    </main>
  );
}

function Inspection({ onClose, stop, submission }: {
  onClose: () => void;
  stop: TokenPredictionStop;
  submission: TokenSubmission;
}) {
  const playerIsRanked = stop.candidates.some((candidate) => candidate.token.toLocaleLowerCase() === submission.tokenized[0]?.toLocaleLowerCase());
  return (
    <aside className="token-inspection" aria-label={`Inspection for ${stop.token}`}>
      <header><span>Prediction</span><button aria-label="Close inspection" onClick={onClose} type="button">×</button></header>
      <dl className="token-inspection-summary">
        <div><dt>Your entry</dt><dd>{submission.entry}</dd></div>
        <div><dt>Score</dt><dd className={`is-${submission.status}`}>{submission.score.toFixed(1)}</dd></div>
      </dl>
      <p className="token-tokenization">{submission.tokenized.join(" | ")}{submission.tokenized.length > 1 && <span>First token scored; divided by {submission.tokenized.length}.</span>}</p>
      <div className="token-inspection-canonical"><span>TOKEN</span><b>{stop.token}</b><em>100</em></div>
      <ol>
        {stop.candidates.slice(0, 5).map((candidate) => <li key={candidate.token}><span>{candidate.token}</span><b>{candidate.score}</b></li>)}
      </ol>
      {!playerIsRanked && !submission.exact && <p className="token-unranked-entry">Your first token was not among these stored alternatives.</p>}
    </aside>
  );
}
