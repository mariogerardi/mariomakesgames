"use client";

import { useEffect, useRef, useState } from "react";
import { gameStorageKey } from "../../platform/storage";
import {
  decodeDailyPuzzles,
  selectTimedDecodePuzzle,
  type DecodePuzzle,
} from "./catalog";
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
const KEYBOARD = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const MODES = ["timed", "daily-5"] as const;
const TIERS = [
  { length: 4, range: "0–9", label: "signal I" },
  { length: 5, range: "10–19", label: "signal II" },
  { length: 6, range: "20–29", label: "signal III" },
  { length: 7, range: "30+", label: "signal IV" },
] as const;

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
  return mode === "timed" ? "Timed" : "Daily 5";
}

function feedbackLabel(feedback: DecodeFeedback) {
  if (feedback === "correct") return "same position";
  if (feedback === "present") return "different position";
  return "not used";
}

function DecodeWordmark() {
  return (
    <div className="decode-wordmark" aria-label="Decode">
      <span>DE</span><strong>CODE</strong><i aria-hidden="true" />
    </div>
  );
}

export function DecodeGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const recordedExpiry = useRef(false);
  const transitionTimer = useRef<number | null>(null);
  const [mode, setMode] = useState<DecodeMode>("timed");
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
    if (!active || transitioning) return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (!current || current.status !== "playing") return current;
        return tickDecodeClock(current);
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [active, transitioning]);

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
  const answerLength = puzzle?.answer.length || 4;
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

  function handleBegin() {
    clearTransition();
    recordedExpiry.current = false;
    const nextRun = createDecodeState(mode);
    const nextPuzzle = mode === "timed" ? selectTimedDecodePuzzle(4) : decodeDailyPuzzles[0];
    setRun(nextRun);
    setPuzzle(nextPuzzle);
    setAnswer("");
    setFeedback(mode === "timed" ? "Twenty seconds. Read both signals." : "Five sea creatures. Take the time you need.");
    setTone("neutral");
    queueMicrotask(() => inputRef.current?.focus());
  }

  function handleMode(nextMode: DecodeMode) {
    if (active) return;
    clearTransition();
    setMode(nextMode);
    setRun(null);
    setPuzzle(null);
    setAnswer("");
    setFeedback(
      nextMode === "timed"
        ? "Solve quickly. Word length rises every ten points."
        : "Solve the original five-puzzle Sea Creatures sequence.",
    );
    setTone("neutral");
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
      ? decodeDailyPuzzles[result.state.dailyIndex]
      : selectTimedDecodePuzzle(nextLength!);
    const levelChanged = result.state.mode === "timed" && nextLength !== puzzle.answer.length;
    setFeedback(
      result.state.mode === "daily-5"
        ? `${result.state.score} of 5 decoded.`
        : levelChanged
          ? `Signal escalated — ${nextLength} letter words unlocked.`
          : "Correct. Clock restored to twenty seconds.",
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
          : `${nextLength}-letter signal active.`,
      );
      inputRef.current?.focus();
      transitionTimer.current = null;
    }, 540);
  }

  function handleKey(key: string) {
    if (!interactive) return;
    if (key === "ENTER") {
      handleSubmit();
    } else if (key === "⌫") {
      setAnswer((value) => value.slice(0, -1));
    } else {
      setAnswer((value) => normalizeDecodeInput(`${value}${key}`, answerLength));
    }
    inputRef.current?.focus();
  }

  return (
    <div className={`decode-game-card${urgent ? " is-urgent" : ""}`}>
      <header className="decode-header">
        <div>
          <DecodeWordmark />
          <small>color · clue · transform</small>
        </div>
        <nav aria-label="DECODE modes">
          {MODES.map((item) => (
            <button className={mode === item ? "is-current" : ""} disabled={active} key={item} onClick={() => handleMode(item)} type="button">
              {modeLabel(item)}
            </button>
          ))}
          <button className="decode-how-button" onClick={() => setShowHow(true)} type="button">How to play</button>
        </nav>
      </header>

      {puzzle && run ? (
        <>
          <RunRail clock={clock} mode={run.mode} progress={progress} run={run} urgent={urgent} />
          <main className="decode-play-layout">
            <section className="decode-signal-panel">
              <div className="decode-panel-heading">
                <span>01 / letter signal</span>
                <b>{puzzle.answer.length} characters</b>
              </div>
              <ClueWord feedback={clueFeedback} puzzle={puzzle} />
              <div className="decode-legend" aria-label="Color key">
                <span><i className="is-correct">●</i>Same spot</span>
                <span><i className="is-present">↔</i>Other spot</span>
                <span><i className="is-absent">×</i>Not used</span>
              </div>
              <div className={`decode-definition${correctPulse ? " is-correct" : ""}${wrongPulse ? " is-wrong" : ""}`}>
                <span>02 / meaning signal</span>
                <p>“{puzzle.clue}”</p>
              </div>
              <div className="decode-answer-zone">
                <div><span>03 / decoded word</span><small>{answer.length}/{puzzle.answer.length}</small></div>
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
            </section>

            <aside className="decode-console-panel">
              {run.status === "playing" ? (
                <>
                  {run.mode === "timed" ? <TierLadder score={run.score} /> : <DailyProgress run={run} />}
                  <Keyboard disabled={!interactive} onKey={handleKey} />
                  <button className="decode-submit" disabled={!interactive || answer.length !== puzzle.answer.length} onClick={handleSubmit} type="button">
                    <span>Decode</span><small>enter ↵</small>
                  </button>
                  <p className={`decode-feedback is-${tone}`} id="decode-feedback" aria-live="polite">{feedback}</p>
                  <button className="decode-reset" onClick={handleBegin} type="button">restart run</button>
                </>
              ) : (
                <ResultPanel mode={run.mode} progress={progress} puzzle={puzzle} run={run} onAgain={handleBegin} />
              )}
            </aside>
          </main>
        </>
      ) : (
        <Welcome mode={mode} progress={progress} onBegin={handleBegin} onHow={() => setShowHow(true)} onMode={handleMode} />
      )}

      <footer className="decode-footer">
        <button onClick={() => setShowHow(true)} type="button"><span>?</span> Read the decoding protocol</button>
        <div><span>Timed runs <b>{progress.timedRuns}</b></span><span>Daily completions <b>{progress.dailyCompletions}</b></span></div>
      </footer>

      {showHow && <HowToPlay onClose={() => setShowHow(false)} />}
    </div>
  );
}

