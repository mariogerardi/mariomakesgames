"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./before-after.css";
import { BeforeAfterMenuIcon } from "./menu-icon";
import { useGameTheme } from "../../platform/game-theme-provider";
import { gameStorageKey } from "../../platform/storage";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import { dailyRunId, sessionRunId, useGameRunPersistence } from "../../platform/game-run-persistence";
import { useGameProgress, useGameRestoration, useProgressStorage } from "../../platform/game-progress-provider";
import type { DeviceStore } from "../../platform/storage";
import { loadLocalStudioSlot } from "../../authoring/local-runtime";
import type { GameRun } from "../../platform/runs.mjs";
import {
  allBridgePuzzles,
  bridgeArchive,
  bridgeCompleteArchive,
  bridgeDateKey,
  bridgePackCollections,
  fundamentalBridgePacks,
  playableBridgePacks,
  selectDailyBridgePuzzle,
  type BridgePack,
} from "./catalog";
import {
  BEFORE_AFTER_ANSWER_LIMIT,
  bridgePhrases,
  createBridgeSession,
  elapsedBridgeSeconds,
  hydrateBridgeSession,
  pauseBridgeSession,
  revealBridgeAnswer,
  resumeBridgeSession,
  serializeBridgeSession,
  submitBridgeAnswer,
  type BridgeMode,
  type BridgePuzzle,
  type BridgeSession,
} from "./engine.mjs";

const DAILY_KEY = gameStorageKey("before-after", "daily");
const PROGRESS_KEY = gameStorageKey("before-after", "progress");
const RESET_KEY = gameStorageKey("before-after", "cloud-reset");
const CORE_VIEWS = ["daily", "packs", "archive"] as const;
const ROUTED_VIEWS = ["daily", "packs", "archive", "themes", "how-to", "settings"] as const;

function bridgeResumeKey(puzzleId: string) {
  return `mg-games:v1:before-after:resume-${encodeURIComponent(puzzleId)}`;
}

type View =
  | "menu"
  | BridgeMode
  | (typeof CORE_VIEWS)[number]
  | "themes"
  | "how-to"
  | "settings";
type ThemeId = "signature" | "tidepool" | "orchard" | "neapolitan" | "metro" | "midnight" | "terminal" | "cabaret";
type Solve = { attempts: number; durationMs: number; solvedAt: string };
type BridgeProgress = {
  solved: Record<string, Solve>;
  totalAttempts: number;
  dailyDates: string[];
};

function validPackId(value: string | null | undefined) {
  return value && playableBridgePacks.some((pack) => pack.id === value) ? value : undefined;
}

function validArchiveDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function beforeAfterRouteFromUrl(): { view: View; pack?: string; date?: string } {
  if (typeof window === "undefined") return { view: "menu" };
  const url = new URL(window.location.href);
  const requested = url.searchParams.get("view");
  const view = ROUTED_VIEWS.includes(requested as (typeof ROUTED_VIEWS)[number])
    ? requested as View
    : "menu";
  const pack = view === "packs" ? validPackId(url.searchParams.get("pack")) : undefined;
  const date = view === "archive" ? validArchiveDate(url.searchParams.get("date")) : undefined;
  return { view, ...(pack ? { pack } : {}), ...(date ? { date } : {}) };
}

