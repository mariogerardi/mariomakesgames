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
import {
  applyExpl41nGuess,
  attemptsRemaining,
  createExpl41nSession,
  EXPL41N_CLUE_LIMIT,
  expl41nAvatarMood,
  hydrateExpl41nSession,
  serializeExpl41nSession,
  validateExpl41nClue,
  validateExpl41nCustomWord,
  type Expl41nMode,
  type Expl41nPuzzle,
  type Expl41nSession,
} from "./engine.mjs";
import {
  createExpl41nServices,
  type Expl41nLeaderboardEntry,
} from "./services.mjs";

const DAILY_KEY = gameStorageKey("expl41n", "daily");
const PROGRESS_KEY = gameStorageKey("expl41n", "progress");
const USERNAME_KEY = gameStorageKey("expl41n", "username");

type Expl41nProgress = {
  archiveBest: Record<string, number>;
  dailyBest: Record<string, number>;
};

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

export function Expl41nGame() {
  const services = useMemo(() => createExpl41nServices(), []);
  const [session, setSession] = useState<Expl41nSession | null>(null);
  const [mode, setMode] = useState<Expl41nMode>("daily");
  const [clue, setClue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [feedback, setFeedback] = useState("Give the AI one concise clue.");
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isFallbackDaily, setIsFallbackDaily] = useState(false);
  const [archiveMonth, setArchiveMonth] = useState(
    expl41nArchiveMonths[0]?.key || "",
  );
  const [customWord, setCustomWord] = useState("");
  const [customFact, setCustomFact] = useState("");
  const [progress, setProgress] = useState<Expl41nProgress>({
    archiveBest: {},
    dailyBest: {},
  });
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
      setFeedback(
        restored.status === "won"
          ? "Today’s winning clue is locked in."
          : restored.status === "lost"
            ? "Today’s five attempts are complete."
            : "Give the AI one concise clue.",
      );
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

  const currentArchive = expl41nArchiveMonths.find(
    (entry) => entry.key === archiveMonth,
  );
  const latestAttempt = session?.attempts.at(-1);
  const confidence = latestAttempt?.confidence ?? 0;
  const searchSpace = latestAttempt?.searchSpace ?? 100;
  const remaining = session ? attemptsRemaining(session) : 5;
  const mood = session
    ? expl41nAvatarMood(confidence, session.status)
    : "happy";

  function persistSession(next: Expl41nSession) {
    if (next.mode === "daily") {
      writeJson(DAILY_KEY, serializeExpl41nSession(next));
    }
  }

  function openMode(nextMode: Expl41nMode) {
    if (nextMode === "daily") {
      const today = new Date();
      const { puzzle, isFallback } = selectExpl41nDailyPuzzle(today);
      const restored = hydrateExpl41nSession({
        payload: readJson<Record<string, unknown> | null>(DAILY_KEY, null),
        puzzle,
        mode: "daily",
        sessionDate: localDateKey(today),
      });
      setSession(restored);
      setIsFallbackDaily(isFallback);
    } else if (nextMode === "shuffle") {
      const daily = selectExpl41nDailyPuzzle().puzzle;
      const puzzle = randomExpl41nPuzzle(daily.word);
      setSession(createSession(puzzle, "shuffle", crypto.randomUUID()));
      setIsFallbackDaily(false);
    } else if (nextMode === "archive") {
      const puzzle = currentArchive?.puzzles[0];
      if (puzzle) setSession(createSession(puzzle, "archive", puzzle.date));
      setIsFallbackDaily(false);
    } else {
      setSession(null);
      setIsFallbackDaily(false);
    }
    setMode(nextMode);
    setClue("");
    setShareStatus("");
    setFeedback(
      nextMode === "custom"
        ? "Choose the secret word the AI should guess."
        : "Give the AI one concise clue.",
    );
    setFeedbackTone("neutral");
  }

  function openArchivePuzzle(puzzle: Expl41nPuzzle) {
    setMode("archive");
    setSession(createSession(puzzle, "archive", puzzle.date));
    setClue("");
    setFeedback("Archive games have unlimited attempts.");
    setFeedbackTone("neutral");
  }

  function startCustom() {
    const validated = validateExpl41nCustomWord(customWord);
    if (!validated.valid) {
      setFeedback(
        validated.reason === "spaces"
          ? "Custom challenges must be a single word."
          : "Enter a custom challenge word first.",
      );
      setFeedbackTone("error");
      return;
    }
    const puzzle: Expl41nPuzzle = {
      word: validated.word,
      date: "Custom challenge",
      funFact: customFact.trim() || "You made the connection.",
    };
    setSession(createSession(puzzle, "custom", crypto.randomUUID()));
    setClue("");
    setFeedback("Custom games have unlimited attempts.");
    setFeedbackTone("neutral");
  }

  async function submitClue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.status !== "active" || isThinking) return;
    const validated = validateExpl41nClue(clue);
    if (!validated.valid) {
      setFeedback(
        validated.reason === "too-long"
          ? "Clues can use at most 25 characters."
          : "Enter a clue first.",
      );
      setFeedbackTone("error");
      return;
    }

    setIsThinking(true);
    setFeedback("The AI is connecting the dots…");
    setFeedbackTone("neutral");
    setShareStatus("");
    try {
      const response = await services.guess({
        clue: validated.clue,
        previousAIGuesses: session.attempts.map((attempt) =>
          attempt.guess.toLowerCase(),
        ),
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
        const key =
          next.mode === "daily" ? next.sessionDate : next.puzzle.date;
        const field = next.mode === "daily" ? "dailyBest" : "archiveBest";
        const nextProgress = {
          ...progress,
          [field]: {
            ...progress[field],
            [key]: Math.min(
              progress[field][key] ?? Number.POSITIVE_INFINITY,
              result.attempt.characters,
            ),
          },
        };
        setProgress(nextProgress);
        writeJson(PROGRESS_KEY, nextProgress);
        setFeedback(
          `Solved with ${result.attempt.characters} character${result.attempt.characters === 1 ? "" : "s"}.`,
        );
        setFeedbackTone("success");

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
            // The local win remains authoritative if the legacy board is down.
          }
        }
      } else if (result.lost) {
        setFeedback("Five guesses, no connection. The word is revealed below.");
        setFeedbackTone("error");
      } else {
        setFeedback("Not quite. Refine the clue and try again.");
        setFeedbackTone("neutral");
      }
    } catch {
      setFeedback(
        "The AI could not answer. Your clue and attempt were not consumed.",
      );
      setFeedbackTone("error");
    } finally {
      setIsThinking(false);
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
    setSession(createSession(puzzle, "shuffle", crypto.randomUUID()));
    setClue("");
    setFeedback("New word. Unlimited attempts.");
    setFeedbackTone("neutral");
  }

  if (!session && mode !== "custom") {
    return <div className="expl41n-game-loading">Waking the AI…</div>;
  }

  return (
    <div className="expl41n-game-card">
      <header className="expl41n-game-header">
        <div>
          <p>Expl<span>41</span>n</p>
          <small>Team up with AI to connect the dots.</small>
        </div>
        <nav aria-label="Expl41n game modes">
          {(["daily", "shuffle", "archive", "custom"] as Expl41nMode[]).map(
            (entry) => (
              <button
                className={mode === entry ? "is-current" : ""}
                key={entry}
                onClick={() => openMode(entry)}
                type="button"
              >
                {modeLabel(entry)}
              </button>
            ),
          )}
        </nav>
      </header>

      {mode === "archive" && (
        <div className="expl41n-archive">
          <select
            aria-label="Archive month"
            onChange={(event) => {
              setArchiveMonth(event.target.value);
              const month = expl41nArchiveMonths.find(
                (entry) => entry.key === event.target.value,
              );
              if (month?.puzzles[0]) openArchivePuzzle(month.puzzles[0]);
            }}
            value={archiveMonth}
          >
            {expl41nArchiveMonths.map((month) => (
              <option key={month.key} value={month.key}>{month.label}</option>
            ))}
          </select>
          <div>
            {currentArchive?.puzzles.map((puzzle) => (
              <button
                className={session?.puzzle.date === puzzle.date ? "is-current" : ""}
                key={puzzle.date}
                onClick={() => openArchivePuzzle(puzzle)}
                type="button"
              >
                {new Date(`${puzzle.date} 12:00:00`).getDate()}
                {progress.archiveBest[puzzle.date] && <small>✓</small>}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "custom" && !session && (
        <form
          className="expl41n-custom"
          onSubmit={(event) => {
            event.preventDefault();
            startCustom();
          }}
        >
          <p>Create your own puzzle</p>
          <input
            maxLength={15}
            onChange={(event) => setCustomWord(event.target.value)}
            placeholder="Secret word"
            value={customWord}
          />
          <input
            maxLength={100}
            onChange={(event) => setCustomFact(event.target.value)}
            placeholder="Optional completion message"
            value={customFact}
          />
          <button type="submit">Start custom game <span>→</span></button>
        </form>
      )}

      {session && (
        <>
          <section className="expl41n-challenge">
            <div>
              <span>{modeLabel(mode)} challenge</span>
              <h2>{session.puzzle.word}</h2>
              <small>
                {mode === "daily"
                  ? isFallbackDaily
                    ? `${legacyExpl41nDate()} · classic rotation`
                    : session.puzzle.date
                  : mode === "archive"
                    ? session.puzzle.date
                    : mode === "shuffle"
                      ? "Unlimited guesses"
                      : "Your secret word"}
              </small>
            </div>
            <Image
              alt={`AI is ${mood}`}
              height={100}
              src={`/expl41n/emotions/${mood}.png`}
              unoptimized
              width={100}
            />
          </section>

          <div className="expl41n-conversation">
            <div className="expl41n-ai-response" aria-live="polite">
              {isThinking ? (
                <p className="is-thinking">Thinking<span>•••</span></p>
              ) : latestAttempt ? (
                <>
                  <strong>{latestAttempt.guess}?</strong>
                  <p>{latestAttempt.reasoning}</p>
                </>
              ) : (
                <>
                  <strong>I am ready.</strong>
                  <p>Give me a clue and I will guess the challenge word.</p>
                </>
              )}
            </div>

            <div className="expl41n-metrics">
              <div>
                <span>Characters</span>
                <strong>{clue.length}/{EXPL41N_CLUE_LIMIT}</strong>
                <i style={{ "--metric": `${(clue.length / 25) * 100}%` } as React.CSSProperties} />
              </div>
              <div>
                <span>Confidence</span>
                <strong>{confidence}%</strong>
                <i style={{ "--metric": `${confidence}%` } as React.CSSProperties} />
              </div>
              <div>
                <span>Search space</span>
                <strong>{searchSpace}</strong>
                <i style={{ "--metric": `${100 - searchSpace}%` } as React.CSSProperties} />
              </div>
              <div>
                <span>Attempts left</span>
                <strong>{Number.isFinite(remaining) ? remaining : "∞"}</strong>
                <i
                  style={{
                    "--metric": `${Number.isFinite(remaining) ? (remaining / 5) * 100 : 100}%`,
                  } as React.CSSProperties}
                />
              </div>
            </div>
          </div>

          {session.status === "active" ? (
            <form className="expl41n-entry" onSubmit={submitClue}>
              <label htmlFor="expl41n-clue">Your clue</label>
              <div>
                <input
                  autoComplete="off"
                  autoCorrect="off"
                  id="expl41n-clue"
                  maxLength={EXPL41N_CLUE_LIMIT}
                  onChange={(event) => setClue(event.target.value)}
                  placeholder="Short, meaningful, specific…"
                  spellCheck={false}
                  value={clue}
                />
                <button disabled={!clue.trim() || isThinking} type="submit">
                  {isThinking ? "Thinking" : "Submit"} <span>→</span>
                </button>
              </div>
            </form>
          ) : (
            <div className={`expl41n-result is-${session.status}`}>
              <div>
                <p>{session.status === "won" ? "Connection made" : "Game over"}</p>
                <h3>
                  {session.status === "won"
                    ? `${session.winningAttempt?.characters} characters.`
                    : `The word was ${session.puzzle.word}.`}
                </h3>
                <span>{session.puzzle.funFact}</span>
              </div>
              <div>
                {session.status === "won" && mode === "daily" && (
                  <button onClick={handleShare} type="button">Share result</button>
                )}
                {mode === "shuffle" && (
                  <button className="is-primary" onClick={nextShuffle} type="button">
                    Next word <span>→</span>
                  </button>
                )}
                {shareStatus && <small>{shareStatus}</small>}
              </div>
            </div>
          )}

          <p className={`expl41n-feedback is-${feedbackTone}`}>{feedback}</p>

          {session.attempts.length > 0 && (
            <ol className="expl41n-attempts">
              {session.attempts.map((attempt, index) => (
                <li key={`${attempt.timestamp}-${index}`}>
                  <span>{index + 1}</span>
                  <b>{attempt.clue}</b>
                  <em>→ {attempt.guess}</em>
                  <small>{attempt.characters} chars · {attempt.confidence}%</small>
                </li>
              ))}
            </ol>
          )}

          <footer className="expl41n-game-footer">
            <details>
              <summary>How to play</summary>
              <p>
                Help the AI guess the visible challenge word using clues of 25
                characters or fewer. Daily gives you five attempts and locks
                your first win; Shuffle, Archive, and Custom allow unlimited
                guesses. Your score is the length of the successful clue, so
                lower is better.
              </p>
            </details>
            {mode === "daily" && (
              <div>
                <span>Daily leaderboard</span>
                {leaderboard.length ? (
                  leaderboard.map((entry, index) => (
                    <p key={`${entry.username}-${entry.score}-${index}`}>
                      <b>#{index + 1}</b> {entry.username}
                      <small>{entry.score} chars · {entry.clue}</small>
                    </p>
                  ))
                ) : (
                  <p>Leaderboard unavailable.</p>
                )}
              </div>
            )}
          </footer>
        </>
      )}
    </div>
  );
}
