"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./syllabl.css";
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
import { GameLocalBar } from "../../app-shell/game-local-bar";

const WORD_INFO_ENDPOINT =
  "https://fr9m4nzsu1.execute-api.us-east-1.amazonaws.com/wordinfo";
const THEME_KEY = gameStorageKey("syllabl", "theme");
const INITIAL_FEEDBACK = "let the puzzle com·mence.";

const syllablThemes = [
  { id: "light", name: "light", color: "#3490dc", background: "#e6e6e6", surface: "#fff", text: "#333" },
  { id: "dark", name: "dark", color: "#4a90e2", background: "#121212", surface: "#1e1e1e", text: "#eee" },
  { id: "forest", name: "forest", color: "#2f855a", background: "#edf7ef", surface: "#d7f0da", text: "#1c3b29" },
  { id: "lilac", name: "lilac", color: "#b497bd", background: "#f7f2fa", surface: "#f2e7f5", text: "#3f2a47" },
  { id: "banana", name: "banana", color: "#f7d354", background: "#4a3a1f", surface: "#3a2c1a", text: "#fff" },
  { id: "garnet", name: "garnet", color: "#b22222", background: "#1a0a0a", surface: "#2a0f0f", text: "#f8e6c1" },
  { id: "fuchsia", name: "fuchsia", color: "#ff2d95", background: "#fff0f7", surface: "#ffe2ef", text: "#3d1a2f" },
  { id: "peachy", name: "peachy", color: "#ff7e5f", background: "#fff7f0", surface: "#ffeedd", text: "#4d2e1f" },
] as const;

type SyllablTheme = (typeof syllablThemes)[number]["id"];
type SyllablView = "menu" | "daily" | "how-to" | "themes" | "about";

const syllablViews: SyllablView[] = ["menu", "daily", "how-to", "themes", "about"];

function viewFromUrl() {
  if (typeof window === "undefined") return "menu";
  const candidate = new URL(window.location.href).searchParams.get("view");
  return syllablViews.includes(candidate as SyllablView)
    ? (candidate as SyllablView)
    : "menu";
}

function SyllablWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`syllabl-wordmark${compact ? " is-compact" : ""}`} aria-label="syllabl">
      <span>sy</span><i aria-hidden="true">·</i><b>lla</b><i aria-hidden="true">·</i><span>bl</span>
    </span>
  );
}

const placementCopy = {
  1: { clause: "ends with", short: "ends with" },
  2: { clause: "begins with", short: "begins with" },
  3: { clause: "contains", short: "contains" },
  4: { clause: "begins and ends with", short: "begins & ends" },
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
    return `${word || "that"} is too short. words must be at least four letters.`;
  }
  if (reason === "placement") {
    return "that word does not place the puzzle string where this stage requires.";
  }
  if (reason === "word-invalid") {
    return info?.error === "word-service-unavailable"
      ? "the dictionary is taking a breather. please try again."
      : `${word} could not be found in the dictionary.`;
  }
  if (reason === "syllable-count") {
    const requiredLabel = `${requiredSyllables} ${
      requiredSyllables === 1 ? "syllable" : "syllables"
    }`;
    const countedSyllables = info?.syllableList?.length ?? info?.syllables;
    const countedLabel = countedSyllables
      ? `${countedSyllables}${info?.syllableList?.length ? ` (${info.syllableList.join("·")})` : ""}`
      : "a different number";
    return `your word must contain ${requiredLabel}. we asked for ${requiredSyllables}, and you gave a word with ${countedLabel}.`;
  }
  return "that guess could not be accepted. please try another word.";
}

