"use client";

import { useEffect, useMemo, useState } from "react";
import { gameStorageKey } from "../../platform/storage";
import {
  bridgeArchive,
  bridgeDateKey,
  bridgePacks,
  selectDailyBridgePuzzle,
} from "./catalog";
import {
  BEFORE_AFTER_ANSWER_LIMIT,
  bridgePhrases,
  createBridgeSession,
  expireBridgeSession,
  hydrateBridgeSession,
  remainingBridgeSeconds,
  serializeBridgeSession,
  submitBridgeAnswer,
  validateCustomBridgePuzzle,
  type BridgeMode,
  type BridgePosition,
  type BridgePuzzle,
  type BridgeSession,
} from "./engine.mjs";

const DAILY_KEY = gameStorageKey("before-after", "daily");
const PROGRESS_KEY = gameStorageKey("before-after", "progress");
const CUSTOM_KEY = gameStorageKey("before-after", "custom");
const KEYBOARD = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

type View = BridgeMode | "stats";
type Solve = { attempts: number; durationMs: number; solvedAt: string };
type BridgeProgress = {
  solved: Record<string, Solve>;
  totalAttempts: number;
  dailyDates: string[];
};

const EMPTY_PROGRESS: BridgeProgress = {
  solved: {},
  totalAttempts: 0,
  dailyDates: [],
};

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function modeTitle(mode: BridgeMode) {
  if (mode === "daily") return "Daily bridge";
  if (mode === "archive") return "From the archive";
  if (mode === "custom") return "Your bridge";
  return "Puzzle packs";
}

function cluePieces(puzzle: BridgePuzzle) {
  const [first, second] = puzzle.clueWords;
  if (puzzle.position === "before") {
    return [
      ["blank", first],
      ["blank", second],
    ];
  }
  if (puzzle.position === "after") {
    return [
      [first, "blank"],
      [second, "blank"],
    ];
  }
  return [
    ["blank", first],
    [second, "blank"],
  ];
}