function RunRail({ clock, mode, progress, run, urgent }: {
  clock: number;
  mode: DecodeMode;
  progress: DecodeProgress;
  run: DecodeState;
  urgent: boolean;
}) {
  const timed = run.mode === "timed";
  const meter = timed ? Math.max(0, Math.min(100, (clock / 20) * 100)) : Math.min(100, (run.score / 5) * 100);
  return (
    <section className="decode-run-rail" aria-label="Run status">
      <div><span>Mode</span><strong>{modeLabel(mode)}</strong></div>
      <div className={`decode-clock${urgent ? " is-urgent" : ""}`}>
        <span>{timed ? "Time remaining" : "Elapsed time"}</span>
        <strong>{formatDecodeTime(clock)}</strong>
        <i><span style={{ width: `${meter}%` }} /></i>
      </div>
      <div><span>{timed ? "Score" : "Puzzle"}</span><strong>{timed ? run.score : `${Math.min(run.dailyIndex + 1, 5)}/5`}</strong></div>
      <div><span>Personal best</span><strong>{timed ? `${progress.bestTimedScore} decoded` : progress.bestDailySeconds === null ? "No time yet" : formatDecodeTime(progress.bestDailySeconds)}</strong></div>
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

function TierLadder({ score }: { score: number }) {
  const currentLength = decodeTimedWordLength(score);
  const nextAt = score < 30 ? 10 - (score % 10) : null;
  return (
    <section className="decode-progress-card">
      <div className="decode-console-heading"><span>Difficulty signal</span><b>{currentLength} letters</b></div>
      <div className="decode-tier-ladder">
        {TIERS.map((tier) => {
          const current = tier.length === currentLength;
          const complete = tier.length < currentLength;
          return <div className={`${current ? "is-current" : ""}${complete ? " is-complete" : ""}`} key={tier.length}><i>{complete ? "✓" : tier.length}</i><span><b>{tier.label}</b><small>score {tier.range}</small></span></div>;
        })}
      </div>
      <p>{nextAt ? `${nextAt} more ${nextAt === 1 ? "solve" : "solves"} until the next word length.` : "Maximum signal length reached."}</p>
    </section>
  );
}

function DailyProgress({ run }: { run: Extract<DecodeState, { mode: "daily-5" }> }) {
  return (
    <section className="decode-progress-card">
      <div className="decode-console-heading"><span>Original sequence</span><b>Sea Creatures</b></div>
      <div className="decode-daily-track">
        {decodeDailyPuzzles.map((puzzle, index) => {
          const complete = index < run.dailyIndex || run.status === "complete";
          const current = index === run.dailyIndex && run.status === "playing";
          return <div className={`${complete ? "is-complete" : ""}${current ? " is-current" : ""}`} key={puzzle.id}><i>{complete ? "✓" : index + 1}</i><span><b>{complete ? puzzle.answer : `${puzzle.answer.length} letters`}</b><small>{current ? "decoding now" : complete ? "decoded" : "locked"}</small></span></div>;
        })}
      </div>
      <p>This is the original fixed five-puzzle set.</p>
    </section>
  );
}

function Keyboard({ disabled, onKey }: { disabled: boolean; onKey: (key: string) => void }) {
  return (
    <div className="decode-keyboard" aria-label="Letter keyboard">
      {KEYBOARD.map((row) => (
        <div key={row}>
          {row.split("").map((key) => <button disabled={disabled} key={key} onClick={() => onKey(key)} type="button">{key}</button>)}
          {row === "ZXCVBNM" && <button className="is-delete" disabled={disabled} onClick={() => onKey("⌫")} type="button" aria-label="Delete letter">⌫</button>}
        </div>
      ))}
    </div>
  );
}

function ResultPanel({ mode, progress, puzzle, run, onAgain }: {
  mode: DecodeMode;
  progress: DecodeProgress;
  puzzle: DecodePuzzle;
  run: DecodeState;
  onAgain: () => void;
}) {
  if (mode === "timed" && run.mode === "timed") {
    const length = decodeTimedWordLength(run.score);
    return (
      <section className="decode-result is-expired">
        <span>Transmission ended</span><strong>{run.score}</strong><h2>signals decoded</h2>
        <div><p><small>Tier reached</small><b>{length} letters</b></p><p><small>Personal best</small><b>{progress.bestTimedScore}</b></p></div>
        <p className="decode-final-answer">Final answer <b>{puzzle.answer}</b></p>
        <button onClick={onAgain} type="button">start a new run</button>
      </section>
    );
  }
  return (
    <section className="decode-result">
      <span>Sequence decoded</span><strong>{run.mode === "daily-5" ? formatDecodeTime(run.elapsedSeconds) : "0:00"}</strong><h2>Sea Creatures</h2>
      <div className="decode-result-answers">{decodeDailyPuzzles.map((entry) => <b key={entry.id}>{entry.answer}</b>)}</div>
      <p className="decode-final-answer">Best time <b>{progress.bestDailySeconds === null ? "--" : formatDecodeTime(progress.bestDailySeconds)}</b></p>
      <button onClick={onAgain} type="button">decode again</button>
    </section>
  );
}

function Welcome({ mode, progress, onBegin, onHow, onMode }: {
  mode: DecodeMode;
  progress: DecodeProgress;
  onBegin: () => void;
  onHow: () => void;
  onMode: (mode: DecodeMode) => void;
}) {
  return (
    <main className="decode-welcome">
      <section className="decode-welcome-copy">
        <span className="decode-kicker">Two signals. One answer.</span>
        <h1>Read the color.<br />Read the clue.<br /><em>Decode the word.</em></h1>
        <p>Transform one word into another using positional letter signals and a crossword-style definition.</p>
        <div><button onClick={onBegin} type="button">Begin {modeLabel(mode)}</button><button onClick={onHow} type="button">See an example</button></div>
      </section>
      <section className="decode-mode-cards" aria-label="Choose a game mode">
        <button className={mode === "timed" ? "is-current" : ""} onClick={() => onMode("timed")} type="button">
          <span>01</span><div><strong>Timed</strong><p>Twenty seconds per word. Length rises every ten solves.</p></div><b>{progress.bestTimedScore}<small>best score</small></b>
        </button>
        <button className={mode === "daily-5" ? "is-current" : ""} onClick={() => onMode("daily-5")} type="button">
          <span>02</span><div><strong>Daily 5</strong><p>The original fixed Sea Creatures sequence, against the clock.</p></div><b>{progress.bestDailySeconds === null ? "--" : formatDecodeTime(progress.bestDailySeconds)}<small>best time</small></b>
        </button>
        <div className="decode-mini-example">
          <span>Signal preview</span>
          <div>{"EXPANSE".split("").map((letter, index) => <i className={index === 0 || index === 1 || index === 6 ? "is-correct" : index === 2 || index === 3 ? "is-present" : "is-absent"} key={index}>{letter}</i>)}</div>
          <p>“instruction clarifier” <b>→ EXAMPLE</b></p>
        </div>
      </section>
    </main>
  );
}

function HowToPlay({ onClose }: { onClose: () => void }) {
  const example = deriveDecodeFeedback("EXPANSE", "EXAMPLE");
  return (
    <div className="decode-how-modal" role="dialog" aria-modal="true" aria-labelledby="decode-how-title">
      <section>
        <header><div><span>Decoding protocol</span><h2 id="decode-how-title">How to play</h2></div><button onClick={onClose} type="button" aria-label="Close instructions">×</button></header>
        <p className="decode-how-intro">Every puzzle sends two signals: a colored word showing how letters carry over, and a definition describing the answer.</p>
        <div className="decode-how-example">
          <span>Example signal</span>
          <div className="decode-clue-word">{"EXPANSE".split("").map((letter, index) => {
            const state = example[index];
            return <i className={`is-${state}`} key={index}><b>{letter}</b><small>{state === "correct" ? "●" : state === "present" ? "↔" : "×"}</small></i>;
          })}</div>
          <p>“instruction clarifier”</p>
          <strong>EXAMPLE</strong>
        </div>
        <div className="decode-how-rules">
          <article><i className="is-correct">●</i><div><b>Same position</b><p>Green letters remain at this exact index.</p></div></article>
          <article><i className="is-present">↔</i><div><b>Different position</b><p>Blue letters appear elsewhere in the answer.</p></div></article>
          <article><i className="is-absent">×</i><div><b>Not used</b><p>Gray letters have no unmatched copy in the answer.</p></div></article>
        </div>
        <button className="decode-how-close" onClick={onClose} type="button">ready to decode</button>
      </section>
    </div>
  );
}
