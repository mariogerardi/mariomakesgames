"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import "./decode.css";
import { gameStorageKey } from "../../platform/storage";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import {
  decodeModePuzzleBank,
  selectDecodePuzzleFromPool,
  selectDailyDecodePuzzles,
  type DecodePuzzle,
} from "./catalog";
import { loadLocalStudioPublished, loadLocalStudioSlot } from "../../authoring/local-runtime";
import { decodePayloadEntries } from "../../authoring/decode-payload";
import {
  createDecodeState,
  decodeTimedWordLength,
  deriveDecodeFeedback,
  evaluateDecodeAttempt,
  formatDecodeTime,
  normalizeDecodeInput,
  tickDecodeClock,
  type DecodeFeedback,
  type DecodeMode,
  type DecodeState,
} from "./engine.mjs";

const PROGRESS_KEY = gameStorageKey("decode", "progress");
const MODES = ["timed", "daily-5", "zen"] as const;

type DecodeProgress = {
  bestTimedScore: number;
  bestDailySeconds: number | null;
  timedRuns: number;
  dailyCompletions: number;
};

const EMPTY_PROGRESS: DecodeProgress = {
  bestTimedScore: 0,
  bestDailySeconds: null,
  timedRuns: 0,
  dailyCompletions: 0,
};

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "") as Partial<DecodeProgress>;
    return {
      bestTimedScore: Math.max(0, Number(value.bestTimedScore) || 0),
      bestDailySeconds:
        value.bestDailySeconds === null || !Number.isFinite(Number(value.bestDailySeconds))
          ? null
          : Math.max(0, Number(value.bestDailySeconds)),
      timedRuns: Math.max(0, Number(value.timedRuns) || 0),
      dailyCompletions: Math.max(0, Number(value.dailyCompletions) || 0),
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function modeLabel(mode: DecodeMode) {
  if (mode === "timed") return "Timed";
  if (mode === "daily-5") return "Daily 5";
  return "Zen";
}

function feedbackLabel(feedback: DecodeFeedback) {
  if (feedback === "correct") return "same position";
  if (feedback === "present") return "different position";
  return "not used";
}

function DecodeTileWordmark({ compact = false }: { compact?: boolean }) {
  const states: DecodeFeedback[] = ["correct", "present", "correct", "present", "absent", "correct"];
  return (
    <div className={`decode-home-wordmark${compact ? " is-compact" : ""}`} aria-label="DECODE">
      {"DECODE".split("").map((letter, index) => (
        <span className={`is-${states[index]}`} key={`${letter}-${index}`}>{letter}</span>
      ))}
    </div>
  );
}

function useModalFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialRef: RefObject<HTMLButtonElement | null>,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.requestAnimationFrame(() => initialRef.current?.focus());
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [containerRef, initialRef]);
}

