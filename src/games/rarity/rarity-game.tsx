"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { rarityClassicPuzzles } from "./catalog";
import {
  createRaritySession,
  determineRarityTier,
  evaluateRarityAttempt,
  formatRarityScore,
  hydrateRaritySession,
  RARITY_TIER_LABELS,
  rarityDailyStorageKey,
  serializeRaritySubmission,
  validateRarityLocalRules,
  type RaritySession,
  type RaritySubmission,
} from "./engine.mjs";
import {
  selectFallbackRarityPuzzle,
  type RarityPuzzle,
} from "./puzzle-loader.mjs";
import {
  createRarityServices,
  summarizeRarityLeaderboard,
  type RarityServices,
  type RarityWordInfo,
} from "./services.mjs";
import { gameStorageKey } from "../../platform/storage";

const API_ROOT =
  "https://rminygbqxd.execute-api.us-east-1.amazonaws.com";
const RARITY_THEME_KEY = gameStorageKey("rarity", "theme");

const rarityThemes = [
  { id: "light", name: "Light", accent: "#3490dc", background: "#e6e6e6" },
  { id: "dark", name: "Dark", accent: "#4a90e2", background: "#121212" },
  { id: "forest", name: "Forest", accent: "#0f6b5f", background: "#f2f7f5" },
  { id: "lilac", name: "Lilac", accent: "#8d6cf2", background: "#f6f5fb" },
  { id: "banana", name: "Banana", accent: "#9fb44a", background: "#3a2d1a" },
  { id: "garnet", name: "Garnet", accent: "#b0122b", background: "#12090c" },
  { id: "fuchsia", name: "Fuchsia", accent: "#c08b2c", background: "#0f1116" },
  { id: "peachy", name: "Peachy", accent: "#f08a3c", background: "#fff2e4" },
] as const;

const rarityTierColors = [
  "var(--rarity-tier-1)",
  "var(--rarity-tier-2)",
  "var(--rarity-tier-3)",
  "var(--rarity-tier-4)",
  "var(--rarity-tier-5)",
  "var(--rarity-tier-6)",
];
const insightTitles = ["your word", "the field", "word weather", "score spread", "one more thing"] as const;
const keyboardRows = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["backspace", "z", "x", "c", "v", "b", "n", "m", "enter"],
] as const;

type RarityTheme = (typeof rarityThemes)[number]["id"];
type RarityView = "home" | "daily" | "how-to" | "themes" | "about" | "insights";
type LeaderboardEntry = Record<string, unknown>;

type RarityInsights = {
  entries: number;
  percentile: number | null;
  averageScore: number | null;
  bestScore: number | null;
  bestWord: string | null;
  distinctWords: number;
  mostCommonWord: string | null;
  mostCommonCount: number;
  longestWord: string | null;
  averageLength: number | null;
  yourWordCount: number;
  tierCounts: number[];
};

function entryWord(entry: LeaderboardEntry) {
  const raw = entry.word;
  if (typeof raw === "string") return raw.trim().toLowerCase();
  if (raw && typeof raw === "object" && "word" in raw) {
    const nested = (raw as { word?: unknown }).word;
    return typeof nested === "string" ? nested.trim().toLowerCase() : "";
  }
  return "";
}

