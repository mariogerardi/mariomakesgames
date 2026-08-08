"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { gameStorageKey } from "../../platform/storage";
import {
  expl41nArchiveMonths,
  legacyExpl41nDate,
  localDateKey,
  randomExpl41nPuzzle,
  selectExpl41nDailyPuzzle,
} from "./catalog";
import greetingsData from "./data/greetings.json";
import {
  applyExpl41nGuess,
  attemptsRemaining,
  createExpl41nSession,
  EXPL41N_CLUE_LIMIT,
  hydrateExpl41nSession,
  serializeExpl41nSession,
  validateExpl41nClue,
  validateExpl41nCustomWord,
  type Expl41nMode,
  type Expl41nPuzzle,
  type Expl41nSession,
} from "./engine.mjs";
import {
  expl41nMascotState,
  type Expl41nMascotState,
} from "./presentation.mjs";
import {
  createExpl41nServices,
  type Expl41nLeaderboardEntry,
} from "./services.mjs";

const DAILY_KEY = gameStorageKey("expl41n", "daily");
const PROGRESS_KEY = gameStorageKey("expl41n", "progress");
const USERNAME_KEY = gameStorageKey("expl41n", "username");
const SLEEP_DELAY = 30_000;
const EXPL41N_PRESENTATION = "galaxy-menu-v2";

type Expl41nView = "home" | "play" | "archive" | "custom" | "how";

type Expl41nProgress = {
  archiveBest: Record<string, number>;
  dailyBest: Record<string, number>;
};

type Expl41nGreetingData = {
  victoryMessages: string[];
  greetings: string[];
  shuffleGreetings: string[];
  customGreetings: string[];
  archiveGreetings: string[];
  loserGreetings: string[];
  winnerGreetings: string[];
};

const greetingLibrary = greetingsData as Expl41nGreetingData;
const retiredFeatureReference = /\b(settings?|themes?|achievements?|username)\b/i;

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createSession(
  puzzle: Expl41nPuzzle,
  mode: Expl41nMode,
  sessionDate: string,
) {
  return createExpl41nSession({ puzzle, mode, sessionDate });
}

function modeLabel(mode: Expl41nMode) {
  if (mode === "daily") return "Daily";
  if (mode === "shuffle") return "Shuffle";
  if (mode === "archive") return "Archive";
  return "Custom";
}

