"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import "./rarity.css";
import { useGameTheme } from "../../platform/game-theme-provider";
import { rarityClassicPuzzles } from "./catalog";
import {
  createRaritySession,
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
  type RarityWordInfo,
} from "./services.mjs";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import { dailyRunId, useGameRunPersistence } from "../../platform/game-run-persistence";
import { useGameRestoration, useProgressStorage } from "../../platform/game-progress-provider";
import type { DeviceStore } from "../../platform/storage";
import type { GameRun } from "../../platform/runs.mjs";
import { loadLocalStudioSlot } from "../../authoring/local-runtime";
import styles from "./rarity.module.css";

const API_ROOT =
  "https://rminygbqxd.execute-api.us-east-1.amazonaws.com";

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
const rarityTierRanges = ["0–29%", "30–49%", "50–69%", "70–89%", "90–96%", "97%+"];
const keyboardRows = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["backspace", "z", "x", "c", "v", "b", "n", "m", "enter"],
] as const;

type RarityTheme = (typeof rarityThemes)[number]["id"];
type RarityView = "home" | "daily" | "archive" | "how-to" | "themes" | "settings";
type PendingRaritySubmission = { state: RaritySession; submission: RaritySubmission };

const rarityViews: RarityView[] = ["home", "daily", "archive", "how-to", "themes", "settings"];

function RarityRouteRestoring({ message }: { message: string }) {
  return (
    <div className="rarity-daily rarity-route-restoring is-daily" aria-busy="true" aria-label="Preparing daily Rarity">
      <main className="rarity-play-layout" aria-hidden="true" />
      <span className="rarity-route-status" role="status">{message}</span>
    </div>
  );
}

function rarityViewFromUrl() {
  if (typeof window === "undefined") return "home";
  const candidate = new URL(window.location.href).searchParams.get("view");
  return rarityViews.includes(candidate as RarityView)
    ? (candidate as RarityView)
    : "home";
}

function rarityUrlForView(nextView: RarityView, dateKey?: string) {
  const url = new URL(window.location.href);
  if (nextView === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", nextView);
  if (nextView === "daily" && dateKey) url.searchParams.set("date", dateKey);
  else url.searchParams.delete("date");
  return url;
}

function RarityGem({ small = false }: { small?: boolean }) {
  return (
    <span className={`rarity-gem${small ? " is-small" : ""}`} aria-hidden="true">
      <Image
        alt=""
        decoding="sync"
        height={160}
        priority
        src="/hub/rarity-gem.png"
        unoptimized
        width={160}
      />
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

function RaritySupportHeader({ title, description, headingRef }: {
  title: string;
  description?: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <header className="rarity-support-header">
      <h2 ref={headingRef} tabIndex={-1}>{title}</h2>
      {description ? <span>{description}</span> : null}
    </header>
  );
}

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

function rarityArchiveDateKeys(today = new Date(), count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - index, 12);
    return localDateKey(date);
  });
}

