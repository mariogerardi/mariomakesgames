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
  type RarityServices,
  type RarityWordInfo,
} from "./services.mjs";
import { gameStorageKey } from "../../platform/storage";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import styles from "./rarity.module.css";

const API_ROOT =
  "https://rminygbqxd.execute-api.us-east-1.amazonaws.com";
const RARITY_THEME_KEY = gameStorageKey("rarity", "theme");

const rarityThemes = [
  { id: "light", name: "light", accent: "#7b4eb2", accent2: "#c95483", background: "#f4ede5", surface: "#fffaf4", input: "#fffdf8", border: "#d5c2c7", text: "#2f2434", muted: "#746775", tiers: ["#2f8f83", "#4776b8", "#6a60c8", "#8d52b5", "#b6467a", "#d94f52"] },
  { id: "dark", name: "dark", accent: "#4a90e2", accent2: "#3ea6fc", background: "#121212", surface: "#1e1e1e", input: "#222222", border: "#444444", text: "#eeeeee", muted: "#aaaaaa", tiers: ["#4a90e2", "#5f80e4", "#7a6ad6", "#9154bc", "#a0428c", "#dc143c"] },
  { id: "forest", name: "forest", accent: "#0f6b5f", accent2: "#18a999", background: "#f2f7f5", surface: "#e6f0ed", input: "#f7fbfa", border: "#bfd5cf", text: "#13352f", muted: "#5b726d", tiers: ["#18a999", "#2fb47c", "#7bd389", "#f2c14e", "#e07a5f", "#d2691e"] },
  { id: "fuchsia", name: "alloy", accent: "#c08b2c", accent2: "#d6b57a", background: "#0f1116", surface: "#1a1f28", input: "#141a22", border: "#2f3744", text: "#e7ebf0", muted: "#aab2bd", tiers: ["#53606d", "#6a7580", "#7a6c52", "#8a6a3f", "#6b3b2e", "#d2691e"] },
  { id: "lilac", name: "lilac", accent: "#8d6cf2", accent2: "#b794ff", background: "#f6f5fb", surface: "#f0ecfb", input: "#faf8ff", border: "#ded9ee", text: "#31263f", muted: "#746b7e", tiers: ["#3fa36b", "#5fbf84", "#9d85f5", "#7e66e8", "#5a45c8", "#f2c94c"] },
  { id: "garnet", name: "garnet", accent: "#b0122b", accent2: "#e0435a", background: "#12090c", surface: "#1f0f15", input: "#1a0c12", border: "#332026", text: "#f7e8e8", muted: "#c6aeb5", tiers: ["#e46b7a", "#c63b4a", "#9f1f33", "#781125", "#520b18", "#f2c94c"] },
  { id: "peachy", name: "oasis", accent: "#f08a3c", accent2: "#4a90e2", background: "#fff2e4", surface: "#ffe2c7", input: "#fff0db", border: "#f1c7a0", text: "#4a2b12", muted: "#85694e", tiers: ["#c4581b", "#e8772f", "#d7a133", "#5c8fd6", "#2e4fa3", "#228b22"] },
  { id: "banana", name: "banana", accent: "#9fb44a", accent2: "#ffd56a", background: "#3a2d1a", surface: "#2f2414", input: "#2c2212", border: "#5a4727", text: "#fff3d6", muted: "#d4c29e", tiers: ["#9fb44a", "#e8b845", "#c99533", "#9c6a22", "#6d4418", "#228b22"] },
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

const rarityViews: RarityView[] = ["home", "daily", "how-to", "themes", "about", "insights"];

function rarityViewFromUrl() {
  if (typeof window === "undefined") return "home";
  const candidate = new URL(window.location.href).searchParams.get("view");
  return rarityViews.includes(candidate as RarityView)
    ? (candidate as RarityView)
    : "home";
}

function rarityUrlForView(nextView: RarityView) {
  const url = new URL(window.location.href);
  if (nextView === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", nextView);
  return url;
}

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
  1: "everyday language",
  2: "a little less expected",
  3: "outside the usual rotation",
  4: "a genuinely rare find",
  5: "top-shelf vocabulary",
  6: "once-in-a-blue-moon territory",
};

const tierFeedback: Record<number, string> = {
  1: "a familiar find. there is always tomorrow to reach farther.",
  2: "not quite ordinary—you gave the field something to work with.",
  3: "you found something outside the usual rotation. nicely done.",
  4: "rare territory. that is an impressive pull.",
  5: "a top-shelf word. this one traveled.",
  6: "once-in-a-blue-moon territory. an extraordinary find.",
};

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
  if (reason === "too-short") return "words must be at least four letters.";
  if (reason === "letters-only") {
    return "letters only—no punctuation, spaces, or numbers.";
  }
  if (reason === "token-missing") {
    return `your word must include ${token.toLowerCase()}.`;
  }
  if (reason === "word-invalid") {
    return info?.error === "word-service-unavailable"
      ? "the dictionary is unavailable right now. your turn is still safe."
      : info?.error || "that word could not be validated. your turn is still safe.";
  }
  return "that word could not be submitted. your turn is still safe.";
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
) {
  try {
    return (await services.fetchDailyLeaderboard(dateKey)) as LeaderboardEntry[];
  } catch {
    return [] as LeaderboardEntry[];
  }
}

