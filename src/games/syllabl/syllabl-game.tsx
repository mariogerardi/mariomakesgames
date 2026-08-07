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
import { gameStorageKey } from "../../platform/storage";

const WORD_INFO_ENDPOINT =
  "https://fr9m4nzsu1.execute-api.us-east-1.amazonaws.com/wordinfo";
const THEME_KEY = gameStorageKey("syllabl", "theme");

const syllablThemes = [
  { id: "light", name: "Light", color: "#3490dc", background: "#e6e6e6" },
  { id: "dark", name: "Dark", color: "#4a90e2", background: "#121212" },
  { id: "forest", name: "Forest", color: "#2f855a", background: "#edf7ef" },
  { id: "lilac", name: "Lilac", color: "#b497bd", background: "#f7f2fa" },
  { id: "banana", name: "Banana", color: "#f7d354", background: "#4a3a1f" },
  { id: "garnet", name: "Garnet", color: "#b22222", background: "#1a0a0a" },
  { id: "fuchsia", name: "Fuchsia", color: "#ff2d95", background: "#fff0f7" },
  { id: "peachy", name: "Peachy", color: "#ff7e5f", background: "#fff7f0" },
] as const;

type SyllablTheme = (typeof syllablThemes)[number]["id"];
type SyllablView = "menu" | "daily" | "how-to" | "themes" | "stats" | "about";

function SyllablWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`syllabl-wordmark${compact ? " is-compact" : ""}`} aria-label="Syllabl">
      <span>sy</span><i aria-hidden="true">·</i><b>lla</b><i aria-hidden="true">·</i><span>bl</span>
    </span>
  );
}

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
  const [view, setView] = useState<SyllablView>("menu");
  const [theme, setTheme] = useState<SyllablTheme>("light");

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
      const storedTheme = localStorage.getItem(THEME_KEY);
      if (syllablThemes.some((choice) => choice.id === storedTheme)) {
        setTheme(storedTheme as SyllablTheme);
      }
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

  function chooseTheme(nextTheme: SyllablTheme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // Theme selection remains available when device storage is unavailable.
    }
  }

  function openView(nextView: SyllablView) {
    setView(nextView);
    setShareStatus("");
    if (nextView === "daily") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

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
  const pageTitle = {
    "how-to": "how to play",
    themes: "themes",
    stats: "statistics",
    about: "about",
  } as const;

  return (
    <section
      className="syllabl-game-card"
      data-syllabl-theme={theme}
      aria-label={view === "daily" ? "Daily Syllabl" : "Syllabl menu"}
    >
      {view === "menu" ? (
        <div className="syllabl-home">
          <div className="syllabl-menu-grid" aria-label="Syllabl menu">
            <button className="syllabl-menu-daily" onClick={() => openView("daily")}>
              <span>dai<i>·</i>ly mode</span>
              <small>today’s six-stage puzzle</small>
            </button>
            <button className="syllabl-menu-how" onClick={() => openView("how-to")}>
              <span>how to play</span>
              <small>learn the rules</small>
            </button>
            <button className="syllabl-menu-themes" onClick={() => openView("themes")}>
              <span>themes</span>
              <small>choose your colors</small>
            </button>
            <button className="syllabl-menu-stats" onClick={() => openView("stats")}>
              <span>sta<i>·</i>tis<i>·</i>tics</span>
              <small>today’s progress</small>
            </button>
            <h2 className="syllabl-home-wordmark"><SyllablWordmark /></h2>
            <button className="syllabl-menu-about" onClick={() => openView("about")}>
              <span>a<i>·</i>bout</span>
              <small>the story of the game</small>
            </button>
          </div>
          <p className="syllabl-home-date">Daily #{setup.dayNumber} · {setup.displayDate}</p>
        </div>
      ) : view === "daily" ? (
        <div className="syllabl-play">
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
            <button className="syllabl-back" onClick={() => openView("menu")} aria-label="Return to Syllabl menu">←</button>
            <SyllablWordmark compact />
            <div className="syllabl-daily-meta">
              <b>{session.currentStage} / 6</b>
              <span>Daily #{setup.dayNumber}</span>
            </div>
          </header>

          <main className="syllabl-play-stage">
            <section className="syllabl-play-primary" aria-label="Current challenge">
              <div className="syllabl-token-block">
                <span>your three letters</span>
                <strong aria-label={`Puzzle letters ${token}`}>{token}</strong>
              </div>

              {isComplete ? (
                <div className="syllabl-complete">
                  <p className="syllabl-complete-kicker">complete</p>
                  <h2>Six for six.</h2>
                  <p>You met every placement and syllable constraint in today’s puzzle.</p>
                  <button className="syllabl-share-button" onClick={handleShare}>
                    share result <span aria-hidden="true">↗</span>
                  </button>
                  <span className="syllabl-share-status" role="status">{shareStatus}</span>
                </div>
              ) : (
                <>
                  <div className="syllabl-current-rule" key={session.currentStage}>
                    <span>level {session.currentStage + 1} of 6</span>
                    <p>
                      enter a word that <strong>{placementCopy[activeConstraint.placementCode as keyof typeof placementCopy].verb} {token}</strong>
                      {" "}and has <strong>{activeConstraint.syllablesRequired} {activeConstraint.syllablesRequired === 1 ? "syllable" : "syllables"}</strong>
                    </p>
                  </div>

                  <form className="syllabl-entry" onSubmit={handleSubmit}>
                    <label htmlFor="syllabl-guess">enter your word</label>
                    <div>
                      <input
                        ref={inputRef}
                        id="syllabl-guess"
                        value={guess}
                        onChange={(event) => setGuess(event.target.value.replace(/[^a-z]/gi, ""))}
                        minLength={4}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="enter your word..."
                        disabled={isChecking}
                      />
                      <button disabled={isChecking || guess.length < 4} type="submit">
                        {isChecking ? "checking…" : "submit"}
                      </button>
                    </div>
                  </form>
                </>
              )}

              <p className={`syllabl-feedback is-${feedbackTone}`} aria-live="polite" role="status">{feedback}</p>
            </section>

            <aside className="syllabl-play-sidebar" aria-label="Today’s six levels">
              <header>
                <div>
                  <span>today’s puzzle</span>
                  <strong>{isComplete ? "complete" : `${6 - session.currentStage} to go`}</strong>
                </div>
                <b>{session.currentStage}<small>/6</small></b>
              </header>
              <ol className="syllabl-stage-list">
                {session.puzzle.inputsEnabled.map((placement, index) => {
                  const acceptedGuess = session.guesses[index];
                  const isCurrent = index === session.currentStage && !isComplete;
                  return (
                    <li className={acceptedGuess ? "is-done" : isCurrent ? "is-current" : ""} key={`${placement}-${index}`}>
                      <span className="syllabl-stage-index">{acceptedGuess ? "✓" : index + 1}</span>
                      <span className="syllabl-stage-rule">
                        <b>{placementCopy[placement as keyof typeof placementCopy].short}</b>
                        <small>{session.puzzle.syllablesRequired[index]} {session.puzzle.syllablesRequired[index] === 1 ? "syllable" : "syllables"}</small>
                      </span>
                      <em>{acceptedGuess ? acceptedGuess.syllableList.join("·") : isCurrent ? "now" : "—"}</em>
                    </li>
                  );
                })}
              </ol>
            </aside>
          </main>
        </div>
      ) : (
        <div className="syllabl-info-view">
          <header>
            <button className="syllabl-back" onClick={() => openView("menu")} aria-label="Return to Syllabl menu">←</button>
            <SyllablWordmark compact />
          </header>
          <article className="syllabl-info-card">
            <p className="syllabl-info-kicker">sy·lla·bl</p>
            <h2>{pageTitle[view]}</h2>

            {view === "how-to" ? (
              <div className="syllabl-prose">
                <p>Every puzzle is built around a fixed three-letter string that must appear in all six answers.</p>
                <div className="syllabl-rule-example"><strong>DRA</strong><span>dragon · hydra · bedraggled</span></div>
                <p>Each level tells you where the string belongs—at the beginning, at the end, anywhere inside, or at both ends—and exactly how many syllables the word needs.</p>
                <p>You have unlimited guesses, no timer, and no penalties. Complete all six levels to finish the daily puzzle.</p>
                <button className="syllabl-primary-action" onClick={() => openView("daily")}>play today’s puzzle</button>
              </div>
            ) : view === "themes" ? (
              <div className="syllabl-theme-grid" role="radiogroup" aria-label="Choose a Syllabl theme">
                {syllablThemes.map((choice) => (
                  <button
                    key={choice.id}
                    className={theme === choice.id ? "is-selected" : ""}
                    onClick={() => chooseTheme(choice.id)}
                    role="radio"
                    aria-checked={theme === choice.id}
                  >
                    <span style={{ background: choice.background }}><i style={{ background: choice.color }} /></span>
                    <b>{choice.name}</b>
                    <small>{theme === choice.id ? "selected" : "select"}</small>
                  </button>
                ))}
              </div>
            ) : view === "stats" ? (
              <div className="syllabl-stats">
                <div><strong>{session.currentStage}</strong><span>words found today</span></div>
                <div><strong>{isComplete ? "yes" : "not yet"}</strong><span>daily complete</span></div>
                <div><strong>{6 - session.currentStage}</strong><span>levels remaining</span></div>
                <button className="syllabl-primary-action" onClick={() => openView("daily")}>{isComplete ? "view today’s result" : "continue today’s puzzle"}</button>
              </div>
            ) : (
              <div className="syllabl-prose">
                <p>Syllabl is a daily word puzzle by Mario Gerardi about the small sounds hiding inside larger words.</p>
                <p>Find six words that satisfy changing placement and pronunciation constraints. Creativity matters, but completion is the only goal.</p>
                <p>This edition preserves the original game’s puzzle logic and playful visual identity inside the Games hub.</p>
                <button className="syllabl-primary-action" onClick={() => openView("daily")}>play Syllabl</button>
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