function buildInsights(entries: LeaderboardEntry[], submission: RaritySubmission): RarityInsights {
  const normalized = entries
    .map((entry) => {
      const word = entryWord(entry);
      const score = Number(entry.exactScore ?? entry.rarityScore);
      if (!word || !Number.isFinite(score)) return null;
      return { word, score, tier: determineRarityTier(score) };
    })
    .filter((entry): entry is { word: string; score: number; tier: number } => Boolean(entry));
  const scores = normalized.map((entry) => entry.score);
  const averageScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : null;
  const best = normalized.reduce<(typeof normalized)[number] | null>(
    (current, entry) => (!current || entry.score > current.score ? entry : current),
    null,
  );
  const counts = new Map<string, number>();
  normalized.forEach((entry) => counts.set(entry.word, (counts.get(entry.word) ?? 0) + 1));
  const mostCommon = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const longest = normalized.reduce<string | null>(
    (current, entry) => (!current || entry.word.length > current.length ? entry.word : current),
    null,
  );
  const tierCounts = Array.from({ length: 6 }, () => 0);
  normalized.forEach((entry) => {
    tierCounts[Math.max(1, Math.min(6, entry.tier)) - 1] += 1;
  });
  const below = normalized.filter((entry) => entry.score < submission.exactScore).length;
  return {
    entries: normalized.length,
    percentile: normalized.length ? Math.round((below / normalized.length) * 100) : null,
    averageScore,
    bestScore: best?.score ?? null,
    bestWord: best?.word ?? null,
    distinctWords: counts.size,
    mostCommonWord: mostCommon?.[0] ?? null,
    mostCommonCount: mostCommon?.[1] ?? 0,
    longestWord: longest,
    averageLength: normalized.length
      ? normalized.reduce((sum, entry) => sum + entry.word.length, 0) / normalized.length
      : null,
    yourWordCount: counts.get(submission.word.toLowerCase()) ?? 0,
    tierCounts,
  };
}

function RarityGem({ small = false }: { small?: boolean }) {
  return (
    <span className={`rarity-gem${small ? " is-small" : ""}`} aria-hidden="true">
      <Image alt="" height={600} src="/rarity/logo.png" width={600} />
    </span>
  );
}

function RarityBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`rarity-brand${compact ? " is-compact" : ""}`} aria-label="Rarity">
      <RarityGem small={compact} />
      <b>rarity</b>
    </span>
  );
}

const tierDescriptions: Record<number, string> = {
  1: "Everyday language",
  2: "A little less expected",
  3: "Outside the usual rotation",
  4: "A genuinely rare find",
  5: "Top-shelf vocabulary",
  6: "Once-in-a-blue-moon territory",
};