export function DecodeGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const recordedExpiry = useRef(false);
  const transitionTimer = useRef<number | null>(null);
  const [mode, setMode] = useState<DecodeMode>("timed");
  const [zenLength, setZenLength] = useState<4 | 5 | 6 | 7>(4);
  const [dailyPuzzles, setDailyPuzzles] = useState<DecodePuzzle[]>(() => [...selectDailyDecodePuzzles()]);
  const [localModePuzzles, setLocalModePuzzles] = useState<Record<"timed" | "zen", DecodePuzzle[]>>({ timed: [], zen: [] });
  const [run, setRun] = useState<DecodeState | null>(null);
  const [puzzle, setPuzzle] = useState<DecodePuzzle | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("Choose a mode, then begin your run.");
  const [tone, setTone] = useState<"neutral" | "error" | "success">("neutral");
  const [wrongPulse, setWrongPulse] = useState(false);
  const [correctPulse, setCorrectPulse] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [progress, setProgress] = useState<DecodeProgress>(EMPTY_PROGRESS);
  const active = run?.status === "playing";
  const interactive = Boolean(active && !transitioning);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setProgress(readProgress());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLocalStudioPublished("decode").then((documents) => {
      if (cancelled) return;
      const latest = [...documents.reduce((items, document) => {
        const current = items.get(document.id);
        if (!current || current.revision < document.revision) items.set(document.id, document);
        return items;
      }, new Map<string, (typeof documents)[number]>()).values()];
      const collect = (mode: "timed" | "zen") => latest.flatMap((document) => document.gameId === "decode" && document.payload.modes.includes(mode)
        ? decodePayloadEntries(document.payload).map((entry, index) => ({ id: `${document.id}-${index + 1}`, ...entry, ...(document.payload.theme ? { theme: document.payload.theme } : {}) }))
        : []);
      setLocalModePuzzles({ timed: collect("timed"), zen: collect("zen") });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    void loadLocalStudioSlot("decode", "daily-5", dateKey).then((documents) => {
      if (cancelled) return;
      const entries = documents.flatMap((document) => document.gameId === "decode" ? decodePayloadEntries(document.payload).map((entry, index) => ({
        id: `${document.id}-${index + 1}`,
        ...entry,
        ...(document.payload.theme ? { theme: document.payload.theme } : {}),
      })) : []);
      if (entries.length === 5) setDailyPuzzles(entries);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!active || transitioning || run?.mode === "zen") return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (!current || current.status !== "playing") return current;
        return tickDecodeClock(current);
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [active, transitioning, run?.mode]);

  useEffect(() => {
    if (!run || run.mode !== "timed" || run.status !== "expired" || recordedExpiry.current) return;
    recordedExpiry.current = true;
    queueMicrotask(() => {
      setFeedback(`Time. The answer was ${puzzle?.answer || "hidden"}.`);
      setTone("error");
      setProgress((stored) => {
        const updated = {
          ...stored,
          bestTimedScore: Math.max(stored.bestTimedScore, run.score),
          timedRuns: stored.timedRuns + 1,
        };
        localStorage.setItem(PROGRESS_KEY, JSON.stringify(updated));
        return updated;
      });
    });
  }, [run, puzzle?.answer]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
  }, []);

  const clueFeedback = puzzle ? deriveDecodeFeedback(puzzle.clueWord, puzzle.answer) : [];
  const clock =
    run?.mode === "timed"
      ? run.secondsRemaining
      : run?.mode === "daily-5"
        ? run.elapsedSeconds
        : mode === "timed"
          ? 20
          : 0;
  const urgent = run?.mode === "timed" && run.status === "playing" && run.secondsRemaining <= 5;

  function saveProgress(next: DecodeProgress) {
    setProgress(next);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  }

  function clearTransition() {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    setTransitioning(false);
    setCorrectPulse(false);
  }

  function focusInput() {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectModePuzzle(length: 4 | 5 | 6 | 7, selectedMode: "timed" | "zen") {
    const authored = localModePuzzles[selectedMode].filter((entry) => entry.answer.length === length);
    const combined = [...decodeModePuzzleBank(length), ...authored];
    return selectDecodePuzzleFromPool(combined)!;
  }

  function handleBegin(nextMode: DecodeMode = mode) {
    clearTransition();
    recordedExpiry.current = false;
    setMode(nextMode);
    const nextRun = createDecodeState(nextMode);
    const nextPuzzle = nextMode === "daily-5" ? dailyPuzzles[0] : selectModePuzzle(nextMode === "zen" ? zenLength : 4, nextMode);
    setRun(nextRun);
    setPuzzle(nextPuzzle);
    setAnswer("");
    setFeedback(
      nextMode === "timed"
        ? "Twenty seconds. Type your answer, then press Enter."
        : nextMode === "daily-5"
          ? "Five sea creatures. Type your answer, then press Enter."
          : "No clock. Take your time, then press Enter.",
    );
    setTone("neutral");
    focusInput();
  }

  function handleHome() {
    clearTransition();
    setRun(null);
    setPuzzle(null);
    setAnswer("");
    setTone("neutral");
    setFeedback("Choose a mode, then begin your run.");
  }

  function handleSubmit() {
    if (!run || !puzzle || !interactive) return;
    const result = evaluateDecodeAttempt({ state: run, answer: puzzle.answer, guess: answer });
    if (!result.correct) {
      setFeedback(
        answer.length === puzzle.answer.length
          ? "Signal mismatch. Re-read the colors and definition."
          : `Complete all ${puzzle.answer.length} letter cells.`,
      );
      setTone("error");
      setWrongPulse(true);
      window.setTimeout(() => setWrongPulse(false), 360);
      focusInput();
      return;
    }

    setRun(result.state);
    setTone("success");
    setCorrectPulse(true);
    if (result.complete) {
      const elapsed = result.state.mode === "daily-5" ? result.state.elapsedSeconds : 0;
      const nextProgress = {
        ...progress,
        bestDailySeconds:
          progress.bestDailySeconds === null ? elapsed : Math.min(progress.bestDailySeconds, elapsed),
        dailyCompletions: progress.dailyCompletions + 1,
      };
      saveProgress(nextProgress);
      setFeedback("Daily 5 decoded. Sea Creatures complete.");
      return;
    }

    const nextLength = result.nextWordLength;
    const nextPuzzle = result.state.mode === "daily-5"
      ? dailyPuzzles[result.state.dailyIndex]
      : selectModePuzzle(result.state.mode === "zen" ? zenLength : (nextLength ?? 4), result.state.mode);
    const levelChanged = result.state.mode === "timed" && nextLength !== puzzle.answer.length;
    setFeedback(
      result.state.mode === "daily-5"
        ? `${result.state.score} of 5 decoded.`
        : result.state.mode === "timed"
          ? levelChanged
            ? `Signal escalated — ${nextLength} letter words unlocked.`
            : "Correct. Clock restored to twenty seconds."
          : "Correct. Take your time with the next clue.",
    );
    setTransitioning(true);
    transitionTimer.current = window.setTimeout(() => {
      setPuzzle(nextPuzzle);
      setAnswer("");
      setCorrectPulse(false);
      setTransitioning(false);
      setTone("neutral");
      setFeedback(
        result.state.mode === "daily-5"
          ? `Puzzle ${result.state.dailyIndex + 1} of 5. Read both clues.`
          : result.state.mode === "timed"
            ? `${nextLength}-letter signal active.`
            : "New signal. No clock.",
      );
      focusInput();
      transitionTimer.current = null;
    }, 780);
  }

  return (
    <div className={`decode-game-card${urgent ? " is-urgent" : ""}`}>
      <GameLocalBar
        ariaLabel="DECODE"
        brand={<DecodeTileWordmark compact />}
        className="game-local-bar--decode"
        items={[
          { label: "Home", current: !run, onSelect: handleHome },
          ...MODES.map((item) => ({
            label: modeLabel(item),
            current: run?.mode === item,
            disabled: active && run?.mode !== item,
            onSelect: () => active ? undefined : handleBegin(item),
          })),
          { label: "How to play", current: showHow, onSelect: () => setShowHow(true) },
        ]}
        onHome={handleHome}
      />

      {puzzle && run ? (
        <>
          <main className="decode-play-layout">
            <section className="decode-signal-panel">
              <div className="decode-puzzle-meta">
                <RunRail clock={clock} onRestart={() => handleBegin()} progress={progress} run={run} urgent={urgent} />
                <span className="decode-signal-label">Clue word</span>
              </div>
              <ClueWord feedback={clueFeedback} puzzle={puzzle} />
              <div className={`decode-definition${correctPulse ? " is-correct" : ""}${wrongPulse ? " is-wrong" : ""}`}>
                <span>Definition</span>
                <p>“{puzzle.clue}”</p>
              </div>
              <div className="decode-answer-zone">
                <div><span>Answer</span></div>
                <button
                  aria-label="Focus answer entry"
                  className={`decode-answer-grid${wrongPulse ? " is-wrong" : ""}${correctPulse ? " is-correct" : ""}`}
                  disabled={!interactive}
                  onClick={() => inputRef.current?.focus()}
                  type="button"
                >
                  {Array.from({ length: puzzle.answer.length }, (_, index) => <span key={index}>{answer[index] || ""}</span>)}
                </button>
                <input
                  aria-describedby="decode-feedback"
                  aria-label="Decoded word"
                  autoComplete="off"
                  className="decode-native-input"
                  disabled={!interactive}
                  id="decode-answer"
                  maxLength={puzzle.answer.length}
                  onChange={(event) => setAnswer(normalizeDecodeInput(event.target.value, puzzle.answer.length))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  ref={inputRef}
                  spellCheck={false}
                  value={answer}
                />
              </div>
              <p className={`decode-feedback is-${tone}`} id="decode-feedback" aria-live="polite">{feedback}</p>
            </section>
          </main>
        </>
      ) : (
        <Welcome progress={progress} onMode={handleBegin} zenLength={zenLength} onZenLength={setZenLength} />
      )}

      <footer className="decode-footer">
        <button onClick={() => setShowHow(true)} type="button"><span>?</span> How to play</button>
      </footer>

      {run && puzzle && run.status !== "playing" && (
        <div className="decode-result-modal" role="dialog" aria-modal="true" aria-labelledby="decode-result-title">
          <ResultPanel dailyPuzzles={dailyPuzzles} mode={run.mode} onAgain={() => handleBegin()} onHome={handleHome} progress={progress} puzzle={puzzle} run={run} />
        </div>
      )}

      {showHow && <HowToPlay onClose={() => setShowHow(false)} />}
    </div>
  );
}

function RunRail({ clock, onRestart, progress, run, urgent }: {
  clock: number;
  onRestart: () => void;
  progress: DecodeProgress;
  run: DecodeState;
  urgent: boolean;
}) {
  const timed = run.mode === "timed";
  const zen = run.mode === "zen";
  if (zen) {
    return (
      <section className="decode-run-rail" aria-label="Zen run status">
        <div><span>Mode</span><strong>Zen</strong></div>
        <div><span>Solved</span><strong>{run.score}</strong></div>
        <div><span>Clock</span><strong>Off</strong></div>
        <button onClick={onRestart} type="button">new session</button>
      </section>
    );
  }
  const meter = timed ? Math.max(0, Math.min(100, (clock / 20) * 100)) : Math.min(100, (run.score / 5) * 100);
  return (
    <section className="decode-run-rail" aria-label="Run status">
      <div className={`decode-clock${urgent ? " is-urgent" : ""}`}>
        <span>{timed ? "Time" : "Elapsed"}</span>
        <strong>{formatDecodeTime(clock)}</strong>
        {timed && <i><span style={{ width: `${meter}%` }} /></i>}
      </div>
      <div className="decode-run-progress">
        <span>{timed ? "Score" : "Puzzle"}</span>
        <strong>{timed ? run.score : `${Math.min(run.dailyIndex + 1, 5)}/5`}</strong>
        {!timed && (
          <i className="decode-mini-daily-track" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <b className={index < run.dailyIndex ? "is-complete" : index === run.dailyIndex ? "is-current" : ""} key={index} />
            ))}
          </i>
        )}
      </div>
      <div><span>Best</span><strong>{timed ? progress.bestTimedScore : progress.bestDailySeconds === null ? "—" : formatDecodeTime(progress.bestDailySeconds)}</strong></div>
      <button onClick={onRestart} type="button">restart run</button>
    </section>
  );
}