function rarityDisplayDate(dateKey: string, compact = false) {
  return new Intl.DateTimeFormat(undefined, compact
    ? { month: "short", day: "numeric" }
    : { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${dateKey}T12:00:00`));
}

function readStoredSubmission(dateKey: string, storage: DeviceStore) {
  const raw = storage.getItem(rarityDailyStorageKey(dateKey));
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
}: {
  word: string;
  token: string;
}) {
  return word;
}

function AnimatedResultWord({ word }: { word: string }) {
  return (
    <span className="rarity-result-word" aria-label={word}>
      <span aria-hidden="true">
        {Array.from(word).map((character, index) => (
          <span
            key={`${character}-${index}`}
            style={{ "--letter-delay": `${80 + index * 46}ms` } as React.CSSProperties}
          >
            {character}
          </span>
        ))}
      </span>
    </span>
  );
}

function RarityTierRating({ tier }: { tier: number }) {
  return (
    <span className="rarity-tier-gems" aria-label={`${tier} of 6 rarity gems`}>
      {rarityTierColors.map((color, index) => (
        <span
          className={index < tier ? "is-earned" : ""}
          key={color}
          style={{ "--tier-color": color } as React.CSSProperties}
        />
      ))}
    </span>
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

function RaritySettings({ hasProgress, onClear }: {
  hasProgress: boolean;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="rarity-settings">
      <section className="rarity-settings-row">
        <span><b>puzzle history</b><small>remove saved Daily and Archive results from this browser.</small></span>
        {!confirming ? (
          <button className="rarity-settings-action" disabled={!hasProgress} onClick={() => setConfirming(true)} type="button">clear history</button>
        ) : (
          <span className="rarity-settings-confirm">
            <button onClick={() => setConfirming(false)} type="button">cancel</button>
            <button className="is-danger" onClick={() => { onClear(); setConfirming(false); }} type="button">clear results</button>
          </span>
        )}
      </section>
      <aside className="rarity-settings-note">
        <b>about your data</b>
        <p>guest saves stay on this device. signed-in progress is account-scoped, while dictionary and comparison requests contain only the information needed to evaluate your word.</p>
      </aside>
    </div>
  );
}

export function RarityGame({ initialRoute }: { initialRoute?: { view?: string } }) {
  const progressStorage = useProgressStorage();
  const restoration = useGameRestoration();
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const viewHeadingRef = useRef<HTMLHeadingElement>(null);
  const refocusAfterValidation = useRef(false);
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
  const [savedSession, setSession] = useState<RaritySession | null>(null);
  const [hydratedRevision, setHydratedRevision] = useState<typeof restoration.revision | undefined>(undefined);
  const [daily, setDaily] = useState<{ puzzle: RarityPuzzle; dateKey: string } | null>(null);
  const [todayKey, setTodayKey] = useState(() => localDateKey());
  const [archivePuzzles, setArchivePuzzles] = useState<Record<string, RarityPuzzle>>({});
  const [loadError, setLoadError] = useState("");
  const [showLoading, setShowLoading] = useState(false);
  const validationGeneration = useRef(0);
  const session = restoration.ready
    && hydratedRevision === restoration.revision
    && savedSession?.puzzleDate === daily?.dateKey
    ? savedSession
    : null;
  const [displayDate, setDisplayDate] = useState(() => rarityDisplayDate(localDateKey()));
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(
    "one valid word. make it as rare as you can.",
  );
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [view, setView] = useState<RarityView>(() => rarityViews.includes(initialRoute?.view as RarityView)
    ? initialRoute!.view as RarityView
    : "home");
  const [theme, setTheme, themeRestored] = useGameTheme<RarityTheme>("rarity", "light");
  const [displayScore, setDisplayScore] = useState(0);
  const [isRevealing, setIsRevealing] = useState(() => initialRoute?.view === "daily");
  const [pendingSubmission, setPendingSubmission] = useState<PendingRaritySubmission | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      const dateKey = localDateKey();
      const dateKeys = rarityArchiveDateKeys(new Date());
      const catalog = Object.fromEntries(dateKeys.map((key) => [
        key,
        selectFallbackRarityPuzzle(rarityClassicPuzzles, key),
      ])) as Record<string, RarityPuzzle>;
      try {
        const slots = await Promise.all(dateKeys.map(async (key) => {
          const [scheduled] = await loadLocalStudioSlot("rarity", "daily", key);
          return scheduled?.gameId === "rarity"
            ? [key, { ...scheduled.payload, difficulty: scheduled.payload.difficulty ?? 0, date: key, source: "live" } as RarityPuzzle] as const
            : null;
        }));
        slots.forEach((slot) => { if (slot) catalog[slot[0]] = slot[1]; });
        if (!slots[0]) catalog[dateKey] = (await services.fetchDailyPuzzle(dateKey)) ?? catalog[dateKey];
      } catch { /* The dated fallback catalog remains playable. */ }
      if (cancelled) return;
      const requestedDate = new URL(window.location.href).searchParams.get("date");
      const activeDate = rarityViewFromUrl() === "daily" && requestedDate && catalog[requestedDate]
        ? requestedDate
        : dateKey;
      setTodayKey(dateKey);
      setArchivePuzzles(catalog);
      setDisplayDate(rarityDisplayDate(activeDate));
      setDaily({ puzzle: catalog[activeDate], dateKey: activeDate });
    });
    return () => { cancelled = true; };
  }, [services]);

  useEffect(() => {
    let cancelled = false;
    if (restoration.ready && daily) queueMicrotask(async () => {
      if (cancelled) return;
      try {
        const { puzzle, dateKey } = daily;
        let stored = null;
        try { stored = readStoredSubmission(dateKey, progressStorage); } catch { /* Storage may be unavailable. */ }
        const nextSession = stored
          ? hydrateRaritySession({ payload: stored, puzzle, puzzleDate: dateKey })
          : createRaritySession({ puzzle, puzzleDate: dateKey });
        setSession(nextSession);
        setDisplayScore(0);
        setHydratedRevision(restoration.revision);
        setGuess("");
        setPendingSubmission(null);
        setIsChecking(false);
        setIsRevealing(rarityViewFromUrl() === "daily" && Boolean(nextSession.submission));
        setLoadError("");
        setFeedbackTone("neutral");
        setFeedback(nextSession.hasSubmitted ? "today’s word is locked in." : "one valid word. make it as rare as you can.");
      } catch {
        if (!cancelled) setLoadError("today’s puzzle couldn’t be restored. please refresh to try again.");
      }
    });
    return () => {
      cancelled = true;
      validationGeneration.current += 1;
    };
  }, [restoration.ready, restoration.revision, daily, progressStorage, services]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoading(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const sessionReady = session !== null;
  const hasSubmission = Boolean(session?.submission);
  const platformRun = useMemo<GameRun<"rarity"> | null>(() => session ? ({
    schemaVersion: 1,
    runId: dailyRunId("rarity", "daily", session.puzzleDate),
    playerId: null,
    gameId: "rarity",
    mode: "daily",
    puzzle: { id: `${session.puzzleDate}-${session.puzzle.puzzleString}`, revision: 1, date: session.puzzleDate },
    startedAt: new Date(`${session.puzzleDate}T00:00:00`).toISOString(),
    completedAt: session.submission?.timestamp ?? null,
    outcome: hasSubmission ? "completed" : "in-progress",
    score: session.submission?.exactScore,
    checkpoint: { version: 1, state: { native: session.submission ? serializeRaritySubmission(session.puzzle.puzzleString, session.submission) : {} } },
    result: { submission: session.submission },
  }) : null, [hasSubmission, session]);
  useGameRunPersistence(platformRun, hasSubmission);

  useEffect(() => {
    const syncView = () => {
      const requestedView = rarityViewFromUrl();
      const requestedDate = new URL(window.location.href).searchParams.get("date");
      if (requestedView === "daily" && requestedDate && archivePuzzles[requestedDate] && requestedDate !== daily?.dateKey) {
        setDisplayDate(rarityDisplayDate(requestedDate));
        setDaily({ puzzle: archivePuzzles[requestedDate], dateKey: requestedDate });
      }
      setDisplayScore(0);
      setIsRevealing(requestedView === "daily" && Boolean(session?.submission));
      setView(requestedView);
      setShareStatus("");
    };

    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, [archivePuzzles, daily?.dateKey, hasSubmission, session?.submission, sessionReady]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      if (view === "daily" && sessionReady && !hasSubmission) {
        inputRef.current?.focus({ preventScroll: true });
      } else {
        viewHeadingRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [hasSubmission, sessionReady, view]);

  useEffect(() => {
    if (isChecking || !refocusAfterValidation.current) return;
    refocusAfterValidation.current = false;
    inputRef.current?.focus({ preventScroll: true });
  }, [isChecking]);

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
      revealTimer = window.setTimeout(() => {
        setIsRevealing(false);
      }, 1900);
    });

    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(revealTimer);
    };
  }, [session?.submission, view]);

  function chooseTheme(nextTheme: RarityTheme) {
    setTheme(nextTheme);
  }

  function openView(nextView: RarityView) {
    if (nextView === view) return;
    const resetToToday = nextView === "home" || nextView === "daily";
    if (resetToToday && todayKey && daily?.dateKey !== todayKey && archivePuzzles[todayKey]) {
      setDaily({ puzzle: archivePuzzles[todayKey], dateKey: todayKey });
      setDisplayDate(rarityDisplayDate(todayKey));
    }
    window.history.pushState({}, "", rarityUrlForView(nextView, nextView === "daily" ? todayKey : undefined));
    setDisplayScore(0);
    setIsRevealing(nextView === "daily" && Boolean(session?.submission));
    setView(nextView);
    setPendingSubmission(null);
    setShareStatus("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openArchiveRound(dateKey: string) {
    const puzzle = archivePuzzles[dateKey];
    if (!puzzle) return;
    // Clear the previous result field before the next puzzle can enter the
    // daily view. Hydration will opt a completed archive round back into its
    // own reveal once its matching session is ready.
    setIsRevealing(false);
    setDisplayScore(0);
    setDaily({ puzzle, dateKey });
    setDisplayDate(rarityDisplayDate(dateKey));
    setPendingSubmission(null);
    setView("daily");
    window.history.pushState({}, "", rarityUrlForView("daily", dateKey));
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
    } catch {
      // Comparison submission remains best-effort until the shared hub service replaces it.
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
    const generation = validationGeneration.current;
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

    if (generation !== validationGeneration.current) return;
    const result = evaluateRarityAttempt({
      state: session,
      puzzleString: session.puzzle.puzzleString,
      word: candidate,
      wordInfo,
      timestamp: new Date().toISOString(),
    });
    if (!result.accepted) {
      refocusAfterValidation.current = true;
      setIsChecking(false);
      setFeedback(
        rejectionMessage(
          result.reason,
          session.puzzle.puzzleString,
          wordInfo,
        ),
      );
      setFeedbackTone("error");
      return;
    }

    setIsChecking(false);
    setPendingSubmission({ state: result.state, submission: result.submission });
    setFeedback("valid word. lock it in when you’re ready.");
    setFeedbackTone("neutral");
  }

  function cancelPendingSubmission() {
    setPendingSubmission(null);
    setFeedback("one valid word. make it as rare as you can.");
    setFeedbackTone("neutral");
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function commitPendingSubmission() {
    if (!pendingSubmission) return;
    const { state: nextSession, submission: nextSubmission } = pendingSubmission;
    setPendingSubmission(null);
    setDisplayScore(0);
    setIsRevealing(true);
    setSession(nextSession);
    setGuess("");
    setFeedback(tierFeedback[nextSubmission.tier]);
    setFeedbackTone("success");
    try {
      progressStorage.setItem(
        rarityDailyStorageKey(nextSession.puzzleDate),
        JSON.stringify(
          serializeRaritySubmission(
            nextSession.puzzle.puzzleString,
            nextSubmission,
          ),
        ),
      );
    } catch {
      // The accepted result remains visible if browser storage is unavailable.
    }
    void submitResultToLeaderboard(nextSession, nextSubmission);
  }

  function clearRarityHistory() {
    for (const dateKey of Object.keys(archivePuzzles)) {
      try { progressStorage.removeItem(rarityDailyStorageKey(dateKey)); } catch { /* Continue clearing the available history. */ }
    }
    try { localStorage.removeItem("rarity_user_id"); } catch { /* The local comparison identity is best-effort. */ }
    if (daily) {
      setSession(createRaritySession({ puzzle: daily.puzzle, puzzleDate: daily.dateKey }));
      setHydratedRevision(restoration.revision);
    }
    setGuess("");
    setPendingSubmission(null);
    setDisplayScore(0);
    setIsRevealing(false);
    setFeedback("one valid word. make it as rare as you can.");
    setFeedbackTone("neutral");
    setShareStatus("");
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

  const loadingMessage = loadError || (restoration.conflict ? "choose which save to continue." : showLoading ? "getting your daily ready…" : "");
  const token = session?.puzzle.puzzleString.toUpperCase() ?? "";
  const submission = session?.submission;
  const tier = submission?.tier ?? 1;
  const activeTheme = rarityThemes.find((choice) => choice.id === theme) ?? rarityThemes[0];
  const isToday = Boolean(daily && daily.dateKey === todayKey);
  const archiveRounds = Object.keys(archivePuzzles).sort().reverse().map((dateKey) => {
    const puzzle = archivePuzzles[dateKey];
    let stored = null;
    try { stored = readStoredSubmission(dateKey, progressStorage); } catch { /* Show an unplayed card if storage is unavailable. */ }
    return {
      dateKey,
      puzzle,
      session: stored ? hydrateRaritySession({ payload: stored, puzzle, puzzleDate: dateKey }) : createRaritySession({ puzzle, puzzleDate: dateKey }),
    };
  });
  const themeStyle = {
    "--rarity-accent": activeTheme.accent,
    "--rarity-accent-2": activeTheme.accent2,
    "--rarity-bg": activeTheme.background,
    "--rarity-surface": activeTheme.surface,
    "--rarity-input": activeTheme.input,
    "--rarity-border": activeTheme.border,
    "--rarity-text": activeTheme.text,
    "--rarity-muted": activeTheme.muted,
    "--rarity-score-fill": view === "daily" && submission ? `${displayScore}%` : "0%",
    ...Object.fromEntries(activeTheme.tiers.map((color, index) => [`--rarity-tier-${index + 1}`, color])),
  } as React.CSSProperties;

  return (
    <section
      className={`${styles.root} rarity-game-card rarity-tier-${tier}${isRevealing ? " is-revealing" : ""}`}
      data-rarity-theme={theme}
      data-theme-restored={themeRestored}
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
          { label: "archive", current: view === "archive", onSelect: () => openView("archive") },
          { label: "how to play", current: view === "how-to", onSelect: () => openView("how-to") },
          { label: "themes", current: view === "themes", onSelect: () => openView("themes") },
          { label: "settings", current: view === "settings", onSelect: () => openView("settings") },
        ]}
        onHome={() => openView("home")}
      />
      {view === "home" ? (
        <div className="rarity-home">
          <main className="rarity-home-hero">
            <RarityBrand />
            <p className="rarity-home-kicker" suppressHydrationWarning>daily rarity · {displayDate}</p>
            <p>can you find the rarest word containing today’s string?</p>
            <div className="rarity-home-action-slot">
              {sessionReady ? (
                <button className="rarity-primary rarity-home-ready-action" onClick={() => openView("daily")}>
                  {submission ? "view today’s result" : "play daily"}
                </button>
              ) : null}
            </div>
            {!sessionReady && loadError ? <span className="rarity-startup-status" role="alert">{loadError}</span> : null}
          </main>

        </div>
      ) : view === "daily" ? (!session ? (
        loadError || restoration.conflict ? (
          <div className="rarity-daily-pending" aria-busy="false">
            <h2 ref={viewHeadingRef} tabIndex={-1}>daily rarity</h2>
            <p role={loadError ? "alert" : "status"}>{loadingMessage}</p>
            <button className="rarity-primary" type="button" onClick={() => openView("home")}>back to menu</button>
          </div>
        ) : <RarityRouteRestoring message={loadingMessage} />
      ) : (
        <div className="rarity-daily rarity-route-ready" key={`rarity-play:${session.puzzleDate}`}>
          <main className="rarity-play-layout" aria-label="Today’s challenge">
            <section className={`rarity-daily-panel${submission ? " is-result" : ""}`}>
              {!submission ? (
                <>
                  <p className="rarity-panel-kicker">{isToday ? "today’s puzzle" : "archive puzzle"} · {displayDate}</p>
                  <h2 ref={viewHeadingRef} tabIndex={-1} className="rarity-daily-string" aria-label={`Daily string ${token}`}>{token}</h2>

                  {pendingSubmission ? (
                    <section className="rarity-lock-confirmation" aria-labelledby="rarity-lock-title">
                      <p className="rarity-panel-kicker">one valid word</p>
                      <h3 id="rarity-lock-title"><HighlightedWord word={pendingSubmission.submission.word} token={session.puzzle.puzzleString} /></h3>
                      <p>Once you lock it in, this is your final word for this puzzle.</p>
                      <div>
                        <button className="rarity-result-secondary" onClick={cancelPendingSubmission} type="button">keep thinking</button>
                        <button className="rarity-primary" onClick={commitPendingSubmission} type="button">lock it in</button>
                      </div>
                    </section>
                  ) : (
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
                  )}
                </>
              ) : (
                <div className="rarity-result-summary">
                  <p className="rarity-panel-kicker">your entry</p>
                  <h2 ref={viewHeadingRef} tabIndex={-1}><AnimatedResultWord word={submission.word} /></h2>
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
                    <b>{RARITY_TIER_LABELS[tier]}</b>
                  </div>
                  <div className="rarity-tier-track" aria-label="your rarity tier">
                    {rarityTierColors.map((color, index) => <span className={`${index < tier ? "is-earned" : ""}${index + 1 === tier ? " is-current" : ""}`} style={{ "--tier-color": color } as React.CSSProperties} key={color} />)}
                  </div>
                  <p className="rarity-result-message">{tierFeedback[tier]}</p>
                  <div className="rarity-result-actions">
                    <button className="rarity-primary rarity-result-primary" onClick={handleShare}>share result <span aria-hidden="true">↗</span></button>
                    <button className="rarity-result-secondary" onClick={() => openView("archive")}>play the archive</button>
                  </div>
                  <span className="rarity-share-status" role="status">{shareStatus}</span>
                </div>
              )}

              {!submission && !pendingSubmission ? (
                <p className={`rarity-feedback is-${feedbackTone}`} aria-live="polite" role="status">{feedback}</p>
              ) : null}
            </section>
          </main>
        </div>
      )) : view === "archive" ? (
        <div className="rarity-archive-view">
          <main className="rarity-archive-shell">
            <RaritySupportHeader
              description="play a past puzzle or revisit your previous entries."
              headingRef={viewHeadingRef}
              title="past puzzles"
            />
            <div className="rarity-archive-grid">
              {archiveRounds.map((round) => {
                const played = Boolean(round.session.submission);
                return (
                  <button className={played ? "is-played" : "is-unplayed"} key={round.dateKey} onClick={() => openArchiveRound(round.dateKey)} type="button">
                    <span><small>{round.dateKey === todayKey ? "today" : rarityDisplayDate(round.dateKey, true)}</small><b>{played ? "complete" : "unplayed"}</b></span>
                    <strong>{round.puzzle.puzzleString.toUpperCase()}</strong>
                    {round.session.submission ? (
                      <span className="rarity-archive-result"><b><HighlightedWord word={round.session.submission.word} token={round.puzzle.puzzleString} /></b><small>{formatRarityScore(round.session.submission.exactScore, 1)} · {RARITY_TIER_LABELS[round.session.submission.tier]}</small><RarityTierRating tier={round.session.submission.tier} /></span>
                    ) : <span className="rarity-archive-result"><b>choose your word</b><small>one chance</small><RarityTierRating tier={0} /></span>}
                    <i aria-hidden="true">→</i>
                  </button>
                );
              })}
            </div>
          </main>
        </div>
      ) : (
        <div className="rarity-info-view" key={`rarity-support:${view}`}>
          <article className={`rarity-info-card${view === "how-to" ? " is-how-to" : ""}${view === "themes" ? " is-themes" : ""}${view === "settings" ? " is-settings" : ""}`}>
            <RaritySupportHeader
              description={view === "themes" ? "choose a palette without changing the game." : undefined}
              headingRef={viewHeadingRef}
              title={view === "how-to" ? "how to play" : view}
            />
            {view === "how-to" ? (
              <div className="rarity-how">
                <section className="rarity-how-lead">
                  <p className="rarity-how-intro">one constraint, one carefully chosen word, and one chance to make it count.</p>
                  <p className="rarity-how-rule">everyone gets the same three-letter string each day. enter one valid word of at least four letters, keeping the string together.</p>
                </section>
                <div className="rarity-how-comparison" aria-label="Three valid WEL words with different placements and rarity scores">
                  <header>
                    <span><b>example string</b><strong>WEL</strong></span>
                    <p>place the string anywhere it fits—at the beginning, in the middle, or at the end. then aim for obscurity. here are three examples in play:</p>
                  </header>
                  <div className="rarity-how-examples">
                    <article style={{ "--example-color": rarityTierColors[1] } as React.CSSProperties}>
                      <span>at the end</span>
                      <strong>to<mark>wel</mark></strong>
                      <p><b>37.6</b><small>common</small></p>
                    </article>
                    <article style={{ "--example-color": rarityTierColors[2] } as React.CSSProperties}>
                      <span>at the start</span>
                      <strong><mark>wel</mark>lness</strong>
                      <p><b>53.8</b><small>uncommon</small></p>
                    </article>
                    <article style={{ "--example-color": rarityTierColors[3] } as React.CSSProperties}>
                      <span>in the middle</span>
                      <strong>beje<mark>wel</mark>ed</strong>
                      <p><b>79.9</b><small>rare</small></p>
                    </article>
                  </div>
                </div>
                <section className="rarity-how-scale">
                  <header><h3>the rarity scale</h3><p>higher scores reach higher tiers of obscurity.</p></header>
                  <div className="rarity-how-tier-track" aria-label="six rarity tiers">
                    {rarityTierColors.map((color, index) => (
                      <span style={{ "--tier-color": color } as React.CSSProperties} key={color}>
                        <i aria-hidden="true" />
                        <b>{RARITY_TIER_LABELS[index + 1]}</b>
                        <small>{rarityTierRanges[index]}</small>
                      </span>
                    ))}
                  </div>
                </section>
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
                    <p>see how a finished word looks in this palette.</p>
                  </div>
                  <div className="rarity-theme-live-result">
                    <small>your entry</small>
                    <div className="rarity-theme-live-word">
                      <strong>beje<mark>wel</mark>ed</strong>
                      <RarityTierRating tier={4} />
                    </div>
                    <p><b>79.9</b><span>points</span></p>
                    <em>rare</em>
                  </div>
                  <div className="rarity-theme-live-tiers" aria-label="theme rarity tiers">
                    {activeTheme.tiers.map((color, index) => <span key={color} style={{ background: color }}>{index + 1}</span>)}
                  </div>
                </div>
              </div>
            ) : view === "settings" ? (
              <RaritySettings
                hasProgress={archiveRounds.some((round) => Boolean(round.session.submission))}
                onClear={clearRarityHistory}
              />
            ) : null}
          </article>
        </div>
      )}
    </section>
  );
}