type LeaderboardSummary = ReturnType<typeof summarizeRarityLeaderboard>;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredSubmission(dateKey: string) {
  const raw = localStorage.getItem(rarityDailyStorageKey(dateKey));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAnonymousPlayerId() {
  const key = "rarity_user_id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const id =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

function rejectionMessage(
  reason: string | null,
  token: string,
  info?: RarityWordInfo,
) {
  if (reason === "too-short") return "Words must be at least four letters.";
  if (reason === "letters-only") {
    return "Letters only—no punctuation, spaces, or numbers.";
  }
  if (reason === "token-missing") {
    return `Your word must include ${token.toUpperCase()}.`;
  }
  if (reason === "word-invalid") {
    return info?.error === "word-service-unavailable"
      ? "The dictionary is unavailable right now. Your turn is still safe."
      : info?.error || "That word could not be validated. Your turn is still safe.";
  }
  return "That word could not be submitted. Your turn is still safe.";
}

function HighlightedWord({
  word,
  token,
}: {
  word: string;
  token: string;
}) {
  const index = word.toLowerCase().indexOf(token.toLowerCase());
  if (index < 0) return word;
  return (
    <>
      {word.slice(0, index)}
      <mark>{word.slice(index, index + token.length)}</mark>
      {word.slice(index + token.length)}
    </>
  );
}

function buildShareText(
  session: RaritySession,
  submission: RaritySubmission,
) {
  return [
    `Rarity · ${session.puzzleDate}`,
    `${formatRarityScore(submission.exactScore)} / 100`,
    RARITY_TIER_LABELS[submission.tier],
    "●".repeat(Math.max(1, submission.tier)),
    window.location.href,
  ].join("\n");
}

async function loadLeaderboardData(
  services: RarityServices,
  dateKey: string,
  score: number,
) {
  try {
    const entries = (await services.fetchDailyLeaderboard(dateKey)) as LeaderboardEntry[];
    return { entries, summary: summarizeRarityLeaderboard(entries, score) };
  } catch {
    return {
      entries: [] as LeaderboardEntry[],
      summary: { total: 0, percentile: null, bestScore: null },
    };
  }
}

export function RarityGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const services = useMemo(
    () =>
      createRarityServices({
        fetcher: fetch,
        wordInfoApi: `${API_ROOT}/wordinfo`,
        puzzleApi: `${API_ROOT}/puzzle`,
        leaderboardApi: `${API_ROOT}/leaderboard`,
      }),
    [],
  );
  const [session, setSession] = useState<RaritySession | null>(null);
  const [displayDate, setDisplayDate] = useState("");
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(
    "One valid word. Make it as rare as you can.",
  );
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardSummary | null>(
    null,
  );
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [view, setView] = useState<RarityView>("home");
  const [theme, setTheme] = useState<RarityTheme>("light");
  const [insightIndex, setInsightIndex] = useState(0);
  const insights = useMemo(
    () => session?.submission ? buildInsights(leaderboardEntries, session.submission) : null,
    [leaderboardEntries, session],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      const dateKey = localDateKey();
      const fallback = selectFallbackRarityPuzzle(
        rarityClassicPuzzles,
        dateKey,
      );
      let puzzle: RarityPuzzle = fallback;
      try {
        puzzle = (await services.fetchDailyPuzzle(dateKey)) ?? fallback;
      } catch {
        puzzle = fallback;
      }
      if (cancelled) return;

      const stored = readStoredSubmission(dateKey);
      const storedTheme = localStorage.getItem(RARITY_THEME_KEY);
      if (rarityThemes.some((choice) => choice.id === storedTheme)) {
        setTheme(storedTheme as RarityTheme);
      }
      const nextSession = stored
        ? hydrateRaritySession({
            payload: stored,
            puzzle,
            puzzleDate: dateKey,
          })
        : createRaritySession({ puzzle, puzzleDate: dateKey });

      setDisplayDate(
        new Intl.DateTimeFormat(undefined, {
          month: "long",
          day: "numeric",
          year: "numeric",
        }).format(new Date()),
      );
      setSession(nextSession);
      setFeedback(
        nextSession.hasSubmitted
          ? "Today’s word is locked in."
          : "One valid word. Make it as rare as you can.",
      );

      if (nextSession.submission) {
        const data = await loadLeaderboardData(
          services,
          dateKey,
          nextSession.submission.exactScore,
        );
        if (!cancelled) {
          setLeaderboard(data.summary);
          setLeaderboardEntries(data.entries);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [services]);

  function chooseTheme(nextTheme: RarityTheme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem(RARITY_THEME_KEY, nextTheme);
    } catch {
      // Theme selection remains available when device storage is unavailable.
    }
  }

  function openView(nextView: RarityView) {
    if (nextView === "insights" && !session?.submission) return;
    setView(nextView);
    setShareStatus("");
    if (nextView === "insights") setInsightIndex(0);
    if (nextView === "daily" && !session?.hasSubmitted) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleKeyboardKey(key: (typeof keyboardRows)[number][number]) {
    if (!session || session.hasSubmitted || isChecking) return;
    if (key === "backspace") {
      setGuess((current) => current.slice(0, -1));
    } else if (key === "enter") {
      formRef.current?.requestSubmit();
    } else {
      setGuess((current) => `${current}${key}`);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submitResultToLeaderboard(
    activeSession: RaritySession,
    submission: RaritySubmission,
  ) {
    try {
      const payload = {
        action: "submit",
        userId: getAnonymousPlayerId(),
        displayName: "Player",
        userType: "anonymous",
        puzzleDate: activeSession.puzzleDate,
        puzzleString: activeSession.puzzle.puzzleString,
        word: submission.word,
        frequency: submission.frequency,
        exactScore: submission.exactScore,
        tier: submission.tier,
        definition: submission.definition || null,
        partOfSpeech: submission.partOfSpeech || null,
        shortDefinitions: submission.shortDefinitions || [],
        wordLength: submission.word.length,
        timestamp: submission.timestamp,
      };
      await services.submitDailyResult(payload);
      const data = await loadLeaderboardData(
        services,
        activeSession.puzzleDate,
        submission.exactScore,
      );
      setLeaderboard(data.summary);
      setLeaderboardEntries(data.entries);
    } catch {
      setLeaderboard({ total: 0, percentile: null, bestScore: null });
      setLeaderboardEntries([]);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || session.hasSubmitted || isChecking) return;

    const candidate = guess.trim().toLowerCase();
    const local = validateRarityLocalRules(
      candidate,
      session.puzzle.puzzleString,
    );
    setShareStatus("");
    if (!local.valid) {
      setFeedback(
        rejectionMessage(local.reason, session.puzzle.puzzleString),
      );
      setFeedbackTone("error");
      return;
    }

    setIsChecking(true);
    setFeedback(`Checking ${candidate}…`);
    setFeedbackTone("neutral");

    let wordInfo: RarityWordInfo;
    try {
      wordInfo = await services.validateWord(candidate);
    } catch {
      wordInfo = {
        isValid: false,
        frequency: Number.NaN,
        definition: null,
        partOfSpeech: null,
        shortDefinitions: [],
        allShortDefinitions: [],
        allPartsOfSpeech: [],
        definitionCount: 0,
        partOfSpeechCount: 0,
        definitionsByPartOfSpeech: {},
        usageLabels: [],
        etymology: [],
        examples: [],
        scoreExplanation: null,
        error: "word-service-unavailable",
      };
    }

    const result = evaluateRarityAttempt({
      state: session,
      puzzleString: session.puzzle.puzzleString,
      word: candidate,
      wordInfo,
      timestamp: new Date().toISOString(),
    });
    setIsChecking(false);

    if (!result.accepted) {
      setFeedback(
        rejectionMessage(
          result.reason,
          session.puzzle.puzzleString,
          wordInfo,
        ),
      );
      setFeedbackTone("error");
      inputRef.current?.focus();
      return;
    }

    setSession(result.state);
    setGuess("");
    setFeedback(
      `${RARITY_TIER_LABELS[result.submission.tier]}. Your word is locked in.`,
    );
    setFeedbackTone("success");
    try {
      localStorage.setItem(
        rarityDailyStorageKey(session.puzzleDate),
        JSON.stringify(
          serializeRaritySubmission(
            session.puzzle.puzzleString,
            result.submission,
          ),
        ),
      );
    } catch {
      // The accepted result remains visible if browser storage is unavailable.
    }
    void submitResultToLeaderboard(result.state, result.submission);
  }

  async function handleShare() {
    if (!session?.submission) return;
    const text = buildShareText(session, session.submission);
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

  if (!session) {
    return (
      <div className="rarity-game-card rarity-game-loading" aria-busy="true">
        Preparing today’s string…
      </div>
    );
  }

  const token = session.puzzle.puzzleString.toUpperCase();
  const submission = session.submission;
  const tier = submission?.tier ?? 1;
  const scoreSpreadMaximum = insights ? Math.max(1, ...insights.tierCounts) : 1;

  return (
    <section
      className={`rarity-game-card rarity-tier-${tier}`}
      data-rarity-theme={theme}
      style={
        {
          "--rarity-score-fill": submission ? `${submission.exactScore}%` : "0%",
        } as React.CSSProperties
      }
      aria-label={view === "daily" ? "Daily Rarity" : "Rarity"}
    >
      {view === "home" ? (
        <div className="rarity-home">
          <main className="rarity-home-hero">
            <RarityBrand />
            <p className="rarity-home-kicker">daily rarity · {displayDate}</p>
            <h2 aria-label={`Today’s string ${token}`}>{token}</h2>
            <p>Can you find the rarest word containing today’s string?</p>
            <button className="rarity-primary" onClick={() => openView("daily")}>
              {submission ? "view today’s result" : "play daily"}
            </button>
          </main>

          <nav className="rarity-home-actions" aria-label="Rarity menu">
            <button onClick={() => openView("how-to")}>
              <b>how to play</b><span>one word. make it count.</span>
            </button>
            <button onClick={() => openView("themes")}>
              <b>themes</b><span>choose your gem colors</span>
            </button>
            <button onClick={() => openView("about")}>
              <b>about</b><span>where rarity comes from</span>
            </button>
            <button
              className={submission ? "is-unlocked" : "is-locked"}
              disabled={!submission}
              onClick={() => openView("insights")}
            >
              <b>daily insights</b>
              <span>{submission ? "see how your word traveled" : "unlock after playing"}</span>
            </button>
          </nav>
        </div>
      ) : view === "daily" ? (
        <div className="rarity-daily">
          <header className="rarity-local-header">
            <button className="rarity-back" onClick={() => openView("home")} aria-label="Return to Rarity menu">←</button>
            <RarityBrand compact />
            <span>{submission ? "locked in" : "one submission"}</span>
          </header>

          <main className="rarity-play-layout">
            <section className="rarity-daily-panel" aria-label="Today’s challenge">
              {!submission ? (
                <>
                  <p className="rarity-panel-kicker">today’s puzzle · {displayDate}</p>
                  <h2 className="rarity-daily-string" aria-label={`Daily string ${token}`}>{token}</h2>
                  <p className="rarity-daily-prompt">enter one valid word containing these letters</p>

                  <form ref={formRef} className="rarity-entry rarity-entry-minimal" onSubmit={handleSubmit}>
                    <label htmlFor="rarity-guess">your entry</label>
                    <div className="rarity-input-minimal" onClick={() => inputRef.current?.focus()}>
                      <div className={`rarity-input-display${guess ? "" : " is-empty"}`} aria-hidden="true">
                        {guess ? <HighlightedWord word={guess} token={session.puzzle.puzzleString} /> : "type your word"}
                      </div>
                      <input
                        ref={inputRef}
                        id="rarity-guess"
                        value={guess}
                        onChange={(event) => setGuess(event.target.value.replace(/[^a-z]/gi, ""))}
                        minLength={4}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        disabled={isChecking}
                      />
                    </div>
                    <p className="rarity-input-hint">{isChecking ? "checking your word…" : "press enter to submit"}</p>
                    <div className="rarity-keyboard" aria-label="On-screen keyboard">
                      {keyboardRows.map((row, rowIndex) => (
                        <div key={rowIndex}>
                          {row.map((key) => (
                            <button
                              key={key}
                              type="button"
                              className={key === "backspace" || key === "enter" ? "is-wide" : ""}
                              onClick={() => handleKeyboardKey(key)}
                              disabled={isChecking}
                              aria-label={key === "backspace" ? "Backspace" : key}
                            >
                              {key === "backspace" ? "⌫" : key}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </form>
                </>
              ) : (
                <div className="rarity-result-summary">
                  <p className="rarity-panel-kicker">your word</p>
                  <h2><HighlightedWord word={submission.word} token={session.puzzle.puzzleString} /></h2>
                  {submission.partOfSpeech || submission.definition ? (
                    <p className="rarity-result-definition">
                      {submission.partOfSpeech ? <em>{submission.partOfSpeech}</em> : null}
                      {submission.definition ?? "definition unavailable"}
                    </p>
                  ) : null}
                  <div className="rarity-result-scoreline">
                    <strong>{formatRarityScore(submission.exactScore)}</strong><span>/ 100</span>
                  </div>
                  <div className="rarity-result-tier">
                    <b>{RARITY_TIER_LABELS[tier]}</b><span>{tierDescriptions[tier]}</span>
                  </div>
                  <button className="rarity-primary" onClick={() => openView("insights")}>view your daily insights <span aria-hidden="true">→</span></button>
                </div>
              )}

              <p className={`rarity-feedback is-${feedbackTone}`} aria-live="polite" role="status">{feedback}</p>
            </section>

            <aside className="rarity-side-panel">
              {!submission ? (
                <>
                  <p className="rarity-panel-kicker">one move only</p>
                  <h2>Make your word count.</h2>
                  <p>Invalid words are free to test. Your first valid word is final, and less common words travel farther up the scale.</p>
                  <div className="rarity-tier-ladder" aria-label="Six rarity tiers">
                    {rarityTierColors.map((color, index) => (
                      <div key={color} style={{ "--tier-color": color } as React.CSSProperties}>
                        <i /><span>{RARITY_TIER_LABELS[index + 1]}</span><small>{index + 1}</small>
                      </div>
                    ))}
                  </div>
                  <button className="rarity-text-action" onClick={() => openView("how-to")}>how does scoring work? <span aria-hidden="true">→</span></button>
                </>
              ) : (
                <>
                  <p className="rarity-panel-kicker">today’s field</p>
                  {leaderboard ? (
                    <div className="rarity-field-preview">
                      <strong>{leaderboard.percentile !== null ? `${leaderboard.percentile}%` : "—"}</strong>
                      <span>{leaderboard.percentile !== null ? "of today’s scores fell below yours" : "waiting for more players"}</span>
                    </div>
                  ) : <p aria-busy="true">checking today’s field…</p>}
                  <div className="rarity-tier-track" aria-label="Your rarity tier">
                    {rarityTierColors.map((color, index) => <span className={index + 1 === tier ? "is-current" : ""} style={{ "--tier-color": color } as React.CSSProperties} key={color} />)}
                  </div>
                  <button className="rarity-primary" onClick={handleShare}>share result <span aria-hidden="true">↗</span></button>
                  <span className="rarity-share-status" role="status">{shareStatus}</span>
                </>
              )}
            </aside>
          </main>
        </div>
      ) : view === "insights" && submission && insights ? (
        <div className="rarity-insights-view">
          <header className="rarity-local-header">
            <button className="rarity-back" onClick={() => openView("daily")} aria-label="Return to today’s result">←</button>
            <RarityBrand compact />
            <span>{insightIndex + 1} / {insightTitles.length}</span>
          </header>

          <main className="rarity-insights-shell">
            <button className="rarity-insight-arrow is-back" onClick={() => setInsightIndex((current) => Math.max(0, current - 1))} disabled={insightIndex === 0} aria-label="Previous insight">‹</button>
            <article className="rarity-insight-panel" aria-live="polite">
              <p className="rarity-panel-kicker">daily insights</p>
              <h2>{insightTitles[insightIndex]}</h2>

              {insightIndex === 0 ? (
                <div className="rarity-insight-summary">
                  <div className="rarity-mini-score" style={{ "--rarity-score": `${submission.exactScore * 3.6}deg` } as React.CSSProperties}>
                    <strong>{formatRarityScore(submission.exactScore, 1)}</strong><span>/100</span>
                  </div>
                  <div>
                    <h3><HighlightedWord word={submission.word} token={session.puzzle.puzzleString} /></h3>
                    <p>{submission.definition ?? "Definition unavailable."}</p>
                    <b>{RARITY_TIER_LABELS[tier]}</b>
                  </div>
                </div>
              ) : insightIndex === 1 ? (
                <div className="rarity-insight-stats">
                  <div><strong>{insights.percentile ?? "—"}{insights.percentile !== null ? "%" : ""}</strong><span>scores below yours</span></div>
                  <div><strong>{insights.averageScore !== null ? insights.averageScore.toFixed(1) : "—"}</strong><span>field average</span></div>
                  <div><strong>{insights.bestScore !== null ? insights.bestScore.toFixed(1) : "—"}</strong><span>best today</span></div>
                  <div><strong>{insights.entries}</strong><span>{insights.entries === 1 ? "player" : "players"} compared</span></div>
                </div>
              ) : insightIndex === 2 ? (
                <div className="rarity-word-weather">
                  <div><span>most common answer</span><strong>{insights.mostCommonWord ?? "waiting…"}</strong><small>{insights.mostCommonCount ? `${insights.mostCommonCount} players` : "more entries needed"}</small></div>
                  <div><span>longest answer</span><strong>{insights.longestWord ?? "waiting…"}</strong><small>{insights.averageLength !== null ? `${insights.averageLength.toFixed(1)} letters on average` : "more entries needed"}</small></div>
                  <div><span>different answers</span><strong>{insights.distinctWords || "—"}</strong><small>{insights.yourWordCount > 1 ? `${insights.yourWordCount} people found your word` : "your word may be one of a kind"}</small></div>
                </div>
              ) : insightIndex === 3 ? (
                <div className="rarity-spread" aria-label="Today’s entries by rarity tier">
                  {insights.tierCounts.map((count, index) => (
                    <div key={index}>
                      <span style={{ height: `${Math.max(6, (count / scoreSpreadMaximum) * 100)}%`, "--tier-color": rarityTierColors[index] } as React.CSSProperties}><b>{count}</b></span>
                      <small>{RARITY_TIER_LABELS[index + 1]}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rarity-insight-finale">
                  <RarityGem />
                  <h3>{insights.bestScore !== null && submission.exactScore >= insights.bestScore ? "You found today’s benchmark." : "Every word changes the field."}</h3>
                  <p>{insights.bestWord && insights.bestScore !== null ? `Today’s current high is ${insights.bestWord} at ${insights.bestScore.toFixed(1)}. Your ${submission.word} adds another path through the puzzle.` : "Come back later to see how today’s field develops."}</p>
                  <div>
                    <button className="rarity-primary" onClick={handleShare}>share result ↗</button>
                    <button className="rarity-text-action" onClick={() => openView("home")}>back to rarity</button>
                  </div>
                  <span role="status">{shareStatus}</span>
                </div>
              )}
            </article>
            <button className="rarity-insight-arrow is-next" onClick={() => setInsightIndex((current) => Math.min(insightTitles.length - 1, current + 1))} disabled={insightIndex === insightTitles.length - 1} aria-label="Next insight">›</button>
            <div className="rarity-insight-progress" aria-label="Insight progress">
              {insightTitles.map((title, index) => <button key={title} className={index === insightIndex ? "is-current" : ""} onClick={() => setInsightIndex(index)} aria-label={`View ${title}`} />)}
            </div>
          </main>
        </div>
      ) : (
        <div className="rarity-info-view">
          <header className="rarity-local-header">
            <button className="rarity-back" onClick={() => openView("home")} aria-label="Return to Rarity menu">←</button>
            <RarityBrand compact />
          </header>
          <article className="rarity-info-card">
            <p className="rarity-panel-kicker">rarity</p>
            <h2>{view === "how-to" ? "how to play" : view}</h2>
            {view === "how-to" ? (
              <div className="rarity-prose">
                <p>Each day gives you a short string of letters. Enter one dictionary word that contains that string anywhere inside it.</p>
                <div className="rarity-rule-example"><strong>{token}</strong><span>one valid word · one final score</span></div>
                <p>Invalid attempts never use your turn. Your first valid word locks, so decide when you are ready to submit it.</p>
                <p>Words seen less often in published language receive higher scores. Scores move through six tiers from Very common to Legendary.</p>
                <button className="rarity-primary" onClick={() => openView("daily")}>play today’s puzzle</button>
              </div>
            ) : view === "themes" ? (
              <div className="rarity-theme-grid" role="radiogroup" aria-label="Choose a Rarity theme">
                {rarityThemes.map((choice) => (
                  <button key={choice.id} role="radio" aria-checked={theme === choice.id} className={theme === choice.id ? "is-selected" : ""} onClick={() => chooseTheme(choice.id)}>
                    <span style={{ background: choice.background }}><i style={{ background: choice.accent }} /><i /><i /><i /><i /><i /></span>
                    <b>{choice.name}</b><small>{theme === choice.id ? "selected" : "select"}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rarity-prose">
                <p>Rarity is a daily vocabulary game by Mario Gerardi about the strange, specific, and surprising words hiding beyond everyday language.</p>
                <p>The puzzle is intentionally small: one letter string and one final word. The fun begins when your answer joins the field and the daily insights reveal how everyone approached it.</p>
                <p>This hub edition preserves classic Rarity’s scoring, tiers, dictionary context, and live comparisons.</p>
                <button className="rarity-primary" onClick={() => openView("daily")}>play rarity</button>
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