export function RarityGame() {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const viewHeadingRef = useRef<HTMLHeadingElement>(null);
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
    "one valid word. make it as rare as you can.",
  );
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [view, setView] = useState<RarityView>("home");
  const [theme, setTheme] = useState<RarityTheme>("light");
  const [insightIndex, setInsightIndex] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
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
          ? "today’s word is locked in."
          : "one valid word. make it as rare as you can.",
      );

      if (nextSession.submission) {
        const entries = await loadLeaderboardData(services, dateKey);
        if (!cancelled) {
          setLeaderboardEntries(entries);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [services]);

  const sessionReady = session !== null;
  const hasSubmission = Boolean(session?.submission);

  useEffect(() => {
    const syncView = () => {
      const requestedView = rarityViewFromUrl();
      if (requestedView === "insights" && !hasSubmission) {
        setView("home");
        if (sessionReady) {
          window.history.replaceState({}, "", rarityUrlForView("home"));
        }
      } else {
        if (requestedView === "daily" && hasSubmission) {
          setDisplayScore(0);
          setIsRevealing(false);
        } else if (requestedView !== "daily") {
          setIsRevealing(false);
        }
        setView(requestedView);
        setShareStatus("");
        if (requestedView === "insights") setInsightIndex(0);
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, [hasSubmission, sessionReady]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      if (view === "daily" && !session?.hasSubmitted) {
        inputRef.current?.focus();
      } else {
        viewHeadingRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [session?.hasSubmitted, view]);

  useEffect(() => {
    const submission = session?.submission;
    if (!submission || view !== "daily") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animationFrame = requestAnimationFrame(() => {
        setDisplayScore(submission.exactScore);
        setIsRevealing(false);
      });
      return () => cancelAnimationFrame(animationFrame);
    }
    const duration = 1200;
    let animationFrame = 0;
    let revealTimer = 0;
    animationFrame = requestAnimationFrame((startedAt) => {
      setDisplayScore(0);
      setIsRevealing(true);

      const step = (now: number) => {
        const elapsed = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        setDisplayScore(submission.exactScore * eased);
        if (elapsed < 1) {
          animationFrame = requestAnimationFrame(step);
        } else {
          setDisplayScore(submission.exactScore);
        }
      };

      animationFrame = requestAnimationFrame(step);
      revealTimer = window.setTimeout(() => setIsRevealing(false), 1900);
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(revealTimer);
    };
  }, [session?.submission, view]);

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
    if (nextView === view) return;
    window.history.pushState({}, "", rarityUrlForView(nextView));
    if (nextView !== "daily") setIsRevealing(false);
    if (nextView === "daily" && session?.submission) {
      setDisplayScore(0);
      setIsRevealing(false);
    }
    setView(nextView);
    setShareStatus("");
    if (nextView === "insights") setInsightIndex(0);
    window.scrollTo({ top: 0, behavior: "instant" });
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
      const entries = await loadLeaderboardData(services, activeSession.puzzleDate);
      setLeaderboardEntries(entries);
    } catch {
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
      tierFeedback[result.submission.tier],
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

  if (!session) {
    return (
      <div className="rarity-game-card rarity-game-loading" aria-busy="true">
        preparing today’s string…
      </div>
    );
  }

  const token = session.puzzle.puzzleString.toUpperCase();
  const submission = session.submission;
  const tier = submission?.tier ?? 1;
  const scoreSpreadMaximum = insights ? Math.max(1, ...insights.tierCounts) : 1;
  const activeTheme = rarityThemes.find((choice) => choice.id === theme) ?? rarityThemes[0];
  const themeStyle = {
    "--rarity-accent": activeTheme.accent,
    "--rarity-accent-2": activeTheme.accent2,
    "--rarity-bg": activeTheme.background,
    "--rarity-surface": activeTheme.surface,
    "--rarity-input": activeTheme.input,
    "--rarity-border": activeTheme.border,
    "--rarity-text": activeTheme.text,
    "--rarity-muted": activeTheme.muted,
    "--rarity-score-fill": submission ? `${displayScore}%` : "0%",
    ...Object.fromEntries(activeTheme.tiers.map((color, index) => [`--rarity-tier-${index + 1}`, color])),
  } as React.CSSProperties;

  return (
    <section
      className={`${styles.root} rarity-game-card rarity-tier-${tier}${isRevealing ? " is-revealing" : ""}`}
      data-rarity-theme={theme}
      data-rarity-view={view}
      style={themeStyle}
      aria-label={view === "daily" ? "Daily Rarity" : "Rarity"}
    >
      <GameLocalBar
        ariaLabel="Rarity"
        brand={<RarityBrand compact />}
        className="game-local-bar--rarity"
        items={[
          { label: "home", current: view === "home", onSelect: () => openView("home") },
          { label: "daily", current: view === "daily", onSelect: () => openView("daily") },
          { label: "how to play", current: view === "how-to", onSelect: () => openView("how-to") },
          { label: "themes", current: view === "themes", onSelect: () => openView("themes") },
          { label: "about", current: view === "about", onSelect: () => openView("about") },
          { label: "insights", current: view === "insights", disabled: !submission, onSelect: () => openView("insights") },
        ]}
        onHome={() => openView("home")}
      />
      {view === "home" ? (
        <div className="rarity-home">
          <main className="rarity-home-hero">
            <RarityBrand />
            <p className="rarity-home-kicker">daily rarity · {displayDate}</p>
            <h2 ref={viewHeadingRef} tabIndex={-1} aria-label={`Today’s string ${token}`}>{token}</h2>
            <p>can you find the rarest word containing today’s string?</p>
            <button className="rarity-primary" onClick={() => openView("daily")}>
              {submission ? "view today’s result" : "play daily"}
            </button>
          </main>

          <nav className="rarity-home-actions" aria-label="Rarity menu">
            <button onClick={() => openView("how-to")}>
              <b>how to play</b><span>one word. make it count.</span>
            </button>
            <button onClick={() => openView("themes")}>
              <b>themes</b><span>choose your colors</span>
            </button>
            <button onClick={() => openView("about")}>
              <b>about</b><span>the idea behind rarity</span>
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
          <main className="rarity-play-layout" aria-label="Today’s challenge">
            <div className="rarity-daily-tools">
              <button className="rarity-text-action" onClick={() => openView("home")}>← back</button>
              {!submission ? <button className="rarity-text-action" onClick={() => openView("how-to")}>how do i play? <span aria-hidden="true">?</span></button> : null}
            </div>
            <section className={`rarity-daily-panel${submission ? " is-result" : ""}`}>
              {!submission ? (
                <>
                  <p className="rarity-panel-kicker">today’s puzzle · {displayDate}</p>
                  <h2 ref={viewHeadingRef} tabIndex={-1} className="rarity-daily-string" aria-label={`Daily string ${token}`}>{token}</h2>

                  <form ref={formRef} className="rarity-entry rarity-entry-minimal" onSubmit={handleSubmit}>
                    <div className="rarity-input-minimal" onClick={() => inputRef.current?.focus()}>
                      <div className={`rarity-input-display${guess ? "" : " is-empty"}`} aria-hidden="true">
                        {guess ? <HighlightedWord word={guess} token={session.puzzle.puzzleString} /> : ""}
                      </div>
                      <input
                        ref={inputRef}
                        id="rarity-guess"
                        aria-label="your entry"
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
                    <div className="rarity-live-score" aria-label="current rarity score"><strong>0.0000</strong><span>points</span></div>
                    <div className="rarity-keyboard" aria-label="On-screen keyboard">
                      {keyboardRows.map((row, rowIndex) => (
                        <div key={rowIndex}>
                          {row.map((key) => (
                            <button
                              key={key}
                              type="button"
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
                  <p className="rarity-panel-kicker">your entry</p>
                  <h2 ref={viewHeadingRef} tabIndex={-1}><HighlightedWord word={submission.word} token={session.puzzle.puzzleString} /></h2>
                  {submission.partOfSpeech || submission.definition ? (
                    <p className="rarity-result-definition">
                      {submission.partOfSpeech ? <em>{submission.partOfSpeech}</em> : null}
                      {submission.definition ?? "definition unavailable"}
                    </p>
                  ) : null}
                  <div className="rarity-result-scoreline">
                    <strong>{formatRarityScore(displayScore)}</strong><span>points</span>
                  </div>
                  <div className="rarity-result-tier">
                    <b>{RARITY_TIER_LABELS[tier]}</b><span>{tierDescriptions[tier]}</span>
                  </div>
                  <div className="rarity-tier-track" aria-label="your rarity tier">
                    {rarityTierColors.map((color, index) => <span className={index + 1 === tier ? "is-current" : ""} style={{ "--tier-color": color } as React.CSSProperties} key={color} />)}
                  </div>
                  <p className="rarity-result-message">{tierFeedback[tier]}</p>
                  <div className="rarity-result-actions">
                    <button className="rarity-insights-invitation rarity-result-primary" onClick={() => openView("insights")}>view your daily insights <span aria-hidden="true">→</span></button>
                    <button className="rarity-result-secondary" onClick={handleShare}>share result <span aria-hidden="true">↗</span></button>
                  </div>
                  <span className="rarity-share-status" role="status">{shareStatus}</span>
                </div>
              )}

              <p className={`rarity-feedback is-${feedbackTone}`} aria-live="polite" role="status">{submission ? "" : feedback}</p>
            </section>
          </main>
        </div>
      ) : view === "insights" && submission && insights ? (
        <div className="rarity-insights-view">
          <main className="rarity-insights-shell">
            <button className="rarity-insight-arrow is-back" onClick={() => setInsightIndex((current) => Math.max(0, current - 1))} disabled={insightIndex === 0} aria-label="Previous insight">‹</button>
            <article className="rarity-insight-panel" key={insightIndex} aria-live="polite">
              <p className="rarity-panel-kicker">daily insights</p>
              <h2 ref={viewHeadingRef} tabIndex={-1}>{insightTitles[insightIndex]}</h2>

              {insightIndex === 0 ? (
                <div className="rarity-insight-summary">
                  <div className="rarity-mini-score" style={{ "--rarity-score": `${submission.exactScore * 3.6}deg` } as React.CSSProperties}>
                    <strong>{formatRarityScore(submission.exactScore, 1)}</strong><span>/100</span>
                  </div>
                  <div>
                    <h3><HighlightedWord word={submission.word} token={session.puzzle.puzzleString} /></h3>
                    <p>{submission.definition ?? "definition unavailable."}</p>
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
                  <p className="rarity-finale-verdict">{insights.bestScore !== null && submission.exactScore >= insights.bestScore ? "you found today’s benchmark." : "every word changes the field."}</p>
                  <h3>{insights.bestWord ?? submission.word} · {formatRarityScore(insights.bestScore ?? submission.exactScore, 1)}</h3>
                  <p>{insights.bestWord && insights.bestScore !== null ? `today’s current high is ${insights.bestWord} at ${insights.bestScore.toFixed(1)}. your ${submission.word} adds another path through the puzzle.` : "come back later to see how today’s field develops."}</p>
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
          <article className="rarity-info-card">
            <p className="rarity-panel-kicker">rarity</p>
            <h2 ref={viewHeadingRef} tabIndex={-1}>{view === "how-to" ? "how to play" : view}</h2>
            {view === "how-to" ? (
              <div className="rarity-how">
                <p className="rarity-how-intro">one small string. one carefully chosen word. one place in today’s field.</p>
                <div className="rarity-how-steps">
                  <section>
                    <span>01</span><b>find the string</b>
                    <strong>{token}</strong>
                    <p>today gives everyone the same letters.</p>
                  </section>
                  <section>
                    <span>02</span><b>choose one word</b>
                    <strong>your call</strong>
                    <p>it must contain the string anywhere inside.</p>
                  </section>
                  <section>
                    <span>03</span><b>find its rarity</b>
                    <strong>72.4</strong>
                    <p>less familiar words earn a higher score.</p>
                  </section>
                </div>
                <div className="rarity-how-note"><b>good to know</b><span>invalid attempts never use your turn. your first valid word locks—and is final.</span></div>
                <div className="rarity-how-tier-track" aria-label="six rarity tiers">
                  {rarityTierColors.map((color, index) => <span style={{ "--tier-color": color } as React.CSSProperties} key={color}>{RARITY_TIER_LABELS[index + 1]}</span>)}
                </div>
                <button className="rarity-primary" onClick={() => openView("daily")}>play today’s puzzle</button>
              </div>
            ) : view === "themes" ? (
              <div className="rarity-theme-picker">
                <div className="rarity-theme-list" role="radiogroup" aria-label="Choose a Rarity theme">
                  {rarityThemes.map((choice) => (
                    <button
                      key={choice.id}
                      role="radio"
                      aria-checked={theme === choice.id}
                      className={theme === choice.id ? "is-selected" : ""}
                      onClick={() => chooseTheme(choice.id)}
                    >
                      <b>{choice.name}</b>
                      <span aria-hidden="true">{choice.tiers.slice(0, 5).map((color) => <i key={color} style={{ background: color }} />)}</span>
                      <small>{theme === choice.id ? "current" : "choose"}</small>
                    </button>
                  ))}
                </div>
                <div className="rarity-theme-live" aria-live="polite">
                  <div>
                    <span>live preview</span>
                    <h3>{activeTheme.name}</h3>
                    <p>the whole game changes together.</p>
                  </div>
                  <div className="rarity-theme-live-score">
                    <i />
                    <p><strong>ra<em>re</em></strong><small>72.4 points</small></p>
                  </div>
                  <div className="rarity-theme-live-tiers" aria-label="theme rarity tiers">
                    {activeTheme.tiers.map((color, index) => <span key={color} style={{ background: color }}>{index + 1}</span>)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rarity-about">
                <div className="rarity-about-hero">
                  <RarityGem />
                  <div><h3>one word can say a lot.</h3><p>rarity celebrates the strange, specific, and surprising words hiding beyond everyday language.</p></div>
                </div>
                <div className="rarity-about-motif" aria-label="the shape of rarity">
                  <div><b>one</b><span>shared string</span></div>
                  <div><b>one</b><span>final word</span></div>
                  <div><b>one</b><span>daily field</span></div>
                </div>
                <div className="rarity-about-story">
                  <p>created by mario gerardi, the game turns vocabulary into a daily act of taste: familiar or peculiar, cautious or ambitious, the choice is yours.</p>
                  <p>this games hub edition preserves classic rarity’s scoring, tiers, dictionary context, and live comparisons.</p>
                </div>
                <button className="rarity-primary" onClick={() => openView("daily")}>play rarity</button>
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
