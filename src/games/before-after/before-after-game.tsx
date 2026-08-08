"use client";

import { useEffect, useMemo, useState } from "react";
import { gameStorageKey } from "../../platform/storage";
import { GameLocalBar } from "../../app-shell/game-local-bar";
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
const THEME_KEY = gameStorageKey("before-after", "theme");
const KEYBOARD = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const CORE_VIEWS = ["daily", "packs", "archive", "custom", "stats"] as const;

type View =
  | "menu"
  | BridgeMode
  | (typeof CORE_VIEWS)[number]
  | "stats"
  | "themes"
  | "settings"
  | "insights";
type ThemeId = "signature" | "neapolitan" | "midnight" | "terminal";
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

const THEMES: Array<{ id: ThemeId; name: string; description: string }> = [
  { id: "signature", name: "signature", description: "the original pink-and-blue palette." },
  { id: "neapolitan", name: "neapolitan", description: "strawberry, vanilla, and chocolate decadence." },
  { id: "midnight", name: "midnight", description: "an assortment of moody blues." },
  { id: "terminal", name: "terminal", description: "glowing monochrome with bold neon greens." },
];

const MENU_ITEMS: Array<{ view: View; title: string; subtitle: string; icon: string }> = [
  { view: "daily", title: "daily", subtitle: "today’s sixty-second bridge", icon: "◫" },
  { view: "packs", title: "puzzle packs", subtitle: "204 handcrafted connections", icon: "▦" },
  { view: "custom", title: "create", subtitle: "make a bridge of your own", icon: "✎" },
  { view: "archive", title: "archive", subtitle: "revisit the last thirty days", icon: "≡" },
  { view: "stats", title: "statistics", subtitle: "your lifetime record", icon: "▥" },
  { view: "themes", title: "themes", subtitle: "change the whole atmosphere", icon: "✦" },
  { view: "settings", title: "settings", subtitle: "manage local progress", icon: "⚙" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
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

function bestStreak(dates: string[]) {
  const days = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of days) {
    const previousDate = previous ? new Date(`${previous}T12:00:00`) : null;
    if (previousDate) previousDate.setDate(previousDate.getDate() + 1);
    run = previousDate && bridgeDateKey(previousDate) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

function formatDuration(durationMs: number) {
  if (!durationMs) return "--";
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function instructionFor(puzzle: BridgePuzzle) {
  const [first, second] = puzzle.clueWords;
  if (puzzle.position === "before") return <>word before <b>{first}</b> or <b>{second}</b>.</>;
  if (puzzle.position === "after") return <>word after <b>{first}</b> or <b>{second}</b>.</>;
  return <>word before <b>{first}</b> or after <b>{second}</b>.</>;
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ba-wordmark${compact ? " is-compact" : ""}`} aria-label="Before and After">
      <span className="ba-wordmark-before">before</span>
      <i>&amp;</i>
      <span className="ba-wordmark-after">after</span>
    </div>
  );
}

function PhraseRows({
  puzzle,
  answer,
  revealed,
}: {
  puzzle: BridgePuzzle;
  answer: string;
  revealed: boolean;
}) {
  const shown = revealed ? puzzle.answer.toLowerCase() : answer.toLowerCase();
  return (
    <div className={`ba-phrase-stack${revealed ? " is-revealed" : ""}`} aria-label="Phrase clues">
      {puzzle.clueWords.slice(0, 2).map((clue, index) => {
        const answerFirst = puzzle.position === "before" || (puzzle.position === "both" && index === 0);
        return (
          <div className="ba-phrase" key={`${clue}-${index}`}>
            {answerFirst && <AnswerBlank value={shown} />}
            <span>{clue.toLowerCase()}</span>
            {!answerFirst && <AnswerBlank value={shown} />}
          </div>
        );
      })}
    </div>
  );
}

function AnswerBlank({ value }: { value: string }) {
  return (
    <b className={value ? "has-value" : ""}>
      <span>{value || "\u00a0"}</span>
    </b>
  );
}

export function BeforeAfterGame() {
  const today = useMemo(() => new Date(), []);
  const dailyPuzzle = useMemo(() => selectDailyBridgePuzzle(today), [today]);
  const archive = useMemo(() => bridgeArchive(30, today), [today]);
  const [view, setView] = useState<View>("menu");
  const [theme, setTheme] = useState<ThemeId>("signature");
  const [packId, setPackId] = useState(bridgePacks[0].id);
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
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
  const [customPosition, setCustomPosition] = useState<BridgePosition>("before");
  const [showCelebration, setShowCelebration] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const currentPack = bridgePacks.find((pack) => pack.id === packId) || bridgePacks[0];

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedProgress = readJson<BridgeProgress>(PROGRESS_KEY, EMPTY_PROGRESS);
      const storedCustom = readJson<BridgePuzzle[]>(CUSTOM_KEY, []);
      const storedDaily = readJson<Record<string, unknown> | null>(DAILY_KEY, null);
      const storedTheme = localStorage.getItem(THEME_KEY) as ThemeId | null;
      const restored = hydrateBridgeSession({
        payload: storedDaily,
        puzzle: dailyPuzzle,
        mode: "daily",
        now: Date.now(),
      });
      setProgress({
        solved: storedProgress.solved || {},
        totalAttempts: Number(storedProgress.totalAttempts) || 0,
        dailyDates: Array.isArray(storedProgress.dailyDates) ? storedProgress.dailyDates : [],
      });
      setCustomPuzzles(Array.isArray(storedCustom) ? storedCustom : []);
      if (THEMES.some((candidate) => candidate.id === storedTheme)) setTheme(storedTheme!);
      setSession(restored);
      setAnswer(restored.answerText);
      setRemaining(remainingBridgeSeconds(restored));
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

  function startPuzzle(puzzle: BridgePuzzle, mode: BridgeMode) {
    const next = createBridgeSession({ puzzle, mode });
    setSession(next);
    setAnswer("");
    setRemaining(60);
    setFeedback(mode === "daily" ? "You have 60 seconds and unlimited guesses." : "Find the word that completes both phrases.");
    setTone("neutral");
    setIsPlaying(true);
    setShowCelebration(false);
  }

  function openView(next: View) {
    setView(next);
    setShowCelebration(false);
    setConfirmReset(false);
    if (next === "daily") {
      const restored = hydrateBridgeSession({
        payload: readJson<Record<string, unknown> | null>(DAILY_KEY, null),
        puzzle: dailyPuzzle,
        mode: "daily",
      });
      setSession(restored);
      setAnswer(restored.answerText);
      setRemaining(remainingBridgeSeconds(restored));
      setFeedback(restored.status === "solved" ? "Today’s bridge is complete." : restored.status === "expired" ? `Time. The bridge was ${restored.puzzle.answer}.` : "You have 60 seconds and unlimited guesses.");
      setTone(restored.status === "solved" ? "success" : restored.status === "expired" ? "error" : "neutral");
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }

  function returnFromPlay() {
    setIsPlaying(false);
    setShowCelebration(false);
    if (view === "daily") setView("menu");
  }

  function choosePack(nextPackId: string) {
    setPackId(nextPackId);
    setPuzzleIndex(0);
  }

  function choosePackPuzzle(index: number) {
    setPuzzleIndex(index);
    startPuzzle(currentPack.puzzles[index], "packs");
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
      localStorage.setItem(DAILY_KEY, JSON.stringify(serializeBridgeSession(result.state)));
    }
    if (!result.correct) {
      saveProgress({ ...progress, totalAttempts: progress.totalAttempts + 1 });
      setAnswer("");
      setFeedback("Not the bridge. Try another word.");
      setTone("error");
      return;
    }
    const dateKey = bridgeDateKey(today);
    const dailyDates = session.mode === "daily"
      ? [...new Set([...progress.dailyDates, dateKey])]
      : progress.dailyDates;
    saveProgress({
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
    });
    setAnswer(session.puzzle.answer.toLowerCase());
    setFeedback("Bridge complete.");
    setTone("success");
    setShowCelebration(true);
  }

  useEffect(() => {
    if (!isPlaying || !session || session.status !== "active" || showCelebration) return;
    function handleKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setAnswer((value) => value.slice(0, -1));
      } else if (/^[a-z]$/i.test(event.key)) {
        setAnswer((value) => value.length < BEFORE_AFTER_ANSWER_LIMIT ? `${value}${event.key.toLowerCase()}` : value);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  function retryDaily() {
    localStorage.removeItem(DAILY_KEY);
    startPuzzle(dailyPuzzle, "daily");
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
    startPuzzle(result.puzzle, "custom");
  }

  function keyboardKey(key: string) {
    if (key === "⌫") {
      setAnswer((value) => value.slice(0, -1));
      return;
    }
    setAnswer((value) => value.length < BEFORE_AFTER_ANSWER_LIMIT ? `${value}${key.toLowerCase()}` : value);
  }

  function selectTheme(next: ThemeId) {
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  function resetProgress() {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(DAILY_KEY);
    setProgress(EMPTY_PROGRESS);
    setSession(createBridgeSession({ puzzle: dailyPuzzle, mode: "daily" }));
    setAnswer("");
    setRemaining(60);
    setConfirmReset(false);
  }

  const previewPuzzle: BridgePuzzle = {
    id: "preview",
    answer: customAnswer || "bridge",
    clueWords: [customClueOne || "first clue", customClueTwo || "second clue"],
    position: customPosition,
    difficulty: 1,
  };

  return (
    <div className="before-after-game-card" data-theme={theme}>
      <GameLocalBar
        ariaLabel="Before and After"
        brand={<Wordmark compact />}
        className="game-local-bar--before-after"
        items={[
          { label: "Menu", current: view === "menu" && !isPlaying, onSelect: () => openView("menu") },
          { label: "Daily", current: (view === "daily" || view === "insights") && (isPlaying || view === "insights"), onSelect: () => openView("daily") },
          { label: "Packs", current: view === "packs" || (isPlaying && session?.mode === "packs"), onSelect: () => openView("packs") },
          { label: "Archive", current: view === "archive" || (isPlaying && session?.mode === "archive"), onSelect: () => openView("archive") },
          { label: "Custom", current: view === "custom" || (isPlaying && session?.mode === "custom"), onSelect: () => openView("custom") },
          { label: "Stats", current: view === "stats", onSelect: () => openView("stats") },
          { label: "Themes", current: view === "themes", onSelect: () => openView("themes") },
          { label: "Settings", current: view === "settings", onSelect: () => openView("settings") },
        ]}
        onHome={() => openView("menu")}
      />
      {view === "menu" ? (
        <MainMenu progress={progress} onOpen={openView} />
      ) : isPlaying && session ? (
        <PlayView
          answer={answer}
          currentPack={currentPack}
          feedback={feedback}
          onAnswer={setAnswer}
          onBack={returnFromPlay}
          onClear={() => setAnswer("")}
          onKey={keyboardKey}
          onInsights={session.mode === "daily" ? () => {
            setIsPlaying(false);
            setView("insights");
          } : undefined}
          onNext={() => choosePackPuzzle((puzzleIndex + 1) % currentPack.puzzles.length)}
          onPrevious={() => choosePackPuzzle((puzzleIndex - 1 + currentPack.puzzles.length) % currentPack.puzzles.length)}
          onRetry={session.mode === "daily" ? retryDaily : () => startPuzzle(session.puzzle, session.mode)}
          onSubmit={submit}
          puzzleIndex={puzzleIndex}
          remaining={remaining}
          session={session}
          tone={tone}
        />
      ) : (
        <section className="ba-view">
          <header className="ba-view-heading"><h2>{view === "stats" ? "statistics" : view}</h2></header>
          {view === "packs" && (
            <PacksView currentPack={currentPack} packId={packId} progress={progress} onPack={choosePack} onPuzzle={choosePackPuzzle} />
          )}
          {view === "archive" && (
            <ArchiveView archive={archive} progress={progress} onPuzzle={(puzzle) => startPuzzle(puzzle, "archive")} />
          )}
          {view === "custom" && (
            <CreatorView
              answer={customAnswer}
              clueOne={customClueOne}
              clueTwo={customClueTwo}
              customPuzzles={customPuzzles}
              feedback={feedback}
              onAnswer={setCustomAnswer}
              onClueOne={setCustomClueOne}
              onClueTwo={setCustomClueTwo}
              onCreate={createCustom}
              onPlay={(puzzle) => startPuzzle(puzzle, "custom")}
              onPosition={setCustomPosition}
              position={customPosition}
              previewPuzzle={previewPuzzle}
              tone={tone}
            />
          )}
          {view === "stats" && <StatsView progress={progress} customCount={customPuzzles.length} />}
          {view === "themes" && <ThemesView selected={theme} onSelect={selectTheme} />}
          {view === "settings" && (
            <SettingsView confirmReset={confirmReset} onConfirm={resetProgress} onToggle={() => setConfirmReset((value) => !value)} />
          )}
          {view === "insights" && session && <InsightsView progress={progress} session={session} />}
        </section>
      )}

      {showCelebration && session?.status === "solved" && (
        <Celebration
          onClose={() => setShowCelebration(false)}
          onNext={session.mode === "packs" ? () => {
            setShowCelebration(false);
            choosePackPuzzle((puzzleIndex + 1) % currentPack.puzzles.length);
          } : undefined}
          onInsights={session.mode === "daily" ? () => {
            setShowCelebration(false);
            setIsPlaying(false);
            setView("insights");
          } : undefined}
          session={session}
        />
      )}
    </div>
  );
}

function MainMenu({ progress, onOpen }: { progress: BridgeProgress; onOpen: (view: View) => void }) {
  const dailyDone = progress.dailyDates.includes(bridgeDateKey(new Date()));
  return (
    <section className="ba-menu">
      <div className="ba-menu-hero">
        <Wordmark />
        <p>one word. two phrases. find the bridge.</p>
      </div>
      <div className="ba-menu-grid">
        {MENU_ITEMS.map((item) => (
          <button className={`ba-menu-tile is-${item.view}`} data-core-view={CORE_VIEWS.includes(item.view as (typeof CORE_VIEWS)[number]) || undefined} key={item.view} onClick={() => onOpen(item.view)} type="button">
            <span className="ba-menu-icon" aria-hidden="true">{item.icon}</span>
            <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
            {item.view === "daily" && dailyDone ? <em>done</em> : <i>›</i>}
          </button>
        ))}
      </div>
    </section>
  );
}

function PlayView({
  answer,
  currentPack,
  feedback,
  onAnswer,
  onBack,
  onClear,
  onKey,
  onInsights,
  onNext,
  onPrevious,
  onRetry,
  onSubmit,
  puzzleIndex,
  remaining,
  session,
  tone,
}: {
  answer: string;
  currentPack: (typeof bridgePacks)[number];
  feedback: string;
  onAnswer: (value: string) => void;
  onBack: () => void;
  onClear: () => void;
  onKey: (key: string) => void;
  onInsights?: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRetry: () => void;
  onSubmit: () => void;
  puzzleIndex: number;
  remaining: number;
  session: BridgeSession;
  tone: string;
}) {
  const revealed = session.status !== "active";
  const modeLabel = session.mode === "daily" ? "daily" : session.mode === "packs" ? currentPack.name.toLowerCase() : session.mode;
  return (
    <section className={`ba-play is-${session.status}`}>
      <header className="ba-play-nav">
        <button onClick={onBack} type="button">‹ <span>{session.mode === "daily" ? "menu" : modeLabel}</span></button>
        <div>
          <strong>{session.mode === "daily" ? `00:${String(remaining).padStart(2, "0")}` : modeLabel}</strong>
          <small>{session.attempts} {session.attempts === 1 ? "attempt" : "attempts"}</small>
        </div>
        <button disabled={session.status !== "active" || !answer} onClick={onClear} type="button"><span>clear</span> ×</button>
      </header>
      <div className="ba-play-layout">
        <div className="ba-puzzle-column">
          <div className="ba-puzzle-card">
            <p className="ba-instruction">{instructionFor(session.puzzle)}</p>
            <PhraseRows puzzle={session.puzzle} answer={answer} revealed={revealed} />
          </div>
          <p className={`ba-feedback is-${tone}`} aria-live="polite">{feedback}</p>
          {session.status === "expired" && (
            <div className="ba-timeout">
              <span>time’s up</span>
              <strong>{bridgePhrases(session.puzzle).join(" · ")}</strong>
              <button onClick={onRetry} type="button">try again</button>
            </div>
          )}
          {session.status === "solved" && (
            <div className="ba-timeout is-solved">
              <span>bridge complete</span>
              <strong>{bridgePhrases(session.puzzle).join(" · ")}</strong>
              {onInsights && <button onClick={onInsights} type="button">view insights</button>}
            </div>
          )}
        </div>
        <aside className="ba-controls">
          <div className="ba-answer-readout">
            <span>your answer</span>
            <strong>{answer || "type or tap"}</strong>
            <small>{answer.length}/{BEFORE_AFTER_ANSWER_LIMIT}</small>
          </div>
          <input
            aria-label="Your bridge answer"
            className="ba-mobile-input"
            disabled={session.status !== "active"}
            maxLength={BEFORE_AFTER_ANSWER_LIMIT}
            onChange={(event) => onAnswer(event.target.value)}
            value={answer}
          />
          <div className="ba-keyboard" aria-label="Letter keyboard">
            {KEYBOARD.map((row) => (
              <div key={row}>
                {row.split("").map((key) => (
                  <button disabled={session.status !== "active"} key={key} onClick={() => onKey(key)} type="button">{key}</button>
                ))}
                {row === "ZXCVBNM" && <button className="is-delete" disabled={session.status !== "active"} onClick={() => onKey("⌫")} type="button">⌫</button>}
              </div>
            ))}
          </div>
          <button className="ba-submit" disabled={session.status !== "active" || !answer.trim()} onClick={onSubmit} type="button">submit</button>
          {session.status === "active" && <button className="ba-retry" onClick={onRetry} type="button">restart puzzle</button>}
        </aside>
      </div>
      {session.mode === "packs" && (
        <footer className="ba-play-footer">
          <button onClick={onPrevious} type="button">← previous</button>
          <span>{puzzleIndex + 1} of {currentPack.puzzles.length}</span>
          <button onClick={onNext} type="button">next →</button>
        </footer>
      )}
    </section>
  );
}

function PacksView({ currentPack, packId, progress, onPack, onPuzzle }: {
  currentPack: (typeof bridgePacks)[number];
  packId: string;
  progress: BridgeProgress;
  onPack: (id: string) => void;
  onPuzzle: (index: number) => void;
}) {
  return (
    <div className="ba-library">
      <div className="ba-section-intro"><p>choose a collection</p><span>Every pack is ready to play—no ranks or filler.</span></div>
      <div className="ba-pack-grid">
        {bridgePacks.map((pack, index) => {
          const solved = pack.puzzles.filter((puzzle) => progress.solved[puzzle.id]).length;
          return (
            <button className={`ba-pack-card${pack.id === packId ? " is-current" : ""} is-pack-${index}`} key={pack.id} onClick={() => onPack(pack.id)} type="button">
              <span><strong>{pack.name.toLowerCase()}</strong><small>{pack.description}</small></span>
              <b>{solved}/{pack.puzzles.length}</b>
              <i><span style={{ width: `${(solved / pack.puzzles.length) * 100}%` }} /></i>
            </button>
          );
        })}
      </div>
      <div className="ba-puzzle-browser">
        <div><h3>{currentPack.name.toLowerCase()}</h3><p>{currentPack.description}</p></div>
        <div className="ba-puzzle-grid">
          {currentPack.puzzles.map((puzzle, index) => (
            <button className={progress.solved[puzzle.id] ? "is-solved" : ""} key={puzzle.id} onClick={() => onPuzzle(index)} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{puzzle.clueWords.join(" · ")}</strong>
              <small>{progress.solved[puzzle.id] ? puzzle.answer : "play"}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArchiveView({ archive, progress, onPuzzle }: {
  archive: ReturnType<typeof bridgeArchive>;
  progress: BridgeProgress;
  onPuzzle: (puzzle: BridgePuzzle) => void;
}) {
  return (
    <div className="ba-library">
      <div className="ba-section-intro"><p>the last thirty days</p><span>Old bridges remain fully playable on this device.</span></div>
      <div className="ba-archive-grid">
        {archive.map((entry, index) => {
          const solved = progress.solved[entry.puzzle.id];
          return (
            <button className={solved ? "is-solved" : ""} key={entry.date} onClick={() => onPuzzle(entry.puzzle)} type="button">
              <span>{index === 0 ? "today" : entry.label}</span>
              <strong>{entry.puzzle.clueWords.join(" + ")}</strong>
              <small>{solved ? entry.puzzle.answer : "find the bridge"}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CreatorView({ answer, clueOne, clueTwo, customPuzzles, feedback, onAnswer, onClueOne, onClueTwo, onCreate, onPlay, onPosition, position, previewPuzzle, tone }: {
  answer: string;
  clueOne: string;
  clueTwo: string;
  customPuzzles: BridgePuzzle[];
  feedback: string;
  onAnswer: (value: string) => void;
  onClueOne: (value: string) => void;
  onClueTwo: (value: string) => void;
  onCreate: () => void;
  onPlay: (puzzle: BridgePuzzle) => void;
  onPosition: (position: BridgePosition) => void;
  position: BridgePosition;
  previewPuzzle: BridgePuzzle;
  tone: string;
}) {
  return (
    <div className="ba-creator">
      <div className="ba-creator-preview">
        <div className="ba-section-intro"><p>live preview</p><span>Exactly how your puzzle lands in play.</span></div>
        <div className="ba-puzzle-card">
          <p className="ba-instruction">{instructionFor(previewPuzzle)}</p>
          <PhraseRows puzzle={previewPuzzle} answer={answer} revealed={false} />
        </div>
      </div>
      <div className="ba-creator-form">
        <p>choose your puzzle format</p>
        <div className="ba-position-picker">
          {(["before", "after", "both"] as BridgePosition[]).map((value) => (
            <button className={position === value ? "is-current" : ""} key={value} onClick={() => onPosition(value)} type="button">{value === "both" ? "before & after" : value}</button>
          ))}
        </div>
        <label>first clue<input onChange={(event) => onClueOne(event.target.value)} placeholder="e.g. nail" value={clueOne} /></label>
        <label>second clue<input onChange={(event) => onClueTwo(event.target.value)} placeholder="e.g. steel" value={clueTwo} /></label>
        <label>answer<input maxLength={BEFORE_AFTER_ANSWER_LIMIT} onChange={(event) => onAnswer(event.target.value)} placeholder="e.g. body" value={answer} /></label>
        <button className="ba-save" onClick={onCreate} type="button">save &amp; play puzzle</button>
        <p className={`ba-feedback is-${tone}`}>{feedback}</p>
        {customPuzzles.length > 0 && (
          <div className="ba-custom-list"><span>your puzzles</span>{customPuzzles.slice(0, 5).map((puzzle) => <button key={puzzle.id} onClick={() => onPlay(puzzle)} type="button">{puzzle.clueWords.join(" · ")} <b>›</b></button>)}</div>
        )}
      </div>
    </div>
  );
}

function StatsView({ progress, customCount }: { progress: BridgeProgress; customCount: number }) {
  const solves = Object.values(progress.solved);
  const totalDuration = solves.reduce((sum, solve) => sum + solve.durationMs, 0);
  const totalSolveAttempts = solves.reduce((sum, solve) => sum + solve.attempts, 0);
  return (
    <div className="ba-stats-page">
      <StatSection title="lifetime overview" stats={[
        ["puzzles solved", String(solves.length)],
        ["lifetime attempts", String(progress.totalAttempts)],
        ["avg solve time", solves.length ? formatDuration(totalDuration / solves.length) : "--"],
        ["avg attempts", solves.length ? (totalSolveAttempts / solves.length).toFixed(1) : "--"],
      ]} />
      <StatSection title="daily challenge" accent="daily" stats={[
        ["daily streak", String(currentStreak(progress.dailyDates))],
        ["best streak", String(bestStreak(progress.dailyDates))],
        ["daily solved", String(progress.dailyDates.length)],
        ["today", progress.dailyDates.includes(bridgeDateKey(new Date())) ? "complete" : "open"],
      ]} />
      <StatSection title="custom creations" accent="create" stats={[["created", String(customCount)], ["saved locally", customCount ? "yes" : "--"]]} />
      <div className="ba-stat-section">
        <h3>pack breakdown</h3>
        <div className="ba-pack-stats">
          {bridgePacks.map((pack) => {
            const solved = pack.puzzles.filter((puzzle) => progress.solved[puzzle.id]).length;
            return <div key={pack.id}><span>{pack.name.toLowerCase()}</span><b>{solved}/{pack.puzzles.length}</b><i><span style={{ width: `${(solved / pack.puzzles.length) * 100}%` }} /></i></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function StatSection({ title, stats, accent = "statistics" }: { title: string; stats: string[][]; accent?: string }) {
  return <div className={`ba-stat-section is-${accent}`}><h3>{title}</h3><div>{stats.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></div>;
}

function ThemesView({ selected, onSelect }: { selected: ThemeId; onSelect: (theme: ThemeId) => void }) {
  return (
    <div className="ba-themes-page">
      <div className="ba-section-intro"><p>pick your atmosphere</p><span>The palette changes every Before&amp;After screen.</span></div>
      <div className="ba-theme-grid">
        {THEMES.map((theme) => (
          <button className={`ba-theme-card is-${theme.id}${selected === theme.id ? " is-current" : ""}`} key={theme.id} onClick={() => onSelect(theme.id)} type="button">
            <span className="ba-theme-swatch"><i /><i /><i /></span>
            <strong>{theme.name}</strong><small>{theme.description}</small><em>{selected === theme.id ? "selected" : "choose theme"}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ confirmReset, onConfirm, onToggle }: { confirmReset: boolean; onConfirm: () => void; onToggle: () => void }) {
  return (
    <div className="ba-settings-page">
      <div className="ba-settings-card">
        <span className="ba-settings-icon">↺</span>
        <div><h3>reset progress</h3><p>Clear solved puzzles, Daily history, attempts, and streak data. Your custom puzzles and chosen theme will stay.</p></div>
        {!confirmReset ? <button onClick={onToggle} type="button">reset progress</button> : <div className="ba-confirm"><strong>Are you sure?</strong><button onClick={onConfirm} type="button">yes, reset</button><button onClick={onToggle} type="button">cancel</button></div>}
      </div>
      <p className="ba-local-note">Before&amp;After stores progress only on this device.</p>
    </div>
  );
}

function InsightsView({ progress, session }: { progress: BridgeProgress; session: BridgeSession }) {
  const solves = Object.values(progress.solved);
  const buckets = [1, 2, 3, 4].map((attempts) => solves.filter((solve) => solve.attempts === attempts).length);
  const fivePlus = solves.filter((solve) => solve.attempts >= 5).length;
  const values = [...buckets, fivePlus];
  const max = Math.max(1, ...values);
  return (
    <div className="ba-insights-page">
      <div className="ba-insight-solution"><span>today’s bridge</span><h3>{session.puzzle.answer.toLowerCase()}</h3><p>{bridgePhrases(session.puzzle).join(" · ")}</p></div>
      <div className="ba-insight-grid">
        <article><span>attempts</span><strong>{session.attempts}</strong></article>
        <article><span>solve time</span><strong>{formatDuration(session.durationMs || 0)}</strong></article>
        <article><span>daily streak</span><strong>{currentStreak(progress.dailyDates)}</strong></article>
        <article><span>dailies solved</span><strong>{progress.dailyDates.length}</strong></article>
      </div>
      <div className="ba-attempt-chart"><div><h3>your attempt pattern</h3><p>Completed bridges on this device</p></div><div className="ba-bars">{values.map((value, index) => <span key={index}><i style={{ height: `${Math.max(7, (value / max) * 100)}%` }} /><b>{index < 4 ? index + 1 : "5+"}</b><small>{value}</small></span>)}</div></div>
      <p className="ba-insight-note">Community guesses and leaderboards are waiting for a hub-native analytics service; nothing here is fabricated.</p>
    </div>
  );
}

function Celebration({ session, onClose, onInsights, onNext }: { session: BridgeSession; onClose: () => void; onInsights?: () => void; onNext?: () => void }) {
  return (
    <div className="ba-celebration" role="dialog" aria-modal="true" aria-label="Puzzle complete">
      <div className="ba-confetti" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} />)}</div>
      <div className="ba-celebration-card">
        <button className="ba-celebration-close" onClick={onClose} type="button" aria-label="Close">×</button>
        <h2>congratulations!</h2>
        <div className="ba-solved-phrases">{bridgePhrases(session.puzzle).map((phrase) => <p key={phrase}>{phrase}</p>)}</div>
        <div className="ba-celebration-stats"><span><small>attempts</small><strong>{session.attempts}</strong></span><span><small>solve time</small><strong>{formatDuration(session.durationMs || 0)}</strong></span></div>
        {onInsights && <button className="ba-celebration-primary" onClick={onInsights} type="button">view insights</button>}
        {onNext && <button className="ba-celebration-primary" onClick={onNext} type="button">next puzzle</button>}
        <button className="ba-celebration-secondary" onClick={onClose} type="button">stay here</button>
      </div>
    </div>
  );
}