function ClueWord({ feedback, puzzle }: { feedback: DecodeFeedback[]; puzzle: DecodePuzzle }) {
  return (
    <div className="decode-clue-word" aria-label="Colored letter clue">
      {puzzle.clueWord.split("").map((letter, index) => {
        const state = feedback[index];
        const marker = state === "correct" ? "●" : state === "present" ? "↔" : "×";
        return (
          <span aria-label={`${letter}, ${feedbackLabel(state)}`} className={`is-${state}`} key={`${letter}-${index}`}>
            <b>{letter}</b><small aria-hidden="true">{marker}</small>
          </span>
        );
      })}
    </div>
  );
}

function ResultPanel({ dailyPuzzles, mode, progress, puzzle, run, onAgain, onHome }: {
  dailyPuzzles: DecodePuzzle[];
  mode: DecodeMode;
  progress: DecodeProgress;
  puzzle: DecodePuzzle;
  run: DecodeState;
  onAgain: () => void;
  onHome: () => void;
}) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus(dialogRef, actionRef, onHome);

  if (mode === "timed" && run.mode === "timed") {
    const length = decodeTimedWordLength(run.score);
    return (
      <section className="decode-result is-expired" ref={dialogRef}>
        <span>Transmission ended</span><strong>{run.score}</strong><h2 id="decode-result-title">signals decoded</h2>
        <div><p><small>Tier reached</small><b>{length} letters</b></p><p><small>Personal best</small><b>{progress.bestTimedScore}</b></p></div>
        <p className="decode-final-answer">Final answer <b>{puzzle.answer}</b></p>
        <div className="decode-result-actions">
          <button onClick={onAgain} ref={actionRef} type="button">start a new run</button>
          <button onClick={onHome} type="button">back to menu</button>
        </div>
      </section>
    );
  }
  return (
    <section className="decode-result" ref={dialogRef}>
      <span>Sequence decoded</span><strong>{run.mode === "daily-5" ? formatDecodeTime(run.elapsedSeconds) : "0:00"}</strong><h2 id="decode-result-title">{dailyPuzzles.every((entry) => entry.theme && entry.theme === dailyPuzzles[0]?.theme) ? dailyPuzzles[0]?.theme : "Daily 5"}</h2>
      <div className="decode-result-answers">{dailyPuzzles.map((entry) => <b key={entry.id}>{entry.answer}</b>)}</div>
      <p className="decode-final-answer">Best time <b>{progress.bestDailySeconds === null ? "--" : formatDecodeTime(progress.bestDailySeconds)}</b></p>
      <div className="decode-result-actions">
        <button onClick={onAgain} ref={actionRef} type="button">decode again</button>
        <button onClick={onHome} type="button">back to menu</button>
      </div>
    </section>
  );
}