function cleanGreeting(value: string, word = "the word") {
  return value
    .replaceAll("{word}", word)
    .replace(/<br\s*\/?>(\s*)/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function randomGreeting(values: string[], word?: string) {
  const eligible = values.filter((value) => !retiredFeatureReference.test(value));
  const pool = eligible.length ? eligible : values;
  return cleanGreeting(pool[Math.floor(Math.random() * pool.length)] || "Ready when you are!", word);
}

function greetingForMode(mode: Expl41nMode, word?: string) {
  if (mode === "shuffle") return randomGreeting(greetingLibrary.shuffleGreetings, word);
  if (mode === "archive") return randomGreeting(greetingLibrary.archiveGreetings, word);
  if (mode === "custom") return randomGreeting(greetingLibrary.customGreetings, word);
  return randomGreeting(greetingLibrary.greetings, word);
}

function victoryMessage(characters: number) {
  const index = characters <= 5 ? 0 : characters <= 10 ? 1 : characters <= 15 ? 2 : characters <= 20 ? 3 : 4;
  return greetingLibrary.victoryMessages[index] || "Connection made!";
}

function Mascot({
  className = "",
  state,
}: {
  className?: string;
  state: Expl41nMascotState;
}) {
  return (
    <Image
      alt={`Expl41n connection guide is ${state}`}
      className={className}
      height={1254}
      key={state}
      onError={(event) => {
        if (!event.currentTarget.src.endsWith("/expl41n/mascot/idle.png")) {
          event.currentTarget.src = "/expl41n/mascot/idle.png";
        }
      }}
      priority={state === "idle"}
      src={`/expl41n/mascot/${state}.png`}
      unoptimized
      width={1254}
    />
  );
}

function Metric({
  color,
  label,
  progress,
  value,
}: {
  color: string;
  label: string;
  progress: number;
  value: string | number;
}) {
  return (
    <div className="expl41n-dial">
      <div
        aria-hidden="true"
        className="expl41n-dial-ring"
        style={{
          "--expl41n-dial-color": color,
          "--expl41n-dial-value": `${Math.max(0, Math.min(100, progress))}%`,
        } as React.CSSProperties}
      >
        <strong>{value}</strong>
      </div>
      <span>{label}</span>
    </div>
  );
}

export function Expl41nGame() {
  const services = useMemo(() => createExpl41nServices(), []);
  const [view, setView] = useState<Expl41nView>("home");
  const [session, setSession] = useState<Expl41nSession | null>(null);
  const [mode, setMode] = useState<Expl41nMode>("daily");
  const [clue, setClue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isSleepy, setIsSleepy] = useState(false);
  const [activityVersion, setActivityVersion] = useState(0);
  const [greeting, setGreeting] = useState("I’m your connection guide. You bring the clue; I’ll chase the word.");
  const [feedback, setFeedback] = useState("Give the AI one concise clue.");
  const [feedbackTone, setFeedbackTone] = useState<"neutral" | "error" | "success">("neutral");
  const [isFallbackDaily, setIsFallbackDaily] = useState(false);
  const [archiveMonth, setArchiveMonth] = useState(expl41nArchiveMonths[0]?.key || "");
  const [customWord, setCustomWord] = useState("");
  const [customFact, setCustomFact] = useState("");
  const [progress, setProgress] = useState<Expl41nProgress>({ archiveBest: {}, dailyBest: {} });
  const [username, setUsername] = useState("guest");
  const [leaderboard, setLeaderboard] = useState<Expl41nLeaderboardEntry[]>([]);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      const today = new Date();
      const { puzzle, isFallback } = selectExpl41nDailyPuzzle(today);
      const sessionDate = localDateKey(today);
      const stored = readJson<Record<string, unknown> | null>(DAILY_KEY, null);
      const restored = hydrateExpl41nSession({
        payload: stored,
        puzzle,
        mode: "daily",
        sessionDate,
      });
      const storedProgress = readJson<Expl41nProgress>(PROGRESS_KEY, {
        archiveBest: {},
        dailyBest: {},
      });
      const storedUsername =
        localStorage.getItem(USERNAME_KEY) ||
        `guest${Math.floor(10000 + Math.random() * 90000)}`;
      localStorage.setItem(USERNAME_KEY, storedUsername);
      setSession(restored);
      setProgress(storedProgress);
      setUsername(storedUsername);
      setIsFallbackDaily(isFallback);
      try {
        const entries = await services.leaderboard(storedUsername);
        if (!cancelled) setLeaderboard(entries.slice(0, 5));
      } catch {
        if (!cancelled) setLeaderboard([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  useEffect(() => {
    if (view !== "play" || !session || session.status !== "active" || isThinking) return;
    const timer = window.setTimeout(() => setIsSleepy(true), SLEEP_DELAY);
    return () => window.clearTimeout(timer);
  }, [activityVersion, isThinking, session, view]);

  const currentArchive = expl41nArchiveMonths.find((entry) => entry.key === archiveMonth);
  const latestAttempt = session?.attempts.at(-1);
  const confidence = latestAttempt?.confidence ?? 0;
  const searchSpace = latestAttempt?.searchSpace ?? 100;
  const remaining = session ? attemptsRemaining(session) : 5;
  const mascotState = expl41nMascotState({
    confidence,
    hasAttempt: Boolean(latestAttempt),
    isSleepy,
    isThinking,
    status: session?.status ?? "active",
  });

  function markActivity() {
    setIsSleepy(false);
    setActivityVersion((value) => value + 1);
  }

  function resetRound(nextMode: Expl41nMode, nextSession: Expl41nSession | null) {
    setMode(nextMode);
    setSession(nextSession);
    setClue("");
    setShareStatus("");
    setFeedback(nextMode === "custom" ? "Choose the secret word the AI should guess." : "Give the AI one concise clue.");
    setFeedbackTone("neutral");
    setGreeting(greetingForMode(nextMode, nextSession?.puzzle.word));
    markActivity();
  }

  function persistSession(next: Expl41nSession) {
    if (next.mode === "daily") writeJson(DAILY_KEY, serializeExpl41nSession(next));
  }

  function openHome() {
    setView("home");
    setGreeting("I’m your connection guide. You bring the clue; I’ll chase the word.");
    markActivity();
  }

  function openMode(nextMode: Expl41nMode) {
    if (nextMode === "archive") {
      setMode("archive");
      setView("archive");
      setGreeting(greetingForMode("archive"));
      markActivity();
      return;
    }
    if (nextMode === "custom") {
      resetRound("custom", null);
      setView("custom");
      return;
    }
    if (nextMode === "daily") {
      const today = new Date();
      const { puzzle, isFallback } = selectExpl41nDailyPuzzle(today);
      const restored = hydrateExpl41nSession({
        payload: readJson<Record<string, unknown> | null>(DAILY_KEY, null),
        puzzle,
        mode: "daily",
        sessionDate: localDateKey(today),
      });
      resetRound("daily", restored);
      setIsFallbackDaily(isFallback);
    } else {
      const daily = selectExpl41nDailyPuzzle().puzzle;
      const puzzle = randomExpl41nPuzzle(daily.word);
      resetRound("shuffle", createSession(puzzle, "shuffle", crypto.randomUUID()));
      setIsFallbackDaily(false);
    }
    setView("play");
  }

  function openArchivePuzzle(puzzle: Expl41nPuzzle) {
    const next = createSession(puzzle, "archive", puzzle.date);
    resetRound("archive", next);
    setFeedback("Archive games have unlimited attempts.");
    setView("play");
  }

  function openHow() {
    setView("how");
    setGreeting("One short clue. One curious AI. Make every character count.");
    markActivity();
  }

  function startCustom() {
    const validated = validateExpl41nCustomWord(customWord);
    if (!validated.valid) {
      setFeedback(validated.reason === "spaces" ? "Custom challenges must be a single word." : "Enter a custom challenge word first.");
      setFeedbackTone("error");
      return;
    }
    const puzzle: Expl41nPuzzle = {
      word: validated.word,
      date: "Custom challenge",
      funFact: customFact.trim() || "You made the connection.",
    };
    const next = createSession(puzzle, "custom", crypto.randomUUID());
    resetRound("custom", next);
    setFeedback("Custom games have unlimited attempts.");
    setView("play");
  }

  async function submitClue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.status !== "active" || isThinking) return;
    const validated = validateExpl41nClue(clue);
    if (!validated.valid) {
      setFeedback(validated.reason === "too-long" ? "Clues can use at most 25 characters." : "Enter a clue first.");
      setFeedbackTone("error");
      return;
    }

    markActivity();
    setIsThinking(true);
    setFeedback("The AI is connecting the dots…");
    setFeedbackTone("neutral");
    setShareStatus("");
    try {
      const response = await services.guess({
        clue: validated.clue,
        previousAIGuesses: session.attempts.map((attempt) => attempt.guess.toLowerCase()),
        previousClues: [
          ...session.attempts.map((attempt) => attempt.clue.toLowerCase()),
          validated.clue.toLowerCase(),
        ],
      });
      const result = applyExpl41nGuess(session, {
        clue: validated.clue,
        response,
        timestamp: new Date().toISOString(),
      });
      if (!result.accepted) return;
      const next = result.state;
      setSession(next);
      persistSession(next);
      setClue("");

      if (result.won && result.attempt) {
        const key = next.mode === "daily" ? next.sessionDate : next.puzzle.date;
        const field = next.mode === "daily" ? "dailyBest" : "archiveBest";
        const nextProgress = {
          ...progress,
          [field]: {
            ...progress[field],
            [key]: Math.min(progress[field][key] ?? Number.POSITIVE_INFINITY, result.attempt.characters),
          },
        };
        setProgress(nextProgress);
        writeJson(PROGRESS_KEY, nextProgress);
        setFeedback(`Solved with ${result.attempt.characters} character${result.attempt.characters === 1 ? "" : "s"}.`);
        setFeedbackTone("success");
        setGreeting(randomGreeting(greetingLibrary.winnerGreetings, next.puzzle.word));

        if (next.mode === "daily") {
          try {
            await services.submitScore({
              username,
              score: result.attempt.characters,
              clue: result.attempt.clue,
            });
            const entries = await services.leaderboard(username);
            setLeaderboard(entries.slice(0, 5));
          } catch {
            // A local win remains authoritative if the legacy board is unavailable.
          }
        }
      } else if (result.lost) {
        setFeedback("Five guesses, no connection. The word is revealed below.");
        setFeedbackTone("error");
        setGreeting(randomGreeting(greetingLibrary.loserGreetings, next.puzzle.word));
      } else {
        setFeedback("Not quite. Refine the clue and try again.");
        setFeedbackTone("neutral");
      }
    } catch {
      setFeedback("The AI could not answer. Your clue and attempt were not consumed.");
      setFeedbackTone("error");
    } finally {
      setIsThinking(false);
      markActivity();
    }
  }

  async function handleShare() {
    if (!session?.winningAttempt) return;
    const attempt = session.winningAttempt;
    const text = [
      `Expl41n · ${modeLabel(session.mode)}`,
      `Solved in ${attempt.characters} character${attempt.characters === 1 ? "" : "s"}`,
      `${session.attempts.length}/5 guesses`,
      window.location.href,
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Expl41n", text });
        setShareStatus("Shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus("Copied.");
      }
    } catch {
      setShareStatus("");
    }
  }

  function nextShuffle() {
    if (!session) return;
    const puzzle = randomExpl41nPuzzle(session.puzzle.word);
    resetRound("shuffle", createSession(puzzle, "shuffle", crypto.randomUUID()));
  }

  const navItems: Array<{ label: string; view: Expl41nView; action: () => void }> = [
    { label: "Home", view: "home", action: openHome },
    { label: "Daily", view: "play", action: () => openMode("daily") },
    { label: "Shuffle", view: "play", action: () => openMode("shuffle") },
    { label: "Archive", view: "archive", action: () => openMode("archive") },
    { label: "Custom", view: "custom", action: () => openMode("custom") },
    { label: "How", view: "how", action: openHow },
  ];

  const activeNav = view === "play" ? mode : view;

  return (
    <div className="expl41n-game-card" data-presentation={EXPL41N_PRESENTATION}>
      <header className="expl41n-local-header">
        <button className="expl41n-wordmark" onClick={openHome} type="button">
          Expl<span>41</span>n
        </button>
        <nav aria-label="Expl41n navigation">
          {navItems.map((item) => {
            const isCurrent = item.label.toLowerCase() === activeNav;
            return (
              <button className={isCurrent ? "is-current" : ""} key={item.label} onClick={item.action} type="button">
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="expl41n-shell">
        {view === "home" && (
          <section className="expl41n-home">
            <div className="expl41n-home-hero">
              <div className="expl41n-kicker">A cooperative word game</div>
              <h1>Make the <span>connection.</span></h1>
              <p>Explain the visible word with the shortest clue you can. Your AI partner gets five shots to understand you.</p>
              <div className="expl41n-home-rule"><b>Shortest clue wins.</b><span>25 characters maximum</span></div>
              <button className="expl41n-primary-button" onClick={() => openMode("daily")} type="button">
                Play today’s challenge <span>→</span>
              </button>
            </div>
            <div className="expl41n-home-guide">
              <div className="expl41n-orbit" aria-hidden="true" />
              <Mascot className="expl41n-home-mascot" state="idle" />
              <p>{greeting}</p>
            </div>
            <div className="expl41n-mode-grid">
              <button className="is-featured" onClick={() => openMode("daily")} type="button">
                <span className="expl41n-mode-icon">01</span>
                <small>Today</small>
                <strong>Daily</strong>
                <p>Five attempts. One official score.</p>
                <em>{session?.status === "won" ? "Completed ✓" : session?.status === "lost" ? "Come back tomorrow" : "Play now →"}</em>
              </button>
              <button onClick={() => openMode("shuffle")} type="button">
                <span className="expl41n-mode-icon">↝</span>
                <small>Endless</small>
                <strong>Shuffle</strong>
                <p>Random words and unlimited attempts.</p>
                <em>Mix it up →</em>
              </button>
              <button onClick={() => openMode("archive")} type="button">
                <span className="expl41n-mode-icon">⌁</span>
                <small>380 puzzles</small>
                <strong>Archive</strong>
                <p>Revisit every authored challenge.</p>
                <em>Browse vault →</em>
              </button>
              <button onClick={() => openMode("custom")} type="button">
                <span className="expl41n-mode-icon">＋</span>
                <small>Your word</small>
                <strong>Custom</strong>
                <p>Build a challenge for your own clue.</p>
                <em>Create one →</em>
              </button>
            </div>
          </section>
        )}

        {view === "archive" && (
          <section className="expl41n-screen expl41n-archive-screen">
            <div className="expl41n-screen-heading">
              <div><span className="expl41n-kicker">The connection vault</span><h1>Archive</h1></div>
              <p>Every authored Expl41n puzzle, ready for another clue. Archive attempts are unlimited.</p>
            </div>
            <div className="expl41n-archive-layout">
              <aside>
                <label htmlFor="expl41n-archive-month">Choose a month</label>
                <select id="expl41n-archive-month" onChange={(event) => setArchiveMonth(event.target.value)} value={archiveMonth}>
                  {expl41nArchiveMonths.map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}
                </select>
                <div className="expl41n-archive-note"><Mascot state="skeptical" /><p>{greeting}</p></div>
              </aside>
              <div className="expl41n-archive-board">
                <div className="expl41n-archive-board-head"><strong>{currentArchive?.label}</strong><span>{currentArchive?.puzzles.length || 0} challenges</span></div>
                <div className="expl41n-archive-grid">
                  {currentArchive?.puzzles.map((puzzle) => {
                    const best = progress.archiveBest[puzzle.date];
                    return (
                      <button key={puzzle.date} onClick={() => openArchivePuzzle(puzzle)} type="button">
                        <small>{new Date(`${puzzle.date} 12:00:00`).toLocaleDateString("en-US", { weekday: "short" })}</small>
                        <strong>{new Date(`${puzzle.date} 12:00:00`).getDate()}</strong>
                        <span>{best ? `${best} chars ✓` : "Play →"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {view === "custom" && (
          <section className="expl41n-screen expl41n-custom-screen">
            <div className="expl41n-custom-copy">
              <span className="expl41n-kicker">You set the target</span>
              <h1>Create a <span>custom connection.</span></h1>
              <p>Choose a single secret word, then write the clue that will lead your AI partner there. Custom games have unlimited attempts.</p>
              <Mascot state="confident" />
              <blockquote>{greeting}</blockquote>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); startCustom(); }}>
              <div><span>01</span><label htmlFor="expl41n-custom-word">Secret word</label></div>
              <input autoComplete="off" id="expl41n-custom-word" maxLength={15} onChange={(event) => { setCustomWord(event.target.value); markActivity(); }} placeholder="Connection" value={customWord} />
              <small>A single word, 15 characters or fewer.</small>
              <div><span>02</span><label htmlFor="expl41n-custom-fact">Completion message <em>optional</em></label></div>
              <textarea id="expl41n-custom-fact" maxLength={100} onChange={(event) => setCustomFact(event.target.value)} placeholder="A fact, an inside joke, or a victory note…" value={customFact} />
              {feedbackTone === "error" && <p className="expl41n-form-error">{feedback}</p>}
              <button className="expl41n-primary-button" type="submit">Start custom game <span>→</span></button>
            </form>
          </section>
        )}

        {view === "how" && (
          <section className="expl41n-screen expl41n-how-screen">
            <div className="expl41n-screen-heading">
              <div><span className="expl41n-kicker">Connection protocol</span><h1>How to play</h1></div>
              <p>You know the challenge word. The AI does not. Guide it there with one concise clue at a time.</p>
            </div>
            <div className="expl41n-how-flow">
              <article><span>01</span><strong>Read the word</strong><p>The challenge word stays visible to you for the entire round.</p></article>
              <article><span>02</span><strong>Write a clue</strong><p>Use 25 characters or fewer. Shorter successful clues score better.</p></article>
              <article><span>03</span><strong>Study the guess</strong><p>Confidence, search space, and reasoning reveal how the AI interpreted you.</p></article>
              <article><span>04</span><strong>Connect</strong><p>Daily gives you five attempts. Other modes let you keep refining.</p></article>
            </div>
            <div className="expl41n-how-example">
              <div><small>Challenge word</small><strong>ORBIT</strong></div>
              <span>＋</span>
              <div><small>Your clue</small><strong>planet path</strong></div>
              <span>→</span>
              <div className="is-answer"><small>AI guess</small><strong>Orbit?</strong></div>
            </div>
            <div className="expl41n-how-metrics">
              <Metric color="#f4c95d" label="Clue length" progress={44} value="11" />
              <Metric color="#72a5ff" label="Confidence" progress={92} value="92%" />
              <Metric color="#9e7cff" label="Search space" progress={86} value="14" />
              <Metric color="#67dfb1" label="Attempts left" progress={80} value="4" />
            </div>
            <button className="expl41n-primary-button" onClick={() => openMode("daily")} type="button">Try today’s word <span>→</span></button>
          </section>
        )}

        {view === "play" && session && (
          <section className="expl41n-play-screen">
            <header className="expl41n-round-header">
              <div><span>{modeLabel(mode)} challenge</span><small>{mode === "daily" ? (isFallbackDaily ? `${legacyExpl41nDate()} · classic rotation` : session.puzzle.date) : mode === "archive" ? session.puzzle.date : mode === "shuffle" ? "Unlimited attempts" : "Your secret word"}</small></div>
              <div className="expl41n-target"><small>Challenge word</small><h1>{session.puzzle.word}</h1></div>
              <button onClick={openHow} type="button">How to play</button>
            </header>

            <div className="expl41n-play-layout">
              <div className="expl41n-conversation-panel">
                <div className="expl41n-guide-stage">
                  <div className="expl41n-guide-halo" aria-hidden="true" />
                  <Mascot className="expl41n-play-mascot" state={mascotState} />
                  <div className="expl41n-speech" aria-live="polite">
                    <span>Connection guide</span>
                    {isThinking ? <><strong>Thinking<span className="expl41n-thinking-dots">•••</span></strong><p>I’m following the signal.</p></> : latestAttempt ? <><strong>{latestAttempt.guess}?</strong><p>{latestAttempt.reasoning}</p></> : <><strong>I am ready.</strong><p>{greeting}</p></>}
                  </div>
                </div>

                {session.status === "active" ? (
                  <form className="expl41n-clue-form" onSubmit={submitClue}>
                    <div><label htmlFor="expl41n-clue">Explain <b>{session.puzzle.word}</b></label><span>{clue.length}/{EXPL41N_CLUE_LIMIT}</span></div>
                    <div className="expl41n-clue-control">
                      <input autoComplete="off" autoCorrect="off" id="expl41n-clue" maxLength={EXPL41N_CLUE_LIMIT} onChange={(event) => { setClue(event.target.value); markActivity(); }} placeholder="Short, meaningful, specific…" spellCheck={false} value={clue} />
                      <button disabled={!clue.trim() || isThinking} type="submit">{isThinking ? "Thinking" : "Send clue"}<span>→</span></button>
                    </div>
                    <p className={`expl41n-feedback is-${feedbackTone}`}>{feedback}</p>
                  </form>
                ) : (
                  <div className={`expl41n-result-card is-${session.status}`}>
                    <span>{session.status === "won" ? "Connection made" : "Signal lost"}</span>
                    <h2>{session.status === "won" ? victoryMessage(session.winningAttempt?.characters || 25) : `The word was ${session.puzzle.word}.`}</h2>
                    <p>{greeting}</p>
                    {session.status === "won" && <div className="expl41n-result-score"><strong>{session.winningAttempt?.characters}</strong><span>characters<br />in the winning clue</span></div>}
                    <small>{session.puzzle.funFact}</small>
                    <div className="expl41n-result-actions">
                      {session.status === "won" && mode === "daily" && <button onClick={handleShare} type="button">Share result</button>}
                      {mode === "shuffle" && <button className="is-primary" onClick={nextShuffle} type="button">Next word <span>→</span></button>}
                      {mode === "archive" && <button onClick={() => openMode("archive")} type="button">Back to Archive</button>}
                      {shareStatus && <em>{shareStatus}</em>}
                    </div>
                  </div>
                )}
              </div>

              <aside className="expl41n-instrument-panel">
                <div className="expl41n-panel-heading"><div><span>Live signal</span><strong>{session.status === "active" ? "Analyzing the connection" : session.status === "won" ? "Connection complete" : "Round complete"}</strong></div><i className={`is-${session.status}`} /></div>
                <div className="expl41n-dials">
                  <Metric color="#f4c95d" label="Characters" progress={(clue.length / EXPL41N_CLUE_LIMIT) * 100} value={clue.length} />
                  <Metric color="#72a5ff" label="Confidence" progress={confidence} value={`${confidence}%`} />
                  <Metric color="#9e7cff" label="Search space" progress={100 - searchSpace} value={searchSpace} />
                  <Metric color="#67dfb1" label="Attempts left" progress={Number.isFinite(remaining) ? (remaining / 5) * 100 : 100} value={Number.isFinite(remaining) ? remaining : "∞"} />
                </div>

                <div className="expl41n-history">
                  <div className="expl41n-panel-subhead"><strong>Attempt history</strong><span>{session.attempts.length} {session.attempts.length === 1 ? "signal" : "signals"}</span></div>
                  {session.attempts.length ? (
                    <ol>{session.attempts.map((attempt, index) => <li key={`${attempt.timestamp}-${index}`}><span>{index + 1}</span><div><b>{attempt.clue}</b><small>{attempt.characters} chars</small></div><em>→</em><div><b>{attempt.guess}</b><small>{attempt.confidence}% confidence</small></div></li>)}</ol>
                  ) : <p>No guesses yet. Your first clue starts the signal.</p>}
                </div>

                {mode === "daily" && (
                  <div className="expl41n-leaderboard">
                    <div className="expl41n-panel-subhead"><strong>Daily leaderboard</strong><span>Shortest clues</span></div>
                    {leaderboard.length ? leaderboard.map((entry, index) => <div key={`${entry.username}-${entry.score}-${index}`}><span>#{index + 1}</span><b>{entry.username}</b><small>{entry.score} chars · {entry.clue}</small></div>) : <p>Leaderboard unavailable.</p>}
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