function writeBeforeAfterViewUrl(view: View, mode: "push" | "replace" = "push", selection?: { pack?: string; date?: string }) {
  const url = new URL(window.location.href);
  if (view === "menu") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  if (view === "packs" && selection?.pack) url.searchParams.set("pack", selection.pack);
  else url.searchParams.delete("pack");
  if (view === "archive" && selection?.date) url.searchParams.set("date", selection.date);
  else url.searchParams.delete("date");
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

const EMPTY_PROGRESS: BridgeProgress = {
  solved: {},
  totalAttempts: 0,
  dailyDates: [],
};

const THEMES: Array<{ id: ThemeId; name: string; description: string }> = [
  { id: "signature", name: "signature", description: "Crisp neutrals with the original coral-and-blue bridge." },
  { id: "tidepool", name: "tidepool", description: "Sea glass, coral, and clear coastal blues." },
  { id: "orchard", name: "orchard", description: "Soft cream grounded by apple, leaf, and plum." },
  { id: "neapolitan", name: "neapolitan", description: "Warm vanilla with strawberry and cocoa accents." },
  { id: "metro", name: "metro", description: "Subway-platform green with the city’s iconic route colors." },
  { id: "midnight", name: "midnight", description: "A balanced navy night mode with coral and blue bridges." },
  { id: "terminal", name: "moon garden", description: "Deep plum with electric rose and moonlit teal." },
  { id: "cabaret", name: "cabaret", description: "Deep red velvet with vivid rose, gold, and evening blue." },
];

const MENU_ITEMS: Array<{ view: View; title: string; subtitle: string }> = [
  { view: "daily", title: "daily", subtitle: "today’s bridge, at your pace" },
  { view: "packs", title: "puzzle packs", subtitle: "three ways to learn the bridge" },
  { view: "archive", title: "archive", subtitle: "revisit the last thirty days" },
  { view: "themes", title: "themes", subtitle: "change the whole atmosphere" },
  { view: "how-to", title: "how to play", subtitle: "learn how bridges work" },
  { view: "settings", title: "settings", subtitle: "manage your saved progress" },
];

function BeforeAfterRouteRestoring({ view, message }: { view: View; message: string }) {
  if (view === "daily") {
    return (
      <section className="ba-play ba-route-restoring" aria-busy="true" aria-label="Preparing daily puzzle">
        <div className="ba-play-layout" aria-hidden="true" />
        <span className="ba-route-status" role="status">{message}</span>
      </section>
    );
  }
  return (
    <section className="ba-view ba-route-restoring is-library" aria-busy="true" aria-label={`Preparing ${view}`}>
      <span className="ba-route-status" role="status">{message}</span>
    </section>
  );
}

function readJson<T>(key: string, fallback: T, storage: DeviceStore): T {
  try {
    return JSON.parse(storage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function formatDuration(durationMs: number) {
  if (!durationMs) return "--";
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

type PerformanceBadge = { label: string; tier: "gold" | "silver" | "bronze" };

function attemptBadge(attempts: number): PerformanceBadge | null {
  if (attempts === 1) return { label: "perfect", tier: "gold" };
  if (attempts === 2) return { label: "sharp", tier: "silver" };
  if (attempts === 3) return { label: "steady", tier: "bronze" };
  return null;
}

function speedBadge(durationMs: number): PerformanceBadge | null {
  if (durationMs <= 0) return null;
  if (durationMs < 5_000) return { label: "lightning", tier: "gold" };
  if (durationMs < 10_000) return { label: "quick", tier: "silver" };
  if (durationMs < 15_000) return { label: "swift", tier: "bronze" };
  return null;
}

function formatStopwatch(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function bridgeSessionMessage(session: BridgeSession) {
  if (session.status === "solved") return "Bridge complete.";
  if (session.status === "revealed") return "Answer revealed. This puzzle does not count as complete.";
  return "Find the word that completes both phrases.";
}

function completedBridgeSession(puzzle: BridgePuzzle, mode: BridgeMode, solve: Solve): BridgeSession {
  const parsedCompletedAt = Date.parse(solve.solvedAt);
  const completedAt = Number.isFinite(parsedCompletedAt) ? parsedCompletedAt : Date.now();
  const durationMs = Math.max(0, Number(solve.durationMs) || 0);
  return {
    ...createBridgeSession({ puzzle, mode, startedAt: completedAt - durationMs }),
    answerText: puzzle.answer.toLowerCase(),
    attempts: Math.max(1, Number(solve.attempts) || 0),
    status: "solved",
    activeElapsedMs: durationMs,
    resumedAt: null,
    completedAt,
    durationMs,
  };
}

export function beforeAfterInstruction(puzzle: BridgePuzzle) {
  const [first, second] = puzzle.clueWords;
  if (puzzle.position === "before") return <>word before <b>{first}</b> or <b>{second}</b>.</>;
  if (puzzle.position === "after") return <>word after <b>{first}</b> or <b>{second}</b>.</>;
  return <>word before <b>{first}</b> or after <b>{second}</b>.</>;
}

export function BeforeAfterWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ba-wordmark${compact ? " is-compact" : ""}`} aria-label="Before and After">
      <span className="ba-wordmark-before">before</span>
      <i>&amp;</i>
      <span className="ba-wordmark-after">after</span>
    </div>
  );
}

export function BeforeAfterPhraseRows({
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
          <div className={`ba-phrase ${answerFirst ? "is-answer-first" : "is-answer-last"}`} key={`${clue}-${index}`}>
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

export function BeforeAfterGame({ initialRoute }: { initialRoute?: { view?: string; pack?: string; date?: string } }) {
  const gameProgress = useGameProgress();
  const progressStorage = useProgressStorage();
  const restoration = useGameRestoration();
  const [hydratedRevision, setHydratedRevision] = useState<typeof restoration.revision | undefined>(undefined);
  const [showLoading, setShowLoading] = useState(false);
  const [archiveReady, setArchiveReady] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [dailyPuzzle, setDailyPuzzle] = useState(() => selectDailyBridgePuzzle(today));
  const [scheduleReady, setScheduleReady] = useState(false);
  const [archive, setArchive] = useState(() => bridgeCompleteArchive(today));
  const [view, setView] = useState<View>(() => ROUTED_VIEWS.includes(initialRoute?.view as (typeof ROUTED_VIEWS)[number])
    ? initialRoute!.view as View
    : "menu");
  const [theme, setTheme, themeRestored] = useGameTheme<ThemeId>("before-after", "signature");
  const initialPackId = validPackId(initialRoute?.pack);
  const [packId, setPackId] = useState(initialPackId ?? fundamentalBridgePacks[0].id);
  const [isPackOpen, setIsPackOpen] = useState(initialRoute?.view === "packs" && Boolean(initialPackId));
  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [archivePuzzleIndex, setArchivePuzzleIndex] = useState(0);
  const [routedArchiveDate, setRoutedArchiveDate] = useState(() => initialRoute?.view === "archive" ? validArchiveDate(initialRoute.date) : undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedSession, setSession] = useState<BridgeSession | null>(null);
  const sessionRef = useRef<BridgeSession | null>(null);
  const progressReady = restoration.ready && hydratedRevision === restoration.revision;
  const playReady = progressReady && scheduleReady;
  const session = playReady ? savedSession : null;
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("Find the word that completes both phrases.");
  const [tone, setTone] = useState<"neutral" | "error" | "success">("neutral");
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<BridgeProgress>(EMPTY_PROGRESS);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationTimerRef = useRef<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  const currentPack = playableBridgePacks.find((pack) => pack.id === packId) || fundamentalBridgePacks[0];
  const currentPackDirection = currentPack.puzzles.every((puzzle) => puzzle.position === currentPack.puzzles[0]?.position)
    ? currentPack.puzzles[0]?.position ?? "both"
    : "both";
  const platformRun = useMemo<GameRun<"before-after"> | null>(() => {
    if (!session || session.mode === "custom") return null;
    const archiveDate = session.mode === "archive" ? [...archive].reverse()[archivePuzzleIndex]?.date : undefined;
    const date = session.mode === "daily" ? bridgeDateKey(today) : archiveDate;
    const mode = session.mode as "daily" | "packs" | "archive";
    const startedAt = new Date(session.startedAt).toISOString();
    return {
      schemaVersion: 1,
      runId: date ? dailyRunId("before-after", mode, date) : sessionRunId("before-after", mode, startedAt),
      playerId: null,
      gameId: "before-after",
      mode,
      puzzle: { id: session.puzzle.id, revision: 1, ...(date ? { date } : {}) },
      startedAt,
      completedAt: session.completedAt === null ? null : new Date(session.completedAt).toISOString(),
      outcome: session.status === "active" ? "in-progress" : session.status === "solved" ? "completed" : "abandoned",
      score: session.status === "solved" ? 1 : 0,
      checkpoint: { version: 1, state: { native: serializeBridgeSession(session) } },
      result: { attempts: session.attempts, durationMs: session.durationMs ?? 0, status: session.status === "revealed" ? "abandoned" : session.status },
    };
  }, [archive, archivePuzzleIndex, session, today]);
  useGameRunPersistence(platformRun, !resetting);

  const cancelQueuedCelebration = useCallback(() => {
    if (celebrationTimerRef.current === null) return;
    window.clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = null;
  }, []);

  const queueCompletedCelebration = useCallback(() => {
    cancelQueuedCelebration();
    celebrationTimerRef.current = window.setTimeout(() => {
      celebrationTimerRef.current = null;
      setShowCelebration(true);
    }, 650);
  }, [cancelQueuedCelebration]);

  useEffect(() => () => {
    if (celebrationTimerRef.current !== null) window.clearTimeout(celebrationTimerRef.current);
  }, []);

  useEffect(() => { sessionRef.current = savedSession; }, [savedSession]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoading(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadLocalStudioSlot("before-after", "daily", bridgeDateKey(today)).then(([scheduled]) => {
      if (cancelled) return;
      if (scheduled?.gameId === "before-after") setDailyPuzzle({ id: scheduled.id, ...scheduled.payload });
      setScheduleReady(true);
    });
    return () => { cancelled = true; };
  }, [today]);

  useEffect(() => {
    if (view !== "archive") return;
    let cancelled = false;
    void Promise.all(bridgeCompleteArchive(today).map(async (entry) => {
      const [scheduled] = await loadLocalStudioSlot("before-after", "daily", entry.date);
      return scheduled?.gameId === "before-after" ? { ...entry, puzzle: { id: scheduled.id, ...scheduled.payload } } : entry;
    })).then((entries) => { if (!cancelled) { setArchive(entries); setArchiveReady(true); } });
    return () => { cancelled = true; };
  }, [view, today]);

  useEffect(() => {
    if (view !== "archive" || !routedArchiveDate || !archiveReady || !playReady) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const chronological = [...archive].reverse();
      const index = chronological.findIndex((entry) => entry.date === routedArchiveDate);
      setRoutedArchiveDate(undefined);
      if (index < 0) {
        writeBeforeAfterViewUrl("archive", "replace");
        return;
      }
      const entry = chronological[index];
      setArchivePuzzleIndex(index);
      const completed = progress.solved[`daily:${entry.date}`] || progress.solved[entry.puzzle.id];
      if (completed) {
        const restored = completedBridgeSession(entry.puzzle, "archive", completed);
        setSession(restored);
        sessionRef.current = restored;
        setAnswer(restored.answerText);
        setElapsed(elapsedBridgeSeconds(restored));
        setFeedback("Bridge complete.");
        setTone("success");
        setIsPlaying(true);
        return;
      }
      const stored = readJson<Record<string, unknown> | null>(bridgeResumeKey(entry.puzzle.id), null, progressStorage);
      const next = stored?.status === "active" && stored.mode === "archive"
        ? resumeBridgeSession(hydrateBridgeSession({ payload: stored, puzzle: entry.puzzle, mode: "archive" }))
        : createBridgeSession({ puzzle: entry.puzzle, mode: "archive" });
      setSession(next);
      sessionRef.current = next;
      setAnswer(next.answerText);
      setElapsed(elapsedBridgeSeconds(next));
      setFeedback("Find the word that completes both phrases.");
      setTone("neutral");
      setIsPlaying(true);
      setShowCelebration(false);
      progressStorage.setItem(bridgeResumeKey(entry.puzzle.id), JSON.stringify(serializeBridgeSession(next)));
    });
    return () => { cancelled = true; };
  }, [archive, archiveReady, playReady, progress.solved, progressStorage, routedArchiveDate, view]);

  useEffect(() => {
    if (!restoration.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedProgress = readJson<BridgeProgress>(PROGRESS_KEY, EMPTY_PROGRESS, progressStorage);
      setProgress({
        solved: storedProgress.solved || {},
        totalAttempts: Number(storedProgress.totalAttempts) || 0,
        dailyDates: Array.isArray(storedProgress.dailyDates) ? storedProgress.dailyDates : [],
      });
      setHydratedRevision(restoration.revision);
      setSession(null);
      setIsPlaying(false);
      setShowCelebration(false);
      setAnswer("");
    });
    return () => {
      cancelled = true;
    };
  }, [progressStorage, restoration.ready, restoration.revision]);

  useEffect(() => {
    const syncView = () => {
      const current = sessionRef.current;
      if (current?.status === "active") {
        const paused = pauseBridgeSession(current);
        sessionRef.current = paused;
        setSession(paused);
        progressStorage.setItem(current.mode === "daily" ? DAILY_KEY : bridgeResumeKey(current.puzzle.id), JSON.stringify(serializeBridgeSession(paused)));
      }
      const next = beforeAfterRouteFromUrl();
      setView(next.view);
      cancelQueuedCelebration();
      setIsPlaying(next.view === "daily" && playReady);
      setShowCelebration(false);
      setConfirmReset(false);
      setIsPackOpen(Boolean(next.pack));
      setRoutedArchiveDate(next.date);
      if (next.pack) {
        setPackId(next.pack);
      }
      if (next.view === "daily" && playReady) {
        const storedProgress = readJson<BridgeProgress>(PROGRESS_KEY, EMPTY_PROGRESS, progressStorage);
        const completed = storedProgress.solved?.[`daily:${bridgeDateKey(today)}`] || storedProgress.solved?.[dailyPuzzle.id];
        const restored = completed ? completedBridgeSession(dailyPuzzle, "daily", completed) : resumeBridgeSession(hydrateBridgeSession({
          payload: readJson<Record<string, unknown> | null>(DAILY_KEY, null, progressStorage),
          puzzle: dailyPuzzle,
          mode: "daily",
        }));
        setSession(restored);
        setAnswer(restored.answerText);
        setElapsed(elapsedBridgeSeconds(restored));
        setFeedback(bridgeSessionMessage(restored));
        setTone(restored.status === "solved" ? "success" : "neutral");
        progressStorage.setItem(DAILY_KEY, JSON.stringify(serializeBridgeSession(restored)));
      }
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, [cancelQueuedCelebration, progressStorage, dailyPuzzle, playReady, today]);

  useEffect(() => {
    if (!isPlaying) return;
    let lastCloudCheckpoint = 0;
    const timer = window.setInterval(() => {
      const current = sessionRef.current;
      if (!current || current.status !== "active") return;
      const now = Date.now();
      const checkpoint = resumeBridgeSession(pauseBridgeSession(current, now), now);
      sessionRef.current = checkpoint;
      setElapsed(elapsedBridgeSeconds(checkpoint, now));
      progressStorage.setItem(
        checkpoint.mode === "daily" ? DAILY_KEY : bridgeResumeKey(checkpoint.puzzle.id),
        JSON.stringify(serializeBridgeSession(checkpoint)),
      );
      if (now - lastCloudCheckpoint >= 3000) {
        lastCloudCheckpoint = now;
        setSession(checkpoint);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, progressStorage]);

  useEffect(() => {
    const pauseForExit = () => {
      const current = sessionRef.current;
      if (!current || current.status !== "active") return;
      const paused = pauseBridgeSession(current);
      progressStorage.setItem(current.mode === "daily" ? DAILY_KEY : bridgeResumeKey(current.puzzle.id), JSON.stringify(serializeBridgeSession(paused)));
    };
    window.addEventListener("pagehide", pauseForExit);
    return () => window.removeEventListener("pagehide", pauseForExit);
  }, [progressStorage]);

  function saveProgress(next: BridgeProgress) {
    if (!progressReady) return;
    setProgress(next);
    progressStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  }

  function startPuzzle(puzzle: BridgePuzzle, mode: BridgeMode) {
    if (!playReady || (mode === "archive" && !archiveReady)) return;
    const stored = readJson<Record<string, unknown> | null>(bridgeResumeKey(puzzle.id), null, progressStorage);
    const next = stored?.status === "active" && stored.mode === mode
      ? resumeBridgeSession(hydrateBridgeSession({ payload: stored, puzzle, mode })) : createBridgeSession({ puzzle, mode });
    setSession(next);
    setAnswer(next.answerText);
    setElapsed(elapsedBridgeSeconds(next));
    setFeedback("Find the word that completes both phrases.");
    setTone("neutral");
    setIsPlaying(true);
    setShowCelebration(false);
    progressStorage.setItem(
      mode === "daily" ? DAILY_KEY : bridgeResumeKey(puzzle.id),
      JSON.stringify(serializeBridgeSession(next)),
    );
  }

  function openView(next: View) {
    cancelQueuedCelebration();
    const current = sessionRef.current;
    if (current?.status === "active") {
      const paused = pauseBridgeSession({ ...current, answerText: answer });
      setSession(paused);
      sessionRef.current = paused;
      progressStorage.setItem(current.mode === "daily" ? DAILY_KEY : bridgeResumeKey(current.puzzle.id), JSON.stringify(serializeBridgeSession(paused)));
    }
    writeBeforeAfterViewUrl(next);
    setView(next);
    setRoutedArchiveDate(undefined);
    setShowCelebration(false);
    setConfirmReset(false);
    if (next === "archive" && view !== "archive") setArchiveReady(false);
    if (next === "packs") {
      setIsPackOpen(false);
    }
    if (next === "daily" && playReady) {
      const storedProgress = readJson<BridgeProgress>(PROGRESS_KEY, EMPTY_PROGRESS, progressStorage);
      const completed = storedProgress.solved?.[`daily:${bridgeDateKey(today)}`] || storedProgress.solved?.[dailyPuzzle.id];
      const restored = completed ? completedBridgeSession(dailyPuzzle, "daily", completed) : resumeBridgeSession(hydrateBridgeSession({
        payload: readJson<Record<string, unknown> | null>(DAILY_KEY, null, progressStorage),
        puzzle: dailyPuzzle,
        mode: "daily",
      }));
      setSession(restored);
      setAnswer(restored.answerText);
      setElapsed(elapsedBridgeSeconds(restored));
      setFeedback(bridgeSessionMessage(restored));
      setTone(restored.status === "solved" ? "success" : "neutral");
      progressStorage.setItem(DAILY_KEY, JSON.stringify(serializeBridgeSession(restored)));
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
      setFeedback("Find the word that completes both phrases.");
      setTone("neutral");
    }
  }

  function changeAnswer(value: string) {
    const next = value.replace(/[^a-z]/gi, "").toLowerCase().slice(0, BEFORE_AFTER_ANSWER_LIMIT);
    setAnswer(next);
    setSession((current) => {
      const updated = current?.status === "active" ? { ...current, answerText: next } : current;
      sessionRef.current = updated;
      return updated;
    });
  }

  function choosePack(nextPackId: string) {
    if (!validPackId(nextPackId)) return;
    writeBeforeAfterViewUrl("packs", "push", { pack: nextPackId });
    setPackId(nextPackId);
    setPuzzleIndex(0);
    setIsPackOpen(true);
  }

  function closePack() {
    writeBeforeAfterViewUrl("packs");
    setIsPackOpen(false);
  }

  function choosePackPuzzle(index: number) {
    const puzzle = currentPack.puzzles[index];
    if (!puzzle) return;
    setPuzzleIndex(index);
    const completed = progress.solved[`packs:${puzzle.id}`] || progress.solved[puzzle.id];
    if (completed) {
      const restored = completedBridgeSession(puzzle, "packs", completed);
      setSession(restored);
      sessionRef.current = restored;
      setAnswer(restored.answerText);
      setElapsed(elapsedBridgeSeconds(restored));
      setFeedback("Bridge complete.");
      setTone("success");
      setIsPlaying(true);
      setShowCelebration(false);
      return;
    }
    startPuzzle(puzzle, "packs");
  }

  function chooseArchivePuzzle(index: number, updateUrl = true) {
    const chronological = [...archive].reverse();
    const entry = chronological[index];
    if (!entry) return;
    if (updateUrl) writeBeforeAfterViewUrl("archive", "push", { date: entry.date });
    setArchivePuzzleIndex(index);
    const completed = progress.solved[`daily:${entry.date}`] || progress.solved[entry.puzzle.id];
    if (completed) {
      const restored = completedBridgeSession(entry.puzzle, "archive", completed);
      setSession(restored);
      sessionRef.current = restored;
      setAnswer(restored.answerText);
      setElapsed(elapsedBridgeSeconds(restored));
      setFeedback("Bridge complete.");
      setTone("success");
      setIsPlaying(true);
      return;
    }
    startPuzzle(entry.puzzle, "archive");
  }

  function submit() {
    if (!session) return;
    const result = submitBridgeAnswer(session, answer, Date.now());
    if (!result.accepted) {
      setFeedback("Type a word before submitting.");
      setTone("error");
      return;
    }
    if (!result.correct) {
      const nextState = { ...result.state, answerText: "" };
      setSession(nextState);
      setAnswer("");
      progressStorage.setItem(
        session.mode === "daily" ? DAILY_KEY : bridgeResumeKey(session.puzzle.id),
        JSON.stringify(serializeBridgeSession(nextState)),
      );
      saveProgress({ ...progress, totalAttempts: progress.totalAttempts + 1 });
      setFeedback(`“${answer.trim().toLowerCase()}” doesn’t complete both phrases. Try another bridge.`);
      setTone("error");
      return;
    }
    setSession(result.state);
    setElapsed(elapsedBridgeSeconds(result.state));
    if (session.mode === "daily") progressStorage.setItem(DAILY_KEY, JSON.stringify(serializeBridgeSession(result.state)));
    else progressStorage.removeItem(bridgeResumeKey(session.puzzle.id));
    const archiveDate = session.mode === "archive" ? [...archive].reverse()[archivePuzzleIndex]?.date : undefined;
    const dateKey = session.mode === "daily" ? bridgeDateKey(today) : archiveDate;
    const progressKey = session.mode === "packs" ? `packs:${session.puzzle.id}` : dateKey ? `daily:${dateKey}` : `${session.mode}:${session.puzzle.id}`;
    const dailyDates = dateKey
      ? [...new Set([...progress.dailyDates, dateKey])]
      : progress.dailyDates;
    saveProgress({
      solved: {
        ...progress.solved,
        [progressKey]: {
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
    queueCompletedCelebration();
  }

  function giveUp() {
    if (!session || session.status !== "active") return;
    const next = revealBridgeAnswer(session, Date.now());
    setSession(next);
    setAnswer(next.answerText);
    setElapsed(elapsedBridgeSeconds(next));
    setFeedback("Answer revealed. This puzzle does not count as complete.");
    setTone("neutral");
    if (session.mode === "daily") {
      progressStorage.setItem(DAILY_KEY, JSON.stringify(serializeBridgeSession(next)));
    } else {
      progressStorage.removeItem(bridgeResumeKey(session.puzzle.id));
    }
  }

  function selectTheme(next: ThemeId) {
    setTheme(next);
  }

  async function resetProgress() {
    if (!playReady) return;
    setResetting(true);
    setResetError("");
    setSession(null);
    sessionRef.current = null;
    setAnswer("");
    setElapsed(0);
    setShowCelebration(false);
    try {
      await gameProgress?.sync.clearGame("before-after");
      progressStorage.setItem(RESET_KEY, new Date().toISOString());
      progressStorage.removeItem(PROGRESS_KEY);
      progressStorage.removeItem(DAILY_KEY);
      for (const puzzle of allBridgePuzzles) progressStorage.removeItem(bridgeResumeKey(puzzle.id));
      setProgress(EMPTY_PROGRESS);
      setConfirmReset(false);
    } catch {
      setResetError("Progress could not be cleared. Check your connection and try again.");
    } finally {
      setResetting(false);
    }
  }

  const waiting = !playReady || (view === "archive" && !archiveReady);
  const loadingMessage = restoration.conflict ? "choose which save to continue." : showLoading ? "getting your puzzles ready…" : "";
  return (
    <div className="before-after-game-card" data-theme={theme} data-theme-restored={themeRestored} data-view={isPlaying ? "play" : view}>
      <GameLocalBar
        ariaLabel="Before and After"
        brand={<BeforeAfterWordmark compact />}
        className="game-local-bar--before-after"
        items={[
          { label: "Menu", current: view === "menu" && !isPlaying, onSelect: () => openView("menu") },
          { label: "Daily", current: view === "daily", onSelect: () => openView("daily") },
          { label: "Packs", current: view === "packs" || (isPlaying && session?.mode === "packs"), onSelect: () => openView("packs") },
          { label: "Archive", current: view === "archive" || (isPlaying && session?.mode === "archive"), onSelect: () => openView("archive") },
          { label: "Themes", current: view === "themes", onSelect: () => openView("themes") },
          { label: "How to Play", current: view === "how-to", onSelect: () => openView("how-to") },
          { label: "Settings", current: view === "settings", onSelect: () => openView("settings") },
        ]}
        onHome={() => openView("menu")}
      />
      {view === "menu" ? (
        <MainMenu onOpen={openView} />
      ) : waiting && view !== "themes" && view !== "how-to" ? (
        restoration.conflict ? (
          <section className="ba-view ba-startup-pending">
            <h2>{view === "daily" ? "daily puzzle" : view}</h2>
            <p role="status">{loadingMessage}</p>
            <button type="button" onClick={() => openView("menu")}>back to menu</button>
          </section>
        ) : <BeforeAfterRouteRestoring view={view} message={loadingMessage} />
      ) : isPlaying && session ? (
        <PlayView
          answer={answer}
          currentPack={currentPack}
          feedback={feedback}
          onAnswer={changeAnswer}
          onClear={() => changeAnswer("")}
          onGiveUp={giveUp}
          onNext={session.mode === "packs"
            ? () => choosePackPuzzle((puzzleIndex + 1) % currentPack.puzzles.length)
            : session.mode === "archive" && archivePuzzleIndex < archive.length - 1
              ? () => chooseArchivePuzzle(archivePuzzleIndex + 1)
              : undefined}
          onPrevious={session.mode === "packs"
            ? () => choosePackPuzzle((puzzleIndex - 1 + currentPack.puzzles.length) % currentPack.puzzles.length)
            : session.mode === "archive" && archivePuzzleIndex > 0
              ? () => chooseArchivePuzzle(archivePuzzleIndex - 1)
              : undefined}
          onSubmit={submit}
          puzzleIndex={puzzleIndex}
          elapsed={elapsed}
          session={session}
          tone={tone}
        />
      ) : (
        <section className="ba-view ba-route-ready" data-pack-direction={view === "packs" && isPackOpen ? currentPackDirection : undefined} key={view}>
          <header className="ba-view-heading"><h2>{view === "packs" ? (isPackOpen ? currentPack.name.toLowerCase() : "puzzle packs") : view === "how-to" ? "how to play" : view}</h2></header>
          {view === "packs" && (
            <PacksView currentPack={currentPack} isOpen={isPackOpen} progress={progress} onBack={closePack} onPack={choosePack} onPuzzle={choosePackPuzzle} />
          )}
          {view === "archive" && (
            <ArchiveView archive={archive} progress={progress} onPuzzle={chooseArchivePuzzle} />
          )}
          {view === "themes" && <ThemesView selected={theme} onSelect={selectTheme} />}
          {view === "how-to" && <HowToView onPlay={() => openView("daily")} />}
          {view === "settings" && (
            <SettingsView confirmReset={confirmReset} error={resetError} resetting={resetting} onConfirm={resetProgress} onToggle={() => setConfirmReset((value) => !value)} />
          )}
        </section>
      )}

      {showCelebration && session?.status === "solved" && (
        <Celebration
          onClose={() => setShowCelebration(false)}
          onNext={session.mode === "packs" ? () => {
            setShowCelebration(false);
            choosePackPuzzle((puzzleIndex + 1) % currentPack.puzzles.length);
          } : session.mode === "archive" && archivePuzzleIndex < archive.length - 1 ? () => {
            setShowCelebration(false);
            chooseArchivePuzzle(archivePuzzleIndex + 1);
          } : undefined}
          session={session}
        />
      )}
    </div>
  );
}

function MainMenu({ onOpen }: { onOpen: (view: View) => void }) {
  return (
    <section className="ba-menu">
      <div className="ba-menu-hero">
        <BeforeAfterWordmark />
        <p>one word. two phrases. can you bridge the gap?</p>
      </div>
      <div className="ba-menu-grid">
        {MENU_ITEMS.map((item) => (
          <button className={`ba-menu-tile is-${item.view}`} data-core-view={CORE_VIEWS.includes(item.view as (typeof CORE_VIEWS)[number]) || undefined} key={item.view} onClick={() => onOpen(item.view)} type="button">
            <BeforeAfterMenuIcon name={item.view} />
            <span><strong>{item.title}</strong><small>{item.subtitle}</small></span>
            <i>›</i>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlayView({
  answer,
  currentPack,
  elapsed,
  feedback,
  onAnswer,
  onClear,
  onGiveUp,
  onNext,
  onPrevious,
  onSubmit,
  puzzleIndex,
  session,
  tone,
}: {
  answer: string;
  currentPack: BridgePack;
  elapsed: number;
  feedback: string;
  onAnswer: (value: string) => void;
  onClear: () => void;
  onGiveUp: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSubmit: () => void;
  puzzleIndex: number;
  session: BridgeSession;
  tone: string;
}) {
  const revealed = session.status !== "active";
  const modeLabel = session.mode === "daily" ? "daily" : session.mode === "packs" ? currentPack.name.toLowerCase() : session.mode;
  const answerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.status === "active") answerInputRef.current?.focus({ preventScroll: true });
  }, [session.puzzle.id, session.status]);

  return (
    <section className={`ba-play ba-route-ready is-${session.status}`}>
      <header className="ba-play-nav">
        <div className="ba-play-mode"><small>playing</small><strong>{modeLabel}</strong></div>
        <div className="ba-play-clock"><small>elapsed time</small><strong>{formatStopwatch(elapsed)}</strong></div>
        <div className="ba-play-attempts"><small>attempts</small><strong>{session.attempts}</strong></div>
      </header>
      <div className={`ba-play-stage${session.mode === "daily" ? " is-daily" : ""}`}>
        {session.mode !== "daily" && (
          onPrevious
            ? <button className="ba-card-step is-previous" aria-label="Previous puzzle" onClick={onPrevious} type="button"><span>←</span><small>previous</small></button>
            : <span className="ba-card-step is-placeholder" aria-hidden="true" />
        )}
        <div className="ba-play-layout">
          <div className="ba-puzzle-card">
            <p className="ba-instruction">{beforeAfterInstruction(session.puzzle)}</p>
            <BeforeAfterPhraseRows puzzle={session.puzzle} answer={answer} revealed={revealed} />
            <div className="ba-entry-zone">
              <form className="ba-entry-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
                <label htmlFor="before-after-answer">your bridge</label>
                <div>
                  <input
                    autoComplete="off"
                    autoFocus
                    disabled={session.status !== "active"}
                    id="before-after-answer"
                    maxLength={BEFORE_AFTER_ANSWER_LIMIT}
                    onChange={(event) => onAnswer(event.target.value)}
                    ref={answerInputRef}
                    spellCheck={false}
                    value={answer}
                  />
                  <button disabled={session.status !== "active" || !answer.trim()} type="submit">submit</button>
                </div>
              </form>
              <div className="ba-feedback-row">
                <p className={`ba-feedback is-${tone}`} aria-live="polite">{feedback}</p>
                <div>
                  {session.status === "active" && answer && <button onClick={onClear} type="button">clear</button>}
                  {session.status === "active" && <button className="is-give-up" onClick={onGiveUp} type="button">reveal answer</button>}
                </div>
              </div>
            </div>
          </div>
        </div>
        {session.mode !== "daily" && (
          onNext
            ? <button className="ba-card-step is-next" aria-label="Next puzzle" onClick={onNext} type="button"><small>next</small><span>→</span></button>
            : <span className="ba-card-step is-placeholder" aria-hidden="true" />
        )}
      </div>
      <footer className="ba-play-footer">
        {session.mode === "packs" && <span>{puzzleIndex + 1} of {currentPack.puzzles.length}</span>}
      </footer>
    </section>
  );
}

function PacksView({ currentPack, isOpen, progress, onBack, onPack, onPuzzle }: {
  currentPack: BridgePack;
  isOpen: boolean;
  progress: BridgeProgress;
  onBack: () => void;
  onPack: (id: string) => void;
  onPuzzle: (index: number) => void;
}) {
  if (isOpen) {
    const solved = currentPack.puzzles.filter((puzzle) => progress.solved[`packs:${puzzle.id}`] || progress.solved[puzzle.id]).length;
    const completion = currentPack.puzzles.length ? (solved / currentPack.puzzles.length) * 100 : 0;
    return (
      <div className="ba-library ba-pack-detail">
        <button className="ba-pack-back" onClick={onBack} type="button"><span aria-hidden="true">←</span> all packs</button>
        <section className="ba-pack-detail-panel" aria-label={`${currentPack.name} puzzles`}>
          <header className="ba-pack-detail-heading">
            <p>{currentPack.description}</p>
            <div className="ba-pack-progress" aria-label={`${solved} of ${currentPack.puzzles.length} puzzles complete`}>
              <span><strong>{solved}</strong> of {currentPack.puzzles.length} complete</span>
              <i aria-hidden="true"><b style={{ width: `${completion}%` }} /></i>
            </div>
          </header>
          <div className="ba-puzzle-grid">
            {currentPack.puzzles.map((puzzle, index) => {
              const puzzleSolved = progress.solved[`packs:${puzzle.id}`] || progress.solved[puzzle.id];
              const phrases = puzzleSolved ? bridgePhrases(puzzle).map((phrase) => phrase.toLowerCase()) : [];
              return <button aria-label={`Puzzle ${index + 1}, ${puzzleSolved ? `complete: ${phrases.join(", ")}` : "open"}`} className={puzzleSolved ? "is-solved" : ""} key={puzzle.id} onClick={() => onPuzzle(index)} type="button">
                <span className="ba-puzzle-tile-head">
                  <b className="ba-puzzle-number">{String(index + 1).padStart(2, "0")}</b>
                  {puzzleSolved && <i className="ba-puzzle-check" aria-hidden="true">✓</i>}
                </span>
                {puzzleSolved ? (
                  <span className="ba-puzzle-phrases"><span>{phrases[0]}</span><span>{phrases[1]}</span></span>
                ) : null}
                <small>{puzzleSolved ? "complete" : "play puzzle"}</small>
              </button>;
            })}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="ba-library">
      {bridgePackCollections.map((collection) => <section className="ba-pack-collection" data-collection={collection.id} key={collection.id}>
      <div className="ba-section-intro"><p>{collection.name}</p><span>{collection.description}</span></div>
      <div className="ba-pack-grid" data-pack-count={collection.packs.length}>
        {collection.packs.map((pack, index) => {
          const solved = pack.puzzles.filter((puzzle) => progress.solved[`packs:${puzzle.id}`] || progress.solved[puzzle.id]).length;
          return (
            <button className={`ba-pack-card is-pack-${index}`} data-pack={pack.id} key={pack.id} onClick={() => onPack(pack.id)} type="button">
              <span><strong>{pack.name.toLowerCase()}</strong><small>{pack.description}</small></span>
              <b>{solved}/{pack.puzzles.length}</b>
              <i><span style={{ width: `${(solved / pack.puzzles.length) * 100}%` }} /></i>
            </button>
          );
        })}
      </div>
      </section>)}
    </div>
  );
}

function ArchiveView({ archive, progress, onPuzzle }: {
  archive: ReturnType<typeof bridgeArchive>;
  progress: BridgeProgress;
  onPuzzle: (index: number) => void;
}) {
  const chronological = [...archive].reverse();
  const monthKeys = [...new Set(chronological.map((entry) => entry.date.slice(0, 7)))];
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeys.at(-1) ?? bridgeDateKey(new Date()).slice(0, 7));
  const monthIndex = Math.max(0, monthKeys.indexOf(selectedMonth));
  const visibleEntries = chronological.filter((entry) => entry.date.startsWith(selectedMonth));
  const firstDate = visibleEntries[0]?.date ? new Date(`${visibleEntries[0].date}T12:00:00`) : new Date();
  const leadingDays = firstDate.getDay();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthLabel = firstDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <div className="ba-library">
      <div className="ba-calendar-shell">
        <nav className="ba-calendar-month" aria-label="Archive month">
          <button disabled={monthIndex <= 0} onClick={() => setSelectedMonth(monthKeys[monthIndex - 1])} type="button" aria-label="Previous month">←</button>
          <strong>{monthLabel}</strong>
          <button disabled={monthIndex >= monthKeys.length - 1} onClick={() => setSelectedMonth(monthKeys[monthIndex + 1])} type="button" aria-label="Next month">→</button>
        </nav>
        <div className="ba-calendar-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="ba-calendar-grid">
          {Array.from({ length: leadingDays }, (_, index) => <span className="ba-calendar-blank" key={`blank-${index}`} />)}
          {visibleEntries.map((entry) => {
            const solved = progress.dailyDates.includes(entry.date) || progress.solved[`daily:${entry.date}`] || progress.solved[entry.puzzle.id];
            const date = new Date(`${entry.date}T12:00:00`);
            const isToday = entry.date === chronological.at(-1)?.date;
            const archiveIndex = chronological.findIndex((candidate) => candidate.date === entry.date);
            return (
              <button className={`${solved ? "is-solved " : ""}${isToday ? "is-today" : ""}`} data-variant={archiveIndex % 4} key={entry.date} onClick={() => onPuzzle(archiveIndex)} type="button">
                <time dateTime={entry.date}><b>{date.getDate()}</b><span>{date.toLocaleDateString(undefined, { weekday: "short" })}</span></time>
                <small className="ba-calendar-status">{solved ? "complete" : isToday ? "today" : "open"}</small>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ThemesView({ selected, onSelect }: { selected: ThemeId; onSelect: (theme: ThemeId) => void }) {
  return (
    <div className="ba-themes-page">
      <div className="ba-section-intro"><p>choose your atmosphere</p></div>
      <div className="ba-theme-grid">
        {THEMES.map((theme) => (
          <button className={`ba-theme-card is-${theme.id}${selected === theme.id ? " is-current" : ""}`} data-preview={theme.id} key={theme.id} aria-pressed={selected === theme.id} onClick={() => onSelect(theme.id)} type="button">
            <span className="ba-theme-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
            <span className="ba-theme-palette" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</span>
            <span className="ba-theme-state">{selected === theme.id ? "✓ selected" : "use theme"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function HowToView({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="ba-how-page">
      <div className="ba-section-intro"><p>find the bridge</p><span>One word completes two familiar phrases.</span></div>
      <section className="ba-how-example" aria-label="Example: hot dog and dog house">
        <span><small>first phrase</small><strong>hot <AnimatedBridgeWord /></strong></span>
        <i aria-hidden="true">+</i>
        <span><small>second phrase</small><strong><AnimatedBridgeWord /> house</strong></span>
      </section>
      <div className="ba-how-steps">
        <article><span>1</span><div><h3>read both clues</h3><p>The blank may come before, after, or on opposite sides of the clue words.</p></div></article>
        <article><span>2</span><div><h3>enter one word</h3><p>Type the single bridge word that makes both resulting phrases familiar.</p></div></article>
        <article><span>3</span><div><h3>make both phrases</h3><p>For example, <b>dog</b> completes both “hot dog” and “dog house.”</p></div></article>
      </div>
      <aside className="ba-how-note"><b>Need the answer?</b><span>Reveal Answer ends the attempt without marking the puzzle complete.</span></aside>
      <button className="ba-how-play" onClick={onPlay} type="button">play today’s puzzle</button>
    </div>
  );
}

function AnimatedBridgeWord() {
  return <b className="ba-how-bridge" aria-label="dog"><span>d</span><span>o</span><span>g</span></b>;
}

function SettingsView({ confirmReset, error, resetting, onConfirm, onToggle }: { confirmReset: boolean; error: string; resetting: boolean; onConfirm: () => void; onToggle: () => void }) {
  return (
    <div className="ba-settings-page">
      <div className="ba-section-intro"><p>your game</p><span>Before&amp;After saves progress automatically while you play.</span></div>
      <section className="ba-settings-card">
        <div className="ba-settings-copy">
          <span>saved progress</span>
          <h3>start over</h3>
          <p>Clear completed puzzles, Daily history, attempts, and streak data. Your selected theme will remain in place.</p>
        </div>
        {!confirmReset ? (
          <button disabled={resetting} onClick={onToggle} type="button">reset all progress</button>
        ) : (
          <div className="ba-confirm" role="group" aria-label="Confirm progress reset">
            <strong>This cannot be undone.</strong>
            <button disabled={resetting} onClick={onConfirm} type="button">{resetting ? "resetting…" : "yes, reset everything"}</button>
            <button disabled={resetting} onClick={onToggle} type="button">keep my progress</button>
          </div>
        )}
      </section>
      {error && <p className="ba-reset-error" role="alert">{error}</p>}
    </div>
  );
}

function Celebration({ session, onClose, onNext }: { session: BridgeSession; onClose: () => void; onNext?: () => void }) {
  const attemptsAward = attemptBadge(session.attempts);
  const speedAward = speedBadge(session.durationMs || 0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const game = dialog?.closest(".before-after-game-card");
    const background = game && dialog
      ? Array.from(game.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog)
      : [];
    const backgroundState = background.map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }));

    for (const element of background) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    closeRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="ba-celebration" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ba-celebration-title" tabIndex={-1}>
      <div className="ba-confetti" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} />)}</div>
      <div className="ba-celebration-card">
        <button className="ba-celebration-close" ref={closeRef} onClick={onClose} type="button" aria-label="Close puzzle results">×</button>
        <h2 id="ba-celebration-title">congratulations!</h2>
        <div className="ba-solved-phrases">
          <BeforeAfterPhraseRows puzzle={session.puzzle} answer={session.puzzle.answer} revealed />
        </div>
        <div className="ba-celebration-stats">
          <article className="is-attempts">
            <small>attempts</small>
            <strong>{session.attempts}</strong>
            {attemptsAward && <span className="ba-performance-badge" data-tier={attemptsAward.tier}><i aria-hidden="true" />{attemptsAward.label}</span>}
          </article>
          <article className="is-speed">
            <small>solve time</small>
            <strong>{formatDuration(session.durationMs || 0)}</strong>
            {speedAward && <span className="ba-performance-badge" data-tier={speedAward.tier}><i aria-hidden="true" />{speedAward.label}</span>}
          </article>
        </div>
        {onNext && <button className="ba-celebration-primary" onClick={onNext} type="button">next puzzle</button>}
        <button className="ba-celebration-secondary" onClick={onClose} type="button">stay here</button>
      </div>
    </div>
  );
}