function Welcome({ progress, onMode, zenLength, onZenLength }: {
  progress: DecodeProgress;
  onMode: (mode: DecodeMode) => void;
  zenLength: 4 | 5 | 6 | 7;
  onZenLength: (length: 4 | 5 | 6 | 7) => void;
}) {
  return (
    <main className="decode-welcome">
      <section className="decode-welcome-copy">
        <DecodeTileWordmark />
        <h1>Two clues. <em>One answer.</em></h1>
      </section>
      <section className="decode-mode-cards" aria-label="Choose a game mode">
        <button onClick={() => onMode("daily-5")} type="button">
          <div className="decode-mode-copy"><strong>Daily 5</strong><p>Five puzzles against the clock.</p></div>
          <span className="decode-mode-best"><small>best</small><b>{progress.bestDailySeconds === null ? "--" : formatDecodeTime(progress.bestDailySeconds)}</b></span>
          <i aria-hidden="true">↗</i>
        </button>
        <button onClick={() => onMode("timed")} type="button">
          <div className="decode-mode-copy"><strong>Timed</strong><p>Twenty seconds per answer.</p></div>
          <span className="decode-mode-best"><small>best</small><b>{progress.bestTimedScore}</b></span>
          <i aria-hidden="true">↗</i>
        </button>
        <button onClick={() => onMode("zen")} type="button">
          <div className="decode-mode-copy"><strong>Zen</strong><p>No clock. A quiet stream of signals.</p></div>
          <span className="decode-mode-best decode-zen-length"><small>length</small><b>{zenLength}</b></span>
          <i aria-hidden="true">↗</i>
        </button>
        <div className="decode-zen-selector" aria-label="Zen word length" role="group">
          <span>Zen length</span>
          {([4, 5, 6, 7] as const).map((length) => <button aria-pressed={zenLength === length} key={length} onClick={() => onZenLength(length)} type="button">{length}</button>)}
        </div>
      </section>
    </main>
  );
}

