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
  deriveDecodeFeedback,
  evaluateDecodeAttempt,
  formatDecodeTime,
  normalizeDecodeInput,
  tickDecodeClock,
  type DecodeMode,
  type DecodeState,
} from "./engine.mjs";

const PROGRESS_KEY = gameStorageKey("decode", "progress");
const KEYBOARD = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

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
    const value = JSON.parse(
      localStorage.getItem(PROGRESS_KEY) || "",
    ) as Partial<DecodeProgress>;
    return {
      bestTimedScore: Math.max(0, Number(value.bestTimedScore) || 0),
      bestDailySeconds:
        value.bestDailySeconds === null ||
        !Number.isFinite(Number(value.bestDailySeconds))
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

export function DecodeGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const recordedExpiry = useRef(false);
  const [mode, setMode] = useState<DecodeMode>("timed");
  const [run, setRun] = useState<DecodeState | null>(null);
  const [puzzle, setPuzzle] = useState<DecodePuzzle | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(
    "Choose a mode, then begin your run.",
  );
  const [tone, setTone] = useState<"neutral" | "error" | "success">("neutral");
  const [wrongPulse, setWrongPulse] = useState(false);
  const [progress, setProgress] = useState<DecodeProgress>(EMPTY_PROGRESS);
  const active = run?.status === "playing";

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
    if (!active) return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (!current || current.status !== "playing") return current;
        return tickDecodeClock(current);
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (
      !run ||
      run.mode !== "timed" ||
      run.status !== "expired" ||
      recordedExpiry.current
    ) {
      return;
    }
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

  const clueFeedback = puzzle
    ? deriveDecodeFeedback(puzzle.clueWord, puzzle.answer)
    : [];
  const answerLength = puzzle?.answer.length || (mode === "timed" ? 4 : 4);
  const clock =
    run?.mode === "timed"
      ? run.secondsRemaining
      : run?.mode === "daily-5"
        ? run.elapsedSeconds
        : mode === "timed"
          ? 20
          : 0;

  function saveProgress(next: DecodeProgress) {
    setProgress(next);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  }

  function handleBegin() {
    recordedExpiry.current = false;
    const nextRun = createDecodeState(mode);
    const nextPuzzle =
      mode === "timed"
        ? selectTimedDecodePuzzle(4)
        : decodeDailyPuzzles[0];
    setRun(nextRun);
    setPuzzle(nextPuzzle);
    setAnswer("");
    setFeedback(
      mode === "timed"
        ? "Twenty seconds. Decode the word."
        : "Five sea creatures. Take the time you need.",
    );
    setTone("neutral");
    queueMicrotask(() => inputRef.current?.focus());
  }

  function handleMode(nextMode: DecodeMode) {
    if (active) return;
    setMode(nextMode);
    setRun(null);
    setPuzzle(null);
    setAnswer("");
    setFeedback(
      nextMode === "timed"
        ? "Solve quickly. The word length rises every ten points."
        : "Solve the original five-puzzle Sea Creatures set.",
    );
    setTone("neutral");
  }

  function handleSubmit() {
    if (!run || !puzzle || run.status !== "playing") return;
    const result = evaluateDecodeAttempt({
      state: run,
      answer: puzzle.answer,
      guess: answer,
    });
    if (!result.correct) {
      setFeedback(
        answer.length === puzzle.answer.length
          ? "That isn’t the answer. Use both clues and try again."
          : `Enter all ${puzzle.answer.length} letters.`,
      );
      setTone("error");
      setWrongPulse(true);
      window.setTimeout(() => setWrongPulse(false), 320);
      return;
    }

    setRun(result.state);
    setAnswer("");
    setTone("success");
    if (result.complete) {
      const elapsed =
        result.state.mode === "daily-5"
          ? result.state.elapsedSeconds
          : 0;
      const nextProgress = {
        ...progress,
        bestDailySeconds:
          progress.bestDailySeconds === null
            ? elapsed
            : Math.min(progress.bestDailySeconds, elapsed),
        dailyCompletions: progress.dailyCompletions + 1,
      };
      saveProgress(nextProgress);
      setFeedback("Daily 5 complete.");
      return;
    }

    if (result.state.mode === "daily-5") {
      setPuzzle(decodeDailyPuzzles[result.state.dailyIndex]);
      setFeedback(`${result.state.score} of 5 decoded. Next word.`);
    } else if (result.nextWordLength) {
      setPuzzle(selectTimedDecodePuzzle(result.nextWordLength));
      setFeedback(
        result.state.score % 10 === 0
          ? `Level up — now ${result.nextWordLength} letters.`
          : "Correct. Twenty seconds reset.",
      );
    }
    queueMicrotask(() => inputRef.current?.focus());
  }

  function handleKey(key: string) {
    if (!active) return;
    if (key === "ENTER") {
      handleSubmit();
    } else if (key === "⌫") {
      setAnswer((value) => value.slice(0, -1));
    } else {
      setAnswer((value) =>
        normalizeDecodeInput(`${value}${key}`, answerLength),
      );
    }
    inputRef.current?.focus();
  }

  return (
    <div className="decode-game-card">
      <header className="decode-header">
        <div>
          <p>DE<span>CODE</span></p>
          <small>Color, clue, transform</small>
        </div>
        <nav aria-label="DECODE modes">
          {(["timed", "daily-5"] as DecodeMode[]).map((item) => (
            <button
              className={mode === item ? "is-current" : ""}
              disabled={active}
              key={item}
              onClick={() => handleMode(item)}
              type="button"
            >
              {modeLabel(item)}
            </button>
          ))}
        </nav>
      </header>

      <section className="decode-scoreboard" aria-label="Run status">
        <div>
          <span>{run?.mode === "daily-5" ? "Elapsed" : "Time"}</span>
          <strong>{formatDecodeTime(clock)}</strong>
        </div>
        <button onClick={handleBegin} type="button">
          {run ? "Reset" : "Begin"}
        </button>
        <div>
          <span>{run?.mode === "daily-5" ? "Puzzle" : "Score"}</span>
          <strong>
            {run?.mode === "daily-5"
              ? `${Math.min(run.dailyIndex + 1, 5)}/5`
              : run?.score || 0}
          </strong>
        </div>
      </section>

      {puzzle ? (
        <section className="decode-board">
          <div className="decode-clue-word" aria-label="Colored letter clue">
            {puzzle.clueWord.split("").map((letter, index) => (
              <span
                className={`is-${clueFeedback[index]}`}
                key={`${letter}-${index}`}
              >
                {letter}
              </span>
            ))}
          </div>
          <div className="decode-legend">
            <span><i className="is-correct" />Same spot</span>
            <span><i className="is-present" />Other spot</span>
            <span><i className="is-absent" />Not used</span>
          </div>
          <p className="decode-definition">“{puzzle.clue}”</p>

          <label className="decode-answer-label" htmlFor="decode-answer">
            Your answer
          </label>
          <button
            className={`decode-answer-grid${wrongPulse ? " is-wrong" : ""}`}
            disabled={!active}
            onClick={() => inputRef.current?.focus()}
            type="button"
          >
            {Array.from({ length: puzzle.answer.length }, (_, index) => (
              <span key={index}>{answer[index] || ""}</span>
            ))}
          </button>
          <input
            aria-describedby="decode-feedback"
            autoComplete="off"
            className="decode-native-input"
            disabled={!active}
            id="decode-answer"
            maxLength={puzzle.answer.length}
            onChange={(event) =>
              setAnswer(
                normalizeDecodeInput(event.target.value, puzzle.answer.length),
              )
            }
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

          <div className="decode-keyboard" aria-label="Letter keyboard">
            {KEYBOARD.map((row) => (
              <div key={row}>
                {row === "ZXCVBNM" && (
                  <button onClick={() => handleKey("ENTER")} type="button">
                    Enter
                  </button>
                )}
                {row.split("").map((key) => (
                  <button key={key} onClick={() => handleKey(key)} type="button">
                    {key}
                  </button>
                ))}
                {row === "ZXCVBNM" && (
                  <button onClick={() => handleKey("⌫")} type="button">
                    ⌫
                  </button>
                )}
              </div>
            ))}
          </div>
          <p
            className={`decode-feedback is-${tone}`}
            id="decode-feedback"
            aria-live="polite"
          >
            {feedback}
          </p>

          {run?.status === "expired" && (
            <div className="decode-result is-expired">
              <div>
                <span>Run complete</span>
                <strong>{run.score} decoded</strong>
                <small>The final answer was {puzzle.answer}.</small>
              </div>
              <button onClick={handleBegin} type="button">Play again</button>
            </div>
          )}
          {run?.status === "complete" && run.mode === "daily-5" && (
            <div className="decode-result">
              <div>
                <span>Sea Creatures complete</span>
                <strong>{formatDecodeTime(run.elapsedSeconds)}</strong>
                <small>FISH · SQUID · SHRIMP · OYSTER · LOBSTER</small>
              </div>
              <button onClick={handleBegin} type="button">Play again</button>
            </div>
          )}
        </section>
      ) : (
        <section className="decode-welcome">
          <p className="eyebrow">{modeLabel(mode)} mode</p>
          <h2>{mode === "timed" ? "Beat the clock." : "Decode all five."}</h2>
          <p>
            The colored word tells you which letters carry over. The written
            clue tells you what the answer means.
          </p>
          <button onClick={handleBegin} type="button">Begin {modeLabel(mode)}</button>
        </section>
      )}

      <footer className="decode-footer">
        <details>
          <summary>How to play</summary>
          <p>
            Green letters stay in the same spot. Blue letters appear elsewhere
            in the answer. Gray letters are not used. Enter the complete word
            described by the definition clue.
          </p>
        </details>
        <div>
          <span>Personal best</span>
          <strong>
            {mode === "timed"
              ? `${progress.bestTimedScore} decoded`
              : progress.bestDailySeconds === null
                ? "Not completed"
                : formatDecodeTime(progress.bestDailySeconds)}
          </strong>
        </div>
      </footer>
    </div>
  );
}