function shareText(session: SyllablSession, dayNumber: number) {
  const dots = session.guesses.map(() => "●").join("");
  return [
    `syllabl #${dayNumber}`,
    `completed ${session.currentStage}/6`,
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
  const [feedback, setFeedback] = useState(INITIAL_FEEDBACK);
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [view, setView] = useState<SyllablView>("menu");
  const [isViewLeaving, setIsViewLeaving] = useState(false);
  const [theme, setTheme] = useState<SyllablTheme>("light");
  const [animatedTheme, setAnimatedTheme] = useState<SyllablTheme | null>(null);
  const viewTransitionRef = useRef<number | null>(null);
  const themeAnimationRef = useRef<number | null>(null);

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
      setFeedback(INITIAL_FEEDBACK);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (viewTransitionRef.current !== null) {
        window.clearTimeout(viewTransitionRef.current);
      }
      if (themeAnimationRef.current !== null) {
        window.clearTimeout(themeAnimationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const syncView = () => {
      setView(viewFromUrl());
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    if (view === "daily") {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [view]);

  const constraint = session ? getSyllablConstraint(session) : null;
  const isComplete = session?.status === "complete";

  function chooseTheme(nextTheme: SyllablTheme) {
    setTheme(nextTheme);
    setAnimatedTheme(nextTheme);
    if (themeAnimationRef.current !== null) {
      window.clearTimeout(themeAnimationRef.current);
    }
    themeAnimationRef.current = window.setTimeout(() => {
      setAnimatedTheme(null);
      themeAnimationRef.current = null;
    }, 420);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // Theme selection remains available when device storage is unavailable.
    }
  }

  function openView(nextView: SyllablView) {
    if (nextView === view || isViewLeaving) return;

    setShareStatus("");
    const url = new URL(window.location.href);
    if (nextView === "menu") url.searchParams.delete("view");
    else url.searchParams.set("view", nextView);
    window.history.pushState({}, "", url);
    setIsViewLeaving(true);
    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 280;
    viewTransitionRef.current = window.setTimeout(() => {
      setView(nextView);
      setIsViewLeaving(false);
      viewTransitionRef.current = null;
      window.scrollTo({ top: 0, behavior: "instant" });
    }, transitionDuration);
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
        `your word must ${placementCopy[constraint.placementCode as keyof typeof placementCopy].clause} ${session.puzzle.puzzleLetters.toLowerCase()}.`,
      );
      setFeedbackTone("error");
      return;
    }

    setIsChecking(true);
    setFeedback(`checking ${candidate}…`);

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
        ? "six for six. today’s syllabl is complete."
        : `${result.guess.syllableList.join("·")} works — level ${
            result.session.currentStage + 1
          } is ready.`,
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleShare() {
    if (!session || !setup) return;
    const text = shareText(session, setup.dayNumber);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShareStatus("shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus("result copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setShareStatus("result copied.");
      } catch {
        setShareStatus("couldn’t share this time.");
      }
    }
  }

  if (!session || !setup) {
    return (
      <div className="syllabl-game-card syllabl-game-loading" aria-busy="true">
        preparing today’s puzzle…
      </div>
    );
  }

  if (!isComplete && !constraint) {
    return (
      <div className="syllabl-game-card syllabl-game-loading" role="alert">
        today’s puzzle could not be prepared. please refresh and try again.
      </div>
    );
  }

  const token = session.puzzle.puzzleLetters.toLowerCase();
  const activeConstraint = constraint!;
  const completedStages = session.currentStage;
  const dailyAction = isComplete
    ? "review today’s result"
    : completedStages > 0
      ? `continue at level ${completedStages + 1}`
      : "start today’s puzzle";

  return (
    <section
      className="syllabl-game-card"
      data-syllabl-theme={theme}
      aria-label={
        view === "daily"
          ? "daily syllabl"
          : view === "menu"
            ? "syllabl menu"
            : `syllabl ${view.replace("-", " ")}`
      }
    >
      <GameLocalBar
        ariaLabel="syllabl"
        brand={<SyllablWordmark compact />}
        className="game-local-bar--syllabl"
        items={[
          { label: "menu", current: view === "menu", onSelect: () => openView("menu") },
          { label: "daily", current: view === "daily", onSelect: () => openView("daily") },
          { label: "how to play", current: view === "how-to", onSelect: () => openView("how-to") },
          { label: "themes", current: view === "themes", onSelect: () => openView("themes") },
          { label: "about", current: view === "about", onSelect: () => openView("about") },
        ]}
        onHome={() => openView("menu")}
      />
      <div
        className={`syllabl-view-frame${isViewLeaving ? " is-leaving" : ""}`}
        data-syllabl-view={view}
        key={view}
      >
      {view === "menu" ? (
        <div className="syllabl-home">
          <div className="syllabl-home-inner">
            <header className="syllabl-home-heading">
              <p>one string · six words</p>
              <h2 className="syllabl-home-wordmark"><SyllablWordmark /></h2>
              <span>a daily word puzzle about the sounds hiding inside words.</span>
            </header>
            <div className="syllabl-menu-grid" aria-label="syllabl menu">
              <button className="syllabl-menu-daily" onClick={() => openView("daily")} type="button">
                <span className="syllabl-menu-eyebrow">daily #{setup.dayNumber}</span>
                <strong>dai<i>·</i>ly puzzle</strong>
                <small>{setup.displayDate} · six levels</small>
                <span className="syllabl-menu-progress" aria-label={`${completedStages} of 6 levels complete`}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <i className={index < completedStages ? "is-done" : index === completedStages && !isComplete ? "is-current" : ""} key={index} />
                  ))}
                </span>
                <span className="syllabl-menu-action">{dailyAction}<b aria-hidden="true">→</b></span>
              </button>
              <div className="syllabl-menu-secondary">
                <button className="syllabl-menu-how" onClick={() => openView("how-to")} type="button">
                  <span>how to play</span><small>learn the three rules</small><b aria-hidden="true">→</b>
                </button>
                <button className="syllabl-menu-themes" onClick={() => openView("themes")} type="button">
                  <span>themes</span><small>eight ways to play</small><b aria-hidden="true">→</b>
                </button>
                <button className="syllabl-menu-about" onClick={() => openView("about")} type="button">
                  <span>a<i>·</i>bout</span><small>the story of syllabl</small><b aria-hidden="true">→</b>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : view === "daily" ? (
        <div className="syllabl-play">
          <div
            className="syllabl-step-progress"
            role="progressbar"
            aria-label="puzzle progress"
            aria-valuemin={0}
            aria-valuemax={6}
            aria-valuenow={session.currentStage}
          >
            <div className="syllabl-step-progress-track" aria-hidden="true">
              <span style={{ width: `${(completedStages / 6) * 100}%` }} />
            </div>
            {isComplete ? (
              <div className="syllabl-current-level-summary is-complete">
                <span>daily complete</span>
                <strong>6 of 6</strong>
              </div>
            ) : (
              <div className="syllabl-current-level-summary">
                <span>level {session.currentStage + 1} of 6</span>
                <strong>{placementCopy[activeConstraint.placementCode as keyof typeof placementCopy].short} {token}</strong>
                <small>{activeConstraint.syllablesRequired} {activeConstraint.syllablesRequired === 1 ? "syllable" : "syllables"}</small>
              </div>
            )}
          </div>

          <main className="syllabl-play-stage">
            <section className="syllabl-play-primary" aria-label="current challenge">
              <div className="syllabl-play-card">
                {!isComplete ? (
                  <header className="syllabl-round-meta">
                    <span>daily #{setup.dayNumber}</span>
                    <time dateTime={setup.dateKey}>{setup.displayDate}</time>
                  </header>
                ) : null}
                <div className="syllabl-token-row" aria-label={`puzzle letters ${token}`}>
                  <span className="syllabl-token-label">today’s letters</span>
                  <strong><span>{token}</span></strong>
                </div>

                {isComplete ? (
                  <div className="syllabl-complete">
                    <p className="syllabl-complete-kicker">today’s words</p>
                    <h2>six for six.</h2>
                    <p>you met every placement and syllable constraint.</p>
                    <ol className="syllabl-complete-answers" aria-label="accepted answers">
                      {session.guesses.map((acceptedGuess, index) => (
                        <li key={acceptedGuess.word}><span>{index + 1}</span><b>{acceptedGuess.syllableList.join("·")}</b></li>
                      ))}
                    </ol>
                    <button className="syllabl-share-button" onClick={handleShare} type="button">
                      share result <span aria-hidden="true">↗</span>
                    </button>
                    <span className="syllabl-share-status" role="status">{shareStatus}</span>
                  </div>
                ) : (
                  <>
                    <div className="syllabl-current-rule" key={session.currentStage}>
                      <p>
                        find a word that <strong>{placementCopy[activeConstraint.placementCode as keyof typeof placementCopy].clause} {token}</strong>
                        {" "}and has <strong>{activeConstraint.syllablesRequired} {activeConstraint.syllablesRequired === 1 ? "syllable" : "syllables"}</strong>.
                      </p>
                    </div>

                    <form className="syllabl-entry" onSubmit={handleSubmit}>
                      <label htmlFor="syllabl-guess">enter your word</label>
                      <div>
                        <input
                          ref={inputRef}
                          id="syllabl-guess"
                          value={guess}
                          onChange={(event) => {
                            setGuess(event.target.value.replace(/[^a-z]/gi, ""));
                          }}
                          minLength={4}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="enter your word…"
                          disabled={isChecking}
                        />
                        <button disabled={isChecking || guess.length < 4} type="submit">
                          {isChecking ? <><i className="syllabl-spinner" aria-hidden="true" />checking</> : "submit"}
                        </button>
                      </div>
                      <p className="syllabl-entry-help"><span>4+ letters</span><span>press enter or submit</span></p>
                    </form>
                  </>
                )}

                {!isComplete ? (
                  <p className={`syllabl-feedback is-${feedbackTone}`} aria-live="polite" role="status">
                    <span>{feedback}</span>
                    {feedbackTone === "error" ? <button onClick={() => inputRef.current?.focus()} type="button">try again</button> : null}
                  </p>
                ) : null}
              </div>
            </section>

          </main>
        </div>
      ) : (
        <div className="syllabl-info-view">
          <article className="syllabl-info-card">
            {view === "how-to" ? (
              <>
                <header className="syllabl-info-hero syllabl-info-hero--compact">
                  <p className="syllabl-info-kicker">one answer · three checks</p>
                  <h2>how to play</h2>
                  <span>find six words that fit the letters, their placement, and the syllable count.</span>
                </header>
                <div className="syllabl-how-layout">
                  <section className="syllabl-worked-example" aria-label="Worked Syllabl example">
                    <header><span>example level</span><b>4 of 6</b></header>
                    <div className="syllabl-example-token"><small>today’s letters</small><strong>PRO</strong></div>
                    <p>find a word that <b>contains PRO</b> and has <b>5 syllables</b>.</p>
                    <div className="syllabl-example-entry"><strong>procrastinator</strong><span>✓ valid</span></div>
                    <div className="syllabl-example-syllables" aria-label="pro cras ti na tor: five syllables">
                      {['pro', 'cras', 'ti', 'na', 'tor'].map((part) => <span key={part}>{part}</span>)}
                    </div>
                  </section>
                  <ol className="syllabl-how-steps">
                    <li><b>1</b><span><strong>find the letters</strong><small>Every answer includes the day’s three-letter string.</small></span></li>
                    <li><b>2</b><span><strong>place them correctly</strong><small>The level may ask you to begin, end, contain, or bookend the word with it.</small></span></li>
                    <li><b>3</b><span><strong>match the sound</strong><small>Your answer needs exactly the number of syllables shown.</small></span></li>
                  </ol>
                </div>
                <div className="syllabl-stage-story">
                  <span><strong>one puzzle, six answers</strong><small>each level changes the placement and syllable rule.</small></span>
                  <ol aria-label="six Syllabl levels">
                    {[1, 2, 3, 4, 5, 6].map((level) => <li className={level === 4 ? "is-example" : ""} key={level}>{level}</li>)}
                  </ol>
                </div>
                <footer className="syllabl-info-footer">
                  <p><b>unlimited guesses</b><b>no timer</b><b>no penalties</b></p>
                  <button className="syllabl-primary-action" onClick={() => openView("daily")} type="button">play today’s puzzle <span aria-hidden="true">→</span></button>
                </footer>
              </>
            ) : view === "themes" ? (
              <>
                <header className="syllabl-info-hero">
                  <p className="syllabl-info-kicker">make it yours</p>
                  <h2>themes</h2>
                  <span>choose a palette. your preference stays on this device.</span>
                </header>
                <div className="syllabl-theme-grid" role="radiogroup" aria-label="choose a syllabl theme">
                  {syllablThemes.map((choice) => (
                    <button
                      key={choice.id}
                      className={`${theme === choice.id ? "is-selected" : ""}${animatedTheme === choice.id ? " is-just-selected" : ""}`.trim()}
                      onClick={() => chooseTheme(choice.id)}
                      role="radio"
                      aria-checked={theme === choice.id}
                      type="button"
                    >
                      <span className="syllabl-theme-preview" style={{ background: choice.background, color: choice.text }}>
                        <i style={{ background: choice.surface }}><b style={{ background: choice.color }} /><em style={{ background: choice.text }} /></i>
                      </span>
                      <span className="syllabl-theme-name"><b>{choice.name}</b><small>{theme === choice.id ? "✓ current" : "choose"}</small></span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <header className="syllabl-info-hero syllabl-info-hero--compact syllabl-about-hero">
                  <p className="syllabl-info-kicker">small sounds · big possibilities</p>
                  <h2>about syllabl</h2>
                  <p>I built syllabl around a simple obsession: how many different words can grow around the same small sound?</p>
                </header>
                <div className="syllabl-about-layout">
                  <section className="syllabl-about-story">
                    <span>the game</span>
                    <h3>follow the string wherever it goes.</h3>
                    <p>One three-letter string can turn up at the beginning of a word, at the end, somewhere in the middle, or on both sides. Syllabl turns that word hunt into six compact daily challenges.</p>
                    <p>The point is not to optimize a score. It is to satisfy every rule, finish the set, and occasionally find a word you did not expect.</p>
                  </section>
                  <aside className="syllabl-about-facts" aria-label="Syllabl at a glance">
                    <div><b>1</b><span>new puzzle<br />each day</span></div>
                    <div><b>6</b><span>words complete<br />a run</span></div>
                    <div><b>∞</b><span>guesses and<br />no timer</span></div>
                  </aside>
                </div>
                <div className="syllabl-about-loop">
                  <span><b>letters</b><small>spot the string</small></span><i>→</i>
                  <span><b>placement</b><small>fit the level</small></span><i>→</i>
                  <span><b>syllables</b><small>count the sounds</small></span><i>→</i>
                  <span><b>next word</b><small>do it five more times</small></span>
                </div>
                <footer className="syllabl-info-footer">
                  <button className="syllabl-primary-action" onClick={() => openView("daily")} type="button">play syllabl <span aria-hidden="true">→</span></button>
                </footer>
              </>
            )}
          </article>
        </div>
      )}
      </div>
    </section>
  );
}