function HowToPlay({ onClose }: { onClose: () => void }) {
  const example = deriveDecodeFeedback("PLACE", "CLAMP");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus(dialogRef, closeRef, onClose);
  return (
    <div className="decode-how-modal" role="dialog" aria-modal="true" aria-labelledby="decode-how-title">
      <section ref={dialogRef}>
        <header><h2 id="decode-how-title">How to play</h2><button onClick={onClose} ref={closeRef} type="button" aria-label="Close instructions">×</button></header>
        <p className="decode-how-intro">Find the answer that matches both clues. The colored clue word shows which letters carry over; the definition tells you what the answer means. Your answer is always the same length as the clue word.</p>
        <div className="decode-how-example-section">
          <span className="decode-how-example-label">Example</span>
          <div className="decode-how-example">
            <div className="decode-how-example-flow">
              <div className="decode-how-clues">
                <div className="decode-clue-word">{"PLACE".split("").map((letter, index) => {
                  const state = example[index];
                  return <i className={`is-${state}`} key={index}><b>{letter}</b><small>{state === "correct" ? "●" : state === "present" ? "↔" : "×"}</small></i>;
                })}</div>
                <p>“fastening tool”</p>
              </div>
              <i className="decode-how-arrow" aria-hidden="true">→</i>
              <div className="decode-how-answer" aria-label="Correct answer, CLAMP">
                {"CLAMP".split("").map((letter) => <span key={letter}><b>{letter}</b><small aria-hidden="true">●</small></span>)}
              </div>
            </div>
          </div>
          <div className="decode-how-rules">
            <article><i className="is-correct">●</i><div><b>Same position</b><p>Green letters stay in this exact spot.</p></div></article>
            <article><i className="is-present">↔</i><div><b>Different position</b><p>Blue letters appear elsewhere in the answer.</p></div></article>
            <article><i className="is-absent">×</i><div><b>Not used</b><p>Gray letters have no remaining match in the answer.</p></div></article>
          </div>
          <p className="decode-how-entry-note">Use both signals, then type your answer and press <kbd>Enter</kbd> to submit.</p>
        </div>
      </section>
    </div>
  );
}
