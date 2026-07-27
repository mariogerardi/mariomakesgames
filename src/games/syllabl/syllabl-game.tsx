"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createSyllablSession,
  evaluateSyllablAttempt,
  getSyllablConstraint,
  hydrateSyllablSession,
  serializeSyllablSession,
  syllablDailyStorageKey,
  validateSyllablPlacement,
  type SyllablSession,
} from "./engine.mjs";
import { syllablPuzzles } from "./catalog";
import { selectDailySyllablPuzzle } from "./puzzle-loader.mjs";
import {
  createSyllablWordValidator,
  type SyllablWordInfo,
} from "./word-validator.mjs";

const WORD_INFO_ENDPOINT =
  "https://fr9m4nzsu1.execute-api.us-east-1.amazonaws.com/wordinfo";

const placementCopy = {
  1: { verb: "end with", short: "Ends with" },
  2: { verb: "begin with", short: "Begins with" },
  3: { verb: "fully contain", short: "Contains" },
  4: { verb: "begin and end with", short: "Begins & ends" },
} as const;

type DailySetup = {
  dateKey: string;
  dayNumber: number;
  displayDate: string;
};

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredSession(dateKey: string) {
  const current = localStorage.getItem(syllablDailyStorageKey(dateKey));
  const legacy = localStorage.getItem(`syllabl_daily_${dateKey}`);
  const raw = current ?? legacy;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function rejectionMessage(
  reason: string,
  word: string,
  info: SyllablWordInfo | null,
  requiredSyllables: number,
) {
  if (reason === "too-short") {
    return `${word || "That"} is too short. Words must be at least four letters.`;
  }
  if (reason === "placement") {
    return "That word does not place the puzzle string where this stage requires.";
  }
  if (reason === "word-invalid") {
    return info?.error === "word-service-unavailable"
      ? "The dictionary is taking a breather. Please try again."
      : `${word} could not be found in the dictionary.`;
  }
  if (reason === "syllable-count") {
    const heard = info?.syllableList?.length
      ? ` We read it as ${info.syllableList.join("·")}.`
      : "";
    return `That word needs ${requiredSyllables} ${
      requiredSyllables === 1 ? "syllable" : "syllables"
    }.${heard}`;
  }
  return "That guess could not be accepted. Please try another word.";
}

function shareText(session: SyllablSession, dayNumber: number) {
  const dots = session.guesses.map(() => "●").join("");
  return [
    `Syllabl #${dayNumber}`,
    `Completed ${session.currentStage}/6`,
    dots,
    window.location.href,
  ].join("\n");
}

export function SyllablGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const validator = useMemo(
    () =>
      createSyllablWordValidator({
        fetcher: fetch,
        endpoint: WORD_INFO_ENDPOINT,
      }),
    [],
  );
  const [setup, setSetup] = useState<DailySetup | null>(null);
  const [session, setSession] = useState<SyllablSession | null>(null);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(
    "Find a word for each of today’s six constraints.",
  );
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const dateKey = localDateKey();
      const selection = selectDailySyllablPuzzle(syllablPuzzles, dateKey);
      const nextSetup = {
        dateKey,
        dayNumber: selection.dayOffset + 1,
        displayDate: new Intl.DateTimeFormat(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date()),
      };
      const stored = readStoredSession(dateKey);
      const nextSession = stored
        ? hydrateSyllablSession({
            stored,
            puzzle: selection.puzzle,
            puzzleDate: dateKey,
          })
        : createSyllablSession({
            puzzle: selection.puzzle,
            puzzleDate: dateKey,
          });

      setSetup(nextSetup);
      setSession(nextSession);
      setFeedback(
        nextSession.status === "complete"
          ? "Today’s Syllabl is complete."
          : nextSession.currentStage > 0
            ? `Welcome back. Stage ${nextSession.currentStage + 1} is ready.`
            : "Find a word for each of today’s six constraints.",
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const constraint = session ? getSyllablConstraint(session) : null;
  const isComplete = session?.status === "complete";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !constraint || isChecking || isComplete) return;

    const candidate = guess.trim().toLowerCase();
    setShareStatus("");
    setFeedbackTone("neutral");

    if (candidate.length < 4) {
      setFeedback(rejectionMessage("too-short", candidate, null, 0));
      setFeedbackTone("error");
      return;
    }
    if (
      !validateSyllablPlacement(
        candidate,
        session.puzzle.puzzleLetters,
        constraint.placementCode,
      )
    ) {
      setFeedback(
        rejectionMessage(
          "placement",
          candidate,
          null,
          constraint.syllablesRequired,
        ),
      );
      setFeedbackTone("error");
      return;
    }

    setIsChecking(true);
    setFeedback(`Checking ${candidate}…`);

    let wordInfo: SyllablWordInfo;
    try {
      wordInfo = await validator(candidate);
    } catch {
      wordInfo = {
        isValid: false,
        syllables: 0,
        syllableList: [],
        syllableParses: [],
        error: "word-service-unavailable",
      };
    }

    const result = evaluateSyllablAttempt({
      session,
      word: candidate,
      wordInfo,
    });
    setIsChecking(false);

    if (!result.accepted) {
      setFeedback(
        rejectionMessage(
          result.reason,
          candidate,
          wordInfo,
          constraint.syllablesRequired,
        ),
      );
      setFeedbackTone("error");
      inputRef.current?.focus();
      return;
    }

    setSession(result.session);
    try {
      localStorage.setItem(
        syllablDailyStorageKey(session.puzzleDate),
        JSON.stringify(serializeSyllablSession(result.session)),
      );
    } catch {
      // The game remains playable when device storage is unavailable.
    }
    setGuess("");
    setFeedbackTone("success");
    setFeedback(
      result.session.status === "complete"
        ? "Six for six. Today’s Syllabl is complete."
        : `${result.guess.syllableList.join("·")} works. On to stage ${
            result.session.currentStage + 1
          }.`,
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleShare() {
    if (!session || !setup) return;
    const text = shareText(session, setup.dayNumber);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShareStatus("Shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus("Result copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("Result copied.");
      } catch {
        setShareStatus("Couldn’t share this time.");
      }
    }
  }

  if (!session || !setup) {
    return (
      <div className="syllabl-game-card syllabl-game-loading" aria-busy="true">
        Preparing today’s puzzle…
      </div>
    );
  }

  if (!isComplete && !constraint) {
    return (
      <div className="syllabl-game-card syllabl-game-loading" role="alert">
        Today’s puzzle could not be prepared. Please refresh and try again.
      </div>
    );
  }

  const token = session.puzzle.puzzleLetters.toUpperCase();
  const activeConstraint = constraint!;

  return (
    <section className="syllabl-game-card" aria-label="Daily Syllabl">
      <div
        className="syllabl-progress"
        role="progressbar"
        aria-label="Puzzle progress"
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={session.currentStage}
      >
        <span style={{ width: `${(session.currentStage / 6) * 100}%` }} />
      </div>

      <header className="syllabl-game-header">
        <div>
          <p>Daily #{setup.dayNumber}</p>
          <time dateTime={setup.dateKey}>{setup.displayDate}</time>
        </div>
        <span className="syllabl-stage-count">
          {session.currentStage} / 6
        </span>
      </header>

      <div className="syllabl-token-block">
        <span>Your three letters</span>
        <strong aria-label={`Puzzle letters ${token}`}>{token}</strong>
      </div>

      {isComplete ? (
        <div className="syllabl-complete">
          <p className="syllabl-complete-kicker">Completed</p>
          <h2>Six words. One finished puzzle.</h2>
          <p>
            You met every placement and pronunciation constraint in today’s
            Syllabl.
          </p>
          <button className="syllabl-share-button" onClick={handleShare}>
            Share result <span aria-hidden="true">↗</span>
          </button>
          <span className="syllabl-share-status" role="status">
            {shareStatus}
          </span>
        </div>
      ) : (
        <>
          <div className="syllabl-current-rule">
            <span>Stage {session.currentStage + 1}</span>
            <p>
              Your word must{" "}
              <strong>
                {
                  placementCopy[
                    activeConstraint.placementCode as keyof typeof placementCopy
                  ].verb
                }{" "}
                {token}
              </strong>{" "}
              and contain{" "}
              <strong>
                {activeConstraint.syllablesRequired}{" "}
                {activeConstraint.syllablesRequired === 1
                  ? "syllable"
                  : "syllables"}
              </strong>
              .
            </p>
          </div>

          <form className="syllabl-entry" onSubmit={handleSubmit}>
            <label htmlFor="syllabl-guess">Your word</label>
            <div>
              <input
                ref={inputRef}
                id="syllabl-guess"
                value={guess}
                onChange={(event) =>
                  setGuess(event.target.value.replace(/[^a-z]/gi, ""))
                }
                minLength={4}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Type a word…"
                disabled={isChecking}
              />
              <button disabled={isChecking || guess.length < 4} type="submit">
                {isChecking ? "Checking…" : "Submit"}
              </button>
            </div>
          </form>
        </>
      )}

      <p
        className={`syllabl-feedback is-${feedbackTone}`}
        aria-live="polite"
        role="status"
      >
        {feedback}
      </p>

      <ol className="syllabl-stage-list" aria-label="Six puzzle stages">
        {session.puzzle.inputsEnabled.map((placement, index) => {
          const acceptedGuess = session.guesses[index];
          const isCurrent = index === session.currentStage && !isComplete;
          return (
            <li
              className={
                acceptedGuess ? "is-done" : isCurrent ? "is-current" : ""
              }
              key={`${placement}-${index}`}
            >
              <span className="syllabl-stage-index">
                {acceptedGuess ? "✓" : String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <b>
                  {
                    placementCopy[
                      placement as keyof typeof placementCopy
                    ].short
                  }
                </b>
                <small>
                  {session.puzzle.syllablesRequired[index]}{" "}
                  {session.puzzle.syllablesRequired[index] === 1
                    ? "syllable"
                    : "syllables"}
                </small>
              </span>
              <em>
                {acceptedGuess
                  ? acceptedGuess.syllableList.join("·")
                  : isCurrent
                    ? "Now"
                    : "Locked"}
              </em>
            </li>
          );
        })}
      </ol>

      <details className="syllabl-how-to">
        <summary>How to play</summary>
        <p>
          Find six dictionary words containing the three-letter puzzle string.
          Each stage changes where those letters must appear and how many
          syllables the word must have.
        </p>
        <p>
          You have unlimited guesses, no timer, and no penalties. If a word has
          more than one pronunciation, any pronunciation matching the stage is
          accepted. Finish all six stages to complete the daily puzzle.
        </p>
      </details>
    </section>
  );
}