function currentStreak(dates: string[]) {
  const solved = new Set(dates);
  let streak = 0;
  const cursor = new Date();
  while (solved.has(bridgeDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function BeforeAfterGame() {
  const today = useMemo(() => new Date(), []);
  const dailyPuzzle = useMemo(() => selectDailyBridgePuzzle(today), [today]);
  const archive = useMemo(() => bridgeArchive(30, today), [today]);
  const [view, setView] = useState<View>("daily");
  const [packId, setPackId] = useState(bridgePacks[0].id);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [session, setSession] = useState<BridgeSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("Find the word that completes both phrases.");
  const [tone, setTone] = useState<"neutral" | "error" | "success">("neutral");
  const [remaining, setRemaining] = useState(60);
  const [progress, setProgress] = useState<BridgeProgress>(EMPTY_PROGRESS);
  const [customPuzzles, setCustomPuzzles] = useState<BridgePuzzle[]>([]);
  const [customAnswer, setCustomAnswer] = useState("");
  const [customClueOne, setCustomClueOne] = useState("");
  const [customClueTwo, setCustomClueTwo] = useState("");
  const [customPosition, setCustomPosition] =
    useState<BridgePosition>("before");

  const currentPack =
    bridgePacks.find((pack) => pack.id === packId) || bridgePacks[0];
  const solvedCount = Object.keys(progress.solved).length;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedProgress = readJson<BridgeProgress>(PROGRESS_KEY, EMPTY_PROGRESS);
      const storedCustom = readJson<BridgePuzzle[]>(CUSTOM_KEY, []);
      const storedDaily = readJson<Record<string, unknown> | null>(DAILY_KEY, null);
      const restored = hydrateBridgeSession({
        payload: storedDaily,
        puzzle: dailyPuzzle,
        mode: "daily",
        now: Date.now(),
      });
      setProgress({
        solved: storedProgress.solved || {},
        totalAttempts: Number(storedProgress.totalAttempts) || 0,
        dailyDates: Array.isArray(storedProgress.dailyDates)
          ? storedProgress.dailyDates
          : [],
      });
      setCustomPuzzles(Array.isArray(storedCustom) ? storedCustom : []);
      setSession(restored);
      setAnswer(restored.answerText);
      setRemaining(remainingBridgeSeconds(restored));
      if (restored.status === "solved") {
        setFeedback("Today’s bridge is complete.");
        setTone("success");
      } else if (restored.status === "expired") {
        setFeedback(`Time. The bridge was ${restored.puzzle.answer}.`);
        setTone("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dailyPuzzle]);

  useEffect(() => {
    if (!session || session.mode !== "daily" || session.status !== "active") return;
    const timer = window.setInterval(() => {
      const seconds = remainingBridgeSeconds(session, Date.now());
      setRemaining(seconds);
      if (seconds === 0) {
        const expired = expireBridgeSession(session, Date.now());
        setSession(expired);
        localStorage.setItem(DAILY_KEY, JSON.stringify(serializeBridgeSession(expired)));
        setFeedback(`Time. The bridge was ${session.puzzle.answer}.`);
        setTone("error");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [session]);

  function saveProgress(next: BridgeProgress) {
    setProgress(next);
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  }

  function handleStartPuzzle(puzzle: BridgePuzzle, mode: BridgeMode) {
    const next = createBridgeSession({
      puzzle,
      mode,
    });
    setSession(next);
    setAnswer("");
    setRemaining(60);
    setFeedback(
      mode === "daily"
        ? "You have 60 seconds and unlimited guesses."
        : "Find the word that completes both phrases.",
    );
    setTone("neutral");
  }

  function handleOpenView(next: View) {
    setView(next);
    if (next === "daily") {
      const restored = hydrateBridgeSession({
        payload: readJson<Record<string, unknown> | null>(DAILY_KEY, null),
        puzzle: dailyPuzzle,
        mode: "daily",
      });
      setSession(restored);
      setAnswer(restored.answerText);
      setRemaining(remainingBridgeSeconds(restored));
    } else if (next === "packs") {
      handleStartPuzzle(currentPack.puzzles[puzzleIndex] || currentPack.puzzles[0], "packs");
    } else if (next === "archive") {
      handleStartPuzzle(archive[0].puzzle, "archive");
    } else if (next === "custom") {
      setSession(null);
    }
    setTone("neutral");
  }

  function choosePack(nextPackId: string) {
    const pack = bridgePacks.find((entry) => entry.id === nextPackId);
    if (!pack) return;
    setPackId(nextPackId);
    setPuzzleIndex(0);
    handleStartPuzzle(pack.puzzles[0], "packs");
  }

  function choosePackPuzzle(index: number) {
    setPuzzleIndex(index);
    handleStartPuzzle(currentPack.puzzles[index], "packs");
  }

  function submit() {
    if (!session) return;
    const result = submitBridgeAnswer(session, answer, Date.now());
    if (!result.accepted) {
      if (result.state.status === "expired") {
        setSession(result.state);
        setFeedback(`Time. The bridge was ${session.puzzle.answer}.`);
      } else {
        setFeedback("Type a word before submitting.");
      }
      setTone("error");
      return;
    }
    setSession(result.state);
    if (session.mode === "daily") {
      localStorage.setItem(
        DAILY_KEY,
        JSON.stringify(serializeBridgeSession(result.state)),
      );
    }
    if (!result.correct) {
      const nextProgress = {
        ...progress,
        totalAttempts: progress.totalAttempts + 1,
      };
      saveProgress(nextProgress);
      setAnswer("");
      setFeedback("Not the bridge. Try another word.");
      setTone("error");
      return;
    }
    const dateKey = bridgeDateKey(today);
    const dailyDates =
      session.mode === "daily"
        ? [...new Set([...progress.dailyDates, dateKey])]
        : progress.dailyDates;
    const nextProgress = {
      solved: {
        ...progress.solved,
        [session.puzzle.id]: {
          attempts: result.state.attempts,
          durationMs: result.state.durationMs || 0,
          solvedAt: new Date().toISOString(),
        },
      },
      totalAttempts: progress.totalAttempts + 1,
      dailyDates,
    };
    saveProgress(nextProgress);
    setAnswer(session.puzzle.answer.toLowerCase());
    setFeedback("Bridge complete.");
    setTone("success");
  }

  function retryDaily() {
    localStorage.removeItem(DAILY_KEY);
    handleStartPuzzle(dailyPuzzle, "daily");
  }

  function createCustom() {
    const result = validateCustomBridgePuzzle({
      answer: customAnswer,
      clueOne: customClueOne,
      clueTwo: customClueTwo,
      position: customPosition,
    });
    if (!result.valid) {
      const messages: Record<string, string> = {
        "answer-required": "Add an answer.",
        "answer-too-long": `Keep the answer to ${BEFORE_AFTER_ANSWER_LIMIT} letters.`,
        "two-clues-required": "Add two clue words.",
        "clues-unique": "Use two different clues.",
        "position-invalid": "Choose a bridge direction.",
      };
      setFeedback(messages[result.reason] || "Check your puzzle.");
      setTone("error");
      return;
    }
    const nextCustom = [result.puzzle, ...customPuzzles];
    setCustomPuzzles(nextCustom);
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(nextCustom));
    handleStartPuzzle(result.puzzle, "custom");
  }

  function keyboardKey(key: string) {
    if (key === "⌫") {
      setAnswer((value) => value.slice(0, -1));
      return;
    }
    setAnswer((value) =>
      value.length < BEFORE_AFTER_ANSWER_LIMIT
        ? `${value}${key.toLowerCase()}`
        : value,
    );
  }

  const pieces = session ? cluePieces(session.puzzle) : [];
  const revealed =
    session?.status === "solved" || session?.status === "expired";

  return (
    <div className="before-after-game-card">
      <header className="before-after-header">
        <div>
          <p>Before<span>&</span>After</p>
          <small>{view === "stats" ? "Your record" : session ? modeTitle(session.mode) : "Puzzle maker"}</small>
        </div>
        <nav aria-label="Before and After modes">
          {(["daily", "packs", "archive", "custom", "stats"] as View[]).map(
            (item) => (
              <button
                className={view === item ? "is-current" : ""}
                key={item}
                onClick={() => handleOpenView(item)}
                type="button"
              >
                {item}
              </button>
            ),
          )}
        </nav>
      </header>

      {view === "stats" ? (
        <section className="before-after-stats">
          <p className="eyebrow">Device-local progress</p>
          <h2>{solvedCount}</h2>
          <p>bridges solved across Daily, packs, Archive, and your puzzles.</p>
          <div>
            <span><b>{progress.totalAttempts}</b> guesses</span>
            <span><b>{progress.dailyDates.length}</b> dailies</span>
            <span><b>{currentStreak(progress.dailyDates)}</b> day streak</span>
            <span><b>{customPuzzles.length}</b> created</span>
          </div>
        </section>
      ) : view === "custom" && !session ? (
        <section className="before-after-maker">
          <div>
            <p className="eyebrow">Build a bridge</p>
            <h2>Make your own</h2>
          </div>
          <label>
            Answer
            <input
              maxLength={BEFORE_AFTER_ANSWER_LIMIT}
              onChange={(event) => setCustomAnswer(event.target.value)}
              placeholder="bridge word"
              value={customAnswer}
            />
          </label>
          <div className="before-after-maker-clues">
            <label>
              First clue
              <input
                onChange={(event) => setCustomClueOne(event.target.value)}
                placeholder="first clue"
                value={customClueOne}
              />
            </label>
            <label>
              Second clue
              <input
                onChange={(event) => setCustomClueTwo(event.target.value)}
                placeholder="second clue"
                value={customClueTwo}
              />
            </label>
          </div>
          <label>
            Bridge rule
            <select
              onChange={(event) =>
                setCustomPosition(event.target.value as BridgePosition)
              }
              value={customPosition}
            >
              <option value="before">Answer before both clues</option>
              <option value="after">Answer after both clues</option>
              <option value="both">Before the first, after the second</option>
            </select>
          </label>
          <button className="before-after-primary" onClick={createCustom} type="button">
            Create & play
          </button>
          {customPuzzles.length > 0 && (
            <div className="before-after-custom-list">
              <span>Your puzzles</span>
              {customPuzzles.slice(0, 5).map((puzzle) => (
                <button
                  key={puzzle.id}
                  onClick={() => handleStartPuzzle(puzzle, "custom")}
                  type="button"
                >
                  {puzzle.clueWords.join(" · ")}
                </button>
              ))}
            </div>
          )}
          <p className={`before-after-feedback is-${tone}`}>{feedback}</p>
        </section>
      ) : session ? (
        <>
          {view === "packs" && (
            <div className="before-after-packbar">
              {bridgePacks.map((pack) => (
                <button
                  className={pack.id === packId ? "is-current" : ""}
                  key={pack.id}
                  onClick={() => choosePack(pack.id)}
                  type="button"
                >
                  {pack.name}<small>{pack.puzzles.length}</small>
                </button>
              ))}
            </div>
          )}
          {view === "archive" && (
            <div className="before-after-archive">
              {archive.map((entry) => (
                <button
                  className={session.puzzle.id === entry.puzzle.id ? "is-current" : ""}
                  key={entry.date}
                  onClick={() => handleStartPuzzle(entry.puzzle, "archive")}
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}
          <section className="before-after-puzzle">
            <div className="before-after-meta">
              <span>
                {session.mode === "daily"
                  ? bridgeDateKey(today)
                  : session.mode === "packs"
                    ? `${currentPack.name} ${puzzleIndex + 1}/${currentPack.puzzles.length}`
                    : modeTitle(session.mode)}
              </span>
              <strong>
                {session.mode === "daily"
                  ? `${String(remaining).padStart(2, "0")}s`
                  : `${session.attempts} ${session.attempts === 1 ? "guess" : "guesses"}`}
              </strong>
            </div>
            <p className="before-after-instruction">
              One word completes both familiar phrases.
            </p>
            <div className="before-after-clues" aria-label="Phrase clues">
              {pieces.map((phrase, phraseIndex) => (
                <div key={phraseIndex}>
                  {phrase.map((piece, pieceIndex) =>
                    piece === "blank" ? (
                      <b className={revealed ? "is-revealed" : ""} key={pieceIndex}>
                        {revealed ? session.puzzle.answer : answer || "?"}
                      </b>
                    ) : (
                      <span key={pieceIndex}>{piece}</span>
                    ),
                  )}
                </div>
              ))}
            </div>

            <form
              className="before-after-entry"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <label htmlFor="before-after-answer">Your bridge</label>
              <div>
                <input
                  autoComplete="off"
                  disabled={session.status !== "active"}
                  id="before-after-answer"
                  maxLength={BEFORE_AFTER_ANSWER_LIMIT}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Type one word"
                  value={answer}
                />
                <button disabled={session.status !== "active"} type="submit">
                  Submit
                </button>
              </div>
            </form>
            <div className="before-after-keyboard" aria-label="Letter keyboard">
              {KEYBOARD.map((row) => (
                <div key={row}>
                  {row.split("").map((key) => (
                    <button
                      disabled={session.status !== "active"}
                      key={key}
                      onClick={() => keyboardKey(key)}
                      type="button"
                    >
                      {key}
                    </button>
                  ))}
                  {row === "ZXCVBNM" && (
                    <button
                      disabled={session.status !== "active"}
                      onClick={() => keyboardKey("⌫")}
                      type="button"
                    >
                      ⌫
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className={`before-after-feedback is-${tone}`} aria-live="polite">
              {feedback}
            </p>

            {session.status !== "active" && (
              <div className={`before-after-result is-${session.status}`}>
                <div>
                  <span>{session.status === "solved" ? "Solved" : "Time’s up"}</span>
                  <strong>{bridgePhrases(session.puzzle).join(" · ")}</strong>
                </div>
                {session.mode === "daily" ? (
                  <button onClick={retryDaily} type="button">Retry</button>
                ) : session.mode === "packs" ? (
                  <button
                    onClick={() =>
                      choosePackPuzzle((puzzleIndex + 1) % currentPack.puzzles.length)
                    }
                    type="button"
                  >
                    Next
                  </button>
                ) : null}
              </div>
            )}
          </section>
          {view === "packs" && (
            <footer className="before-after-packfooter">
              <button
                disabled={puzzleIndex === 0}
                onClick={() => choosePackPuzzle(puzzleIndex - 1)}
                type="button"
              >
                ← Previous
              </button>
              <span>{currentPack.description}</span>
              <button
                disabled={puzzleIndex === currentPack.puzzles.length - 1}
                onClick={() => choosePackPuzzle(puzzleIndex + 1)}
                type="button"
              >
                Next →
              </button>
            </footer>
          )}
        </>
      ) : (
        <div className="before-after-loading">Preparing the bridge…</div>
      )}
    </div>
  );
}
