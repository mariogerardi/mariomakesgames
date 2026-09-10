"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import "./decode.css";
import { gameStorageKey } from "../../platform/storage";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import {
  decodeModePuzzleBank,
  selectDecodePuzzleFromPool,
  selectDailyDecodePuzzles,
  type DecodePuzzle,
} from "./catalog";
import { loadLocalStudioPublished, loadLocalStudioSlot } from "../../authoring/local-runtime";
import { decodePayloadEntries } from "../../authoring/decode-payload";
import {
  createDecodeState,
  decodeDisplayAnswer,
  decodeTimedWordLength,
  deriveDecodeFeedback,
  evaluateDecodeAttempt,
  formatDecodeTime,
  normalizeDecodeInput,
  tickDecodeClock,
  type DecodeFeedback,
  type DecodeMode,
  type DecodeState,
} from "./engine.mjs";
import { dailyRunId, sessionRunId, useGameRunPersistence } from "../../platform/game-run-persistence";
import type { GameRun } from "../../platform/runs.mjs";
import { useGameProgress, useGameRestoration, useProgressStorage } from "../../platform/game-progress-provider";
import type { DeviceStore } from "../../platform/storage";
import { resumeDecodeCheckpoint } from "./resume.mjs";
import { useGameTheme } from "../../platform/game-theme-provider";

const PROGRESS_KEY = gameStorageKey("decode", "progress");
const MODES = ["daily-5", "timed", "zen"] as const;
const DECODE_VIEWS = ["home", "daily-5", "timed", "zen", "how-to", "themes"] as const;
type DecodeView = (typeof DECODE_VIEWS)[number];

const DECODE_THEMES = [
  { id: "console", name: "Console", description: "The original dark decoding room.", mode: "dark", background: "#090b10", surface: "#121720", accent: "#875fd8", correct: "#147f45", present: "#315fae", absent: "#5f6672" },
  { id: "ultraviolet", name: "Ultraviolet", description: "Electric violet on deep aubergine.", mode: "dark", background: "#120d1d", surface: "#1b132a", accent: "#c04dff", correct: "#168453", present: "#4169c4", absent: "#655d70" },
  { id: "deep-sea", name: "Deep Sea", description: "Cold instruments below the surface.", mode: "dark", background: "#061318", surface: "#0b2228", accent: "#20b8bd", correct: "#168052", present: "#3267b5", absent: "#53666a" },
  { id: "redshift", name: "Redshift", description: "A warm signal against near-black red.", mode: "dark", background: "#180a0b", surface: "#261012", accent: "#df4e3f", correct: "#217a55", present: "#3f69a7", absent: "#6e5b5d" },
  { id: "paper-tape", name: "Paper Tape", description: "Warm stock and archival ink.", mode: "light", background: "#f3f0e9", surface: "#fffdf8", accent: "#6946b8", correct: "#26865a", present: "#2f69b3", absent: "#747b83" },
  { id: "blueprint", name: "Blueprint", description: "A clean cyan technical drawing.", mode: "light", background: "#e9f2f4", surface: "#f8fcfc", accent: "#116a7b", correct: "#1f7b52", present: "#315fab", absent: "#66777c" },
  { id: "daybreak", name: "Daybreak", description: "Warm light across a quiet terminal.", mode: "light", background: "#fff4df", surface: "#fffaf0", accent: "#a65419", correct: "#257852", present: "#3566a7", absent: "#7c7466" },
  { id: "soft-circuit", name: "Soft Circuit", description: "Lilac glass with grounded signals.", mode: "light", background: "#f3eff9", surface: "#fdfbff", accent: "#754fb3", correct: "#25825b", present: "#3d65b4", absent: "#777080" },
] as const;
type DecodeTheme = (typeof DECODE_THEMES)[number]["id"];

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const MODE_DETAILS: Record<DecodeMode, { eyebrow: string; title: string; description: string; action: string; rules: string[] }> = {
  "daily-5": {
    eyebrow: "Daily sequence",
    title: "Daily 5",
    description: "Decode five authored signals while the clock counts upward.",
    action: "begin today’s sequence",
    rules: ["The same five signals are available to everyone today.", "The clock counts up across the full sequence.", "Decode all five to complete the Daily."],
  },
  timed: {
    eyebrow: "Timed run",
    title: "Beat the clock!",
    description: "Each correct answer restores the clock. Every ten signals raises the word length.",
    action: "start a timed run",
    rules: ["Each signal begins with twenty seconds.", "A correct answer resets the clock to twenty.", "Word length increases after every ten decoded signals."],
  },
  zen: {
    eyebrow: "Untimed run",
    title: "Decode freely",
    description: "Choose a word length and continue through an uninterrupted stream of signals.",
    action: "start a zen run",
    rules: ["There is no clock and no run-ending mistake.", "Choose a four-, five-, six-, or seven-letter stream.", "Keep decoding for as long as you like."],
  },
};

function decodeViewFromUrl(): DecodeView {
  if (typeof window === "undefined") return "home";
  const requested = new URL(window.location.href).searchParams.get("view");
  return DECODE_VIEWS.includes(requested as DecodeView) ? requested as DecodeView : "home";
}

function writeDecodeViewUrl(view: DecodeView, mode: "push" | "replace" = "push") {
  const url = new URL(window.location.href);
  if (view === "home") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

type DecodeProgress = {
  bestTimedScore: number;
  bestDailySeconds: number | null;
  timedRuns: number;
  dailyCompletions: number;
};

const EMPTY_PROGRESS: DecodeProgress = {
  bestTimedScore: 0,
  bestDailySeconds: null,
  timedRuns: 0,
  dailyCompletions: 0,
};

function readProgress(storage: DeviceStore) {
  try {
    const value = JSON.parse(storage.getItem(PROGRESS_KEY) || "") as Partial<DecodeProgress>;
    return {
      bestTimedScore: Math.max(0, Number(value.bestTimedScore) || 0),
      bestDailySeconds:
        value.bestDailySeconds === null || !Number.isFinite(Number(value.bestDailySeconds))
          ? null
          : Math.max(0, Number(value.bestDailySeconds)),
      timedRuns: Math.max(0, Number(value.timedRuns) || 0),
      dailyCompletions: Math.max(0, Number(value.dailyCompletions) || 0),
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function modeLabel(mode: DecodeMode) {
  if (mode === "timed") return "Timed";
  if (mode === "daily-5") return "Daily 5";
  return "Zen";
}

function feedbackLabel(feedback: DecodeFeedback) {
  if (feedback === "correct") return "same position";
  if (feedback === "present") return "different position";
  return "not used";
}

function DecodeTileWordmark({ compact = false }: { compact?: boolean }) {
  const states: DecodeFeedback[] = ["correct", "present", "correct", "present", "absent", "correct"];
  return (
    <div className={`decode-home-wordmark${compact ? " is-compact" : ""}`} aria-label="DECODE">
      {"DECODE".split("").map((letter, index) => (
        <span className={`is-${states[index]}`} key={`${letter}-${index}`}>{letter}</span>
      ))}
    </div>
  );
}

function useModalFocus(
  containerRef: RefObject<HTMLElement | null>,
  initialRef: RefObject<HTMLButtonElement | null>,
  onDismiss: () => void,
) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const dialog = container?.closest<HTMLElement>("[role='dialog'][aria-modal='true']") ?? null;
    const game = dialog?.closest(".decode-game-card");
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
        ) || [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const focusFrame = window.requestAnimationFrame(() => initialRef.current?.focus({ preventScroll: true }));
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      for (const { element, inert, ariaHidden } of backgroundState) {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [containerRef, initialRef]);
}

export function DecodeGame({ initialRoute }: { initialRoute?: { view?: string } }) {
  const gameProgress = useGameProgress();
  const progressStorage = useProgressStorage();
  const restoration = useGameRestoration();
  const [theme, setTheme, themeRestored] = useGameTheme<DecodeTheme>("decode", "console");
  const [hydratedRevision, setHydratedRevision] = useState<typeof restoration.revision | undefined>(undefined);
  // The checked-in catalog is complete and immediately playable. Studio data
  // is an optional enhancement, never a prerequisite for starting a mode.
  const [dailyReady, setDailyReady] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasHydrated = useRef(false);
  const locallyStartedRun = useRef(false);
  const approvedTimedExit = useRef(false);
  const recordedExpiry = useRef(false);
  const transitionTimer = useRef<number | null>(null);
  const dailyResultTimer = useRef<number | null>(null);
  const [runMeta, setRunMeta] = useState(() => ({ startedAt: new Date().toISOString(), puzzleId: "decode-run" }));
  const [todayKey, setTodayKey] = useState(() => localDateKey());
  const [mode, setMode] = useState<DecodeMode>("timed");
  const [view, setView] = useState<DecodeView>(() => DECODE_VIEWS.includes(initialRoute?.view as DecodeView) ? initialRoute!.view as DecodeView : "home");
  const [zenLength, setZenLength] = useState<4 | 5 | 6 | 7>(4);
  const [dailyPuzzles, setDailyPuzzles] = useState<DecodePuzzle[]>(() => [...selectDailyDecodePuzzles()]);
  const [localModePuzzles, setLocalModePuzzles] = useState<Record<"timed" | "zen", DecodePuzzle[]>>({ timed: [], zen: [] });
  const [run, setRun] = useState<DecodeState | null>(null);
  const progressReady = restoration.ready && hydratedRevision === restoration.revision;
  const [puzzle, setPuzzle] = useState<DecodePuzzle | null>(null);
  const [pendingPuzzle, setPendingPuzzle] = useState<DecodePuzzle | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("Choose a mode, then begin your run.");
  const [tone, setTone] = useState<"neutral" | "error" | "success">("neutral");
  const [wrongPulse, setWrongPulse] = useState(false);
  const [correctPulse, setCorrectPulse] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [dailyPaused, setDailyPaused] = useState(false);
  const [dailyResumeAvailable, setDailyResumeAvailable] = useState(false);
  const [showDailyResult, setShowDailyResult] = useState(false);
  const [timedExit, setTimedExit] = useState<{ next?: DecodeView; href?: string } | null>(null);
  const [progress, setProgress] = useState<DecodeProgress>(EMPTY_PROGRESS);
  const active = run?.status === "playing";
  const interactive = Boolean(active && !transitioning);
  const platformRun = useMemo<GameRun<"decode"> | null>(() => {
    if (!run || !puzzle) return null;
    const date = run.mode === "daily-5" ? localDateKey(new Date(runMeta.startedAt)) : undefined;
    const id = run.mode === "daily-5"
      ? dailyRunId("decode", run.mode, date!)
      : sessionRunId("decode", run.mode, runMeta.startedAt);
    return {
      schemaVersion: 1,
      runId: id,
      playerId: null,
      gameId: "decode",
      mode: run.mode,
      puzzle: { id: runMeta.puzzleId, revision: 1, ...(date ? { date } : {}) },
      startedAt: runMeta.startedAt,
      completedAt: run.status === "playing" ? null : new Date().toISOString(),
      outcome: run.status === "playing" ? "in-progress" : "completed",
      score: run.score,
      checkpoint: { version: 1, state: { native: { run, puzzle: transitioning && pendingPuzzle ? pendingPuzzle : puzzle, runMeta, zenLength, dailyPuzzles } } },
      result: {
        score: run.score,
        signalsCompleted: run.score,
        ...(run.mode === "daily-5" ? { elapsedSeconds: run.elapsedSeconds } : {}),
        ...(run.status === "playing" ? {} : { finalAnswer: puzzle.answer }),
      },
    };
  }, [puzzle, pendingPuzzle, run, runMeta, transitioning, zenLength, dailyPuzzles]);
  useGameRunPersistence(platformRun);

  useEffect(() => {
    if (!restoration.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const preserveInitialRun = !hasHydrated.current && locallyStartedRun.current;
      hasHydrated.current = true;
      setProgress(readProgress(progressStorage));
      setHydratedRevision(restoration.revision);
      if (!preserveInitialRun) {
        locallyStartedRun.current = false;
        setDailyResumeAvailable(false);
        setRun(null);
        setPuzzle(null);
        setAnswer("");
        setTransitioning(false);
        setPendingPuzzle(null);
        setCorrectPulse(false);
        setWrongPulse(false);
        setDailyPaused(false);
      }
      setTimedExit(null);
    });
    return () => {
      cancelled = true;
    };
  }, [progressStorage, restoration.ready, restoration.revision]);

  useEffect(() => {
    let cancelled = false;
    void loadLocalStudioPublished("decode").then((documents) => {
      if (cancelled) return;
      const latest = [...documents.reduce((items, document) => {
        const current = items.get(document.id);
        if (!current || current.revision < document.revision) items.set(document.id, document);
        return items;
      }, new Map<string, (typeof documents)[number]>()).values()];
      const collect = (mode: "timed" | "zen") => latest.flatMap((document) => document.gameId === "decode" && document.payload.modes.includes(mode)
        ? decodePayloadEntries(document.payload).map((entry, index) => ({ id: `${document.id}-${index + 1}`, ...entry, ...(document.payload.theme ? { theme: document.payload.theme } : {}) }))
        : []);
      setLocalModePuzzles({ timed: collect("timed"), zen: collect("zen") });
    }).catch(() => { /* The complete checked-in banks remain available. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTodayKey((current) => {
      const next = localDateKey();
      return next === current ? current : next;
    }), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setDailyPuzzles([...selectDailyDecodePuzzles()]);
    });
    void loadLocalStudioSlot("decode", "daily-5", todayKey).then((documents) => {
      if (cancelled) return;
      const entries = documents.flatMap((document) => document.gameId === "decode" ? decodePayloadEntries(document.payload).map((entry, index) => ({
        id: `${document.id}-${index + 1}`,
        ...entry,
        ...(document.payload.theme ? { theme: document.payload.theme } : {}),
      })) : []);
      if (entries.length === 5) setDailyPuzzles(entries);
      setDailyReady(true);
    }).catch(() => {
      if (!cancelled) setDailyReady(true);
    });
    return () => { cancelled = true; };
  }, [todayKey]);

  useEffect(() => {
    if (run?.mode !== "daily-5" || localDateKey(new Date(runMeta.startedAt)) === todayKey) return;
    // The durable run has already been staged under yesterday's dated run ID.
    // Clear only the singleton resume slot so today's sequence can begin fresh.
    progressStorage.removeItem("mg-games:v1:decode:resume-daily-5");
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRun(null);
      setPuzzle(null);
      setPendingPuzzle(null);
      setAnswer("");
      setTransitioning(false);
      setDailyPaused(false);
      setDailyResumeAvailable(false);
      setFeedback("Today’s Daily 5 is ready.");
      setTone("neutral");
    });
    return () => { cancelled = true; };
  }, [progressStorage, run?.mode, runMeta.startedAt, todayKey]);

  useEffect(() => {
    if (!active || transitioning || dailyPaused || timedExit || run?.mode === "zen" || view !== run?.mode) return;
    const timer = window.setInterval(() => {
      setRun((current) => {
        if (!current || current.status !== "playing") return current;
        return tickDecodeClock(current);
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [active, transitioning, dailyPaused, run?.mode, timedExit, view]);

  useEffect(() => {
    const syncView = () => {
      const next = decodeViewFromUrl();
      if (run?.mode === "timed" && run.status === "playing" && next !== "timed") {
        writeDecodeViewUrl("timed", "replace");
        setTimedExit({ next });
        return;
      }
      if (run?.mode === "zen" && run.status === "playing" && next !== "zen") abandonRun(false);
      if (run?.mode === "daily-5" && run.status === "playing" && next !== "daily-5") setDailyPaused(true);
      setView(next);
    };
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  });

  useEffect(() => {
    if (run?.mode !== "timed" || run.status !== "playing") return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (approvedTimedExit.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const abandonOnExit = () => {
      if (!approvedTimedExit.current) abandonRun(false);
    };
    const interceptHubLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.download) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;
      event.preventDefault();
      event.stopPropagation();
      setTimedExit({ href: destination.href });
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    window.addEventListener("pagehide", abandonOnExit);
    document.addEventListener("click", interceptHubLink, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      window.removeEventListener("pagehide", abandonOnExit);
      document.removeEventListener("click", interceptHubLink, true);
    };
  });

  useEffect(() => {
    if (!progressReady || !dailyReady || run?.mode === "daily-5") return;
    const saved = resumeDecodeCheckpoint(progressStorage.getItem("mg-games:v1:decode:resume-daily-5"), "daily-5", todayKey);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      // Discovery must remain metadata-only. Hydrating a Daily into the shared
      // run slot here would overwrite a Timed or Zen run that has just begun.
      setDailyResumeAvailable(saved?.run.status === "playing");
    });
    return () => { cancelled = true; };
  }, [dailyReady, progressReady, progressStorage, restoration.revision, run?.mode, todayKey]);

  useEffect(() => {
    if (!run || run.mode !== "timed" || run.status !== "expired" || recordedExpiry.current) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || recordedExpiry.current) return;
      recordedExpiry.current = true;
      setFeedback(`Time! The answer was ${puzzle?.answer || "hidden"}.`);
      setTone("error");
      setProgress((stored) => {
        const updated = {
          ...stored,
          bestTimedScore: Math.max(stored.bestTimedScore, run.score),
          timedRuns: stored.timedRuns + 1,
        };
        progressStorage.setItem(PROGRESS_KEY, JSON.stringify(updated));
        return updated;
      });
    });
    return () => { cancelled = true; };
  }, [progressStorage, run, puzzle?.answer]);

  useEffect(() => {
    if (run?.mode !== "daily-5" || run.status === "playing" || view !== "daily-5") return;
    dailyResultTimer.current = window.setTimeout(() => {
      dailyResultTimer.current = null;
      setShowDailyResult(true);
    }, 650);
    return () => {
      if (dailyResultTimer.current !== null) window.clearTimeout(dailyResultTimer.current);
      dailyResultTimer.current = null;
    };
  }, [run?.mode, run?.status, view]);

  useEffect(() => () => {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    if (dailyResultTimer.current) window.clearTimeout(dailyResultTimer.current);
  }, [restoration.revision, restoration.ready]);

  const clueFeedback = puzzle ? deriveDecodeFeedback(puzzle.clueWord, puzzle.answer) : [];
  const displayedAnswer = puzzle ? decodeDisplayAnswer(run, puzzle.answer, answer) : answer;
  const clock =
    run?.mode === "timed"
      ? run.secondsRemaining
      : run?.mode === "daily-5"
        ? run.elapsedSeconds
        : mode === "timed"
          ? 20
          : 0;
  const urgent = run?.mode === "timed" && run.status === "playing" && run.secondsRemaining <= 5;

  function saveProgress(next: DecodeProgress) {
    if (!progressReady) return;
    setProgress(next);
    progressStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
  }

  function clearTransition() {
    if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    transitionTimer.current = null;
    setTransitioning(false);
    setPendingPuzzle(null);
    setCorrectPulse(false);
  }

  function focusInput() {
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function selectModePuzzle(length: 4 | 5 | 6 | 7, selectedMode: "timed" | "zen") {
    const authored = localModePuzzles[selectedMode].filter((entry) => entry.answer.length === length);
    const combined = [...decodeModePuzzleBank(length), ...authored];
    return selectDecodePuzzleFromPool(combined)!;
  }

  function handleBegin(nextMode: DecodeMode = mode) {
    locallyStartedRun.current = true;
    clearTransition();
    recordedExpiry.current = false;
    setMode(nextMode);
    setView(nextMode);
    setShowDailyResult(false);
    writeDecodeViewUrl(nextMode, "replace");
    const saved = resumeDecodeCheckpoint(progressStorage.getItem(`mg-games:v1:decode:resume-${nextMode}`), nextMode, todayKey);
    if (saved) {
      setRun(saved.run);
      setPuzzle(saved.puzzle);
      setRunMeta(saved.runMeta);
      setZenLength(saved.zenLength);
      if (nextMode === "daily-5") setDailyPuzzles(saved.dailyPuzzles);
      setAnswer(saved.run.status === "playing" ? "" : saved.puzzle.answer);
      setTone("neutral");
      if (nextMode === "daily-5" && saved.run.status === "playing") {
        setDailyPaused(false);
        setDailyResumeAvailable(false);
        setFeedback("Daily resumed. The clock is running.");
        focusInput();
      } else {
        setDailyPaused(false);
        setFeedback("Your run is complete.");
        focusInput();
      }
      return;
    }
    const nextRun = createDecodeState(nextMode);
    const nextPuzzle = nextMode === "daily-5" ? dailyPuzzles[0] : selectModePuzzle(nextMode === "zen" ? zenLength : 4, nextMode);
    setRunMeta({
      startedAt: new Date().toISOString(),
      puzzleId: nextMode === "daily-5"
        ? dailyPuzzles.map((entry) => entry.id).join("+")
        : `${nextMode}-${nextPuzzle?.id ?? "run"}`,
    });
    setRun(nextRun);
    setDailyPaused(false);
    if (nextMode === "daily-5") setDailyResumeAvailable(false);
    setPuzzle(nextPuzzle);
    setAnswer("");
    setFeedback(
      nextMode === "timed"
        ? "Quick! Type your answer, then press Enter."
        : nextMode === "daily-5"
          ? "Type your answer, then press Enter."
          : "No rush! Type your answer, then press Enter.",
    );
    setTone("neutral");
    focusInput();
  }

  function requestBegin(nextMode: DecodeMode) {
    handleBegin(nextMode);
  }

  function restartCurrentRun() {
    if (!run) return;
    progressStorage.removeItem(`mg-games:v1:decode:resume-${run.mode}`);
    handleBegin(run.mode);
  }

  function beginModeLanding(nextMode: DecodeMode) {
    // A paused Daily remains in memory while the player visits another mode.
    // Only the Daily landing may turn that button into a resume action.
    if (nextMode === "daily-5" && run?.mode === "daily-5" && run.status === "playing") {
      resumeDaily();
      return;
    }
    requestBegin(nextMode);
  }

  function abandonRun(clearState = true) {
    if (!run || !platformRun) return;
    const abandoned: GameRun<"decode"> = {
      ...platformRun,
      completedAt: new Date().toISOString(),
      outcome: "abandoned",
    };
    gameProgress?.sync.stage(abandoned);
    void gameProgress?.sync.flush();
    progressStorage.removeItem(`mg-games:v1:decode:resume-${run.mode}`);
    if (clearState) {
      locallyStartedRun.current = false;
      setRun(null);
      setPuzzle(null);
      setPendingPuzzle(null);
      setAnswer("");
      setTransitioning(false);
    }
  }

  function commitNavigation(next: DecodeView) {
    clearTransition();
    if (dailyResultTimer.current !== null) window.clearTimeout(dailyResultTimer.current);
    dailyResultTimer.current = null;
    setShowDailyResult(false);
    setAnswer("");
    setTone("neutral");
    setView(next);
    writeDecodeViewUrl(next);
  }

  function navigate(next: DecodeView) {
    if (next === view) return;
    if (run?.mode === "timed" && run.status === "playing" && next !== "timed") {
      setTimedExit({ next });
      return;
    }
    if (run?.mode === "zen" && run.status === "playing" && next !== "zen") abandonRun();
    if (run?.mode === "daily-5" && run.status === "playing") {
      if (next !== "daily-5") setDailyPaused(true);
    }
    commitNavigation(next);
  }

  function confirmTimedExit() {
    const destination = timedExit;
    abandonRun();
    setTimedExit(null);
    if (destination?.href) {
      approvedTimedExit.current = true;
      window.location.assign(destination.href);
    }
    else if (destination?.next) commitNavigation(destination.next);
  }

  function resumeDaily() {
    setDailyPaused(false);
    setFeedback("Daily resumed. The clock is ticking...");
    focusInput();
  }

  function handleHome() { navigate("home"); }

  function handleResultHome() {
    // Timed and Zen are session modes: returning from a finished result should
    // reveal their landing screen next time, not reopen the previous result.
    if (run?.mode === "timed" || run?.mode === "zen") {
      locallyStartedRun.current = false;
      setRun(null);
      setPuzzle(null);
      setPendingPuzzle(null);
      setAnswer("");
      setTransitioning(false);
      progressStorage.removeItem(`mg-games:v1:decode:resume-${run.mode}`);
    }
    navigate("home");
  }

  function handleSubmit() {
    if (!run || !puzzle || !interactive) return;
    const result = evaluateDecodeAttempt({ state: run, answer: puzzle.answer, guess: answer });
    if (!result.correct) {
      setFeedback(
        answer.length === puzzle.answer.length
          ? "Not quite! Check the clues and try again"
          : `This level's answer has ${puzzle.answer.length} letters. Try again!`,
      );
      setTone("error");
      setWrongPulse(true);
      window.setTimeout(() => setWrongPulse(false), 360);
      focusInput();
      return;
    }

    setRun(result.state);
    setTone("success");
    setCorrectPulse(true);
    if (result.complete) {
      const elapsed = result.state.mode === "daily-5" ? result.state.elapsedSeconds : 0;
      const nextProgress = {
        ...progress,
        bestDailySeconds:
          progress.bestDailySeconds === null ? elapsed : Math.min(progress.bestDailySeconds, elapsed),
        dailyCompletions: progress.dailyCompletions + 1,
      };
      saveProgress(nextProgress);
      setFeedback("Daily 5 decoded!");
      return;
    }

    const nextLength = result.nextWordLength;
    const nextPuzzle = result.state.mode === "daily-5"
      ? dailyPuzzles[result.state.dailyIndex]
      : selectModePuzzle(result.state.mode === "zen" ? zenLength : (nextLength ?? 4), result.state.mode);
    const levelChanged = result.state.mode === "timed" && nextLength !== puzzle.answer.length;
    setFeedback(
      result.state.mode === "daily-5"
        ? `${result.state.score} of 5 decoded.`
        : result.state.mode === "timed"
          ? levelChanged
            ? `Signal escalated — ${nextLength} letter words unlocked.`
            : "Correct. Clock restored to twenty seconds."
          : "Correct. Take your time with the next clue.",
    );
    setTransitioning(true);
    setPendingPuzzle(nextPuzzle);
    transitionTimer.current = window.setTimeout(() => {
      setPuzzle(nextPuzzle);
      setAnswer("");
      setCorrectPulse(false);
      setTransitioning(false);
      setTone("neutral");
      setFeedback(
        result.state.mode === "daily-5"
          ? `Puzzle ${result.state.dailyIndex + 1} of 5. Read both clues.`
          : result.state.mode === "timed"
            ? `${nextLength}-letter signal active.`
            : "New signal. No clock.",
      );
      focusInput();
      transitionTimer.current = null;
    }, 780);
  }

  return (
    <div className={`decode-game-card${urgent ? " is-urgent" : ""}`} data-theme={theme} data-theme-restored={themeRestored} data-view={view === "home" ? "menu" : view === "how-to" || view === "themes" ? view : puzzle && run?.mode === view && !(run.mode === "daily-5" && dailyPaused) ? "play" : "mode"}>
      <GameLocalBar
        ariaLabel="DECODE"
        brand={<DecodeTileWordmark compact />}
        className="game-local-bar--decode"
        items={[
          { label: "Home", current: view === "home", onSelect: handleHome },
          ...MODES.map((item) => ({
            label: modeLabel(item),
            current: view === item,
            onSelect: () => navigate(item),
          })),
          { label: "Themes", current: view === "themes", onSelect: () => navigate("themes") },
          { label: "How to play", current: view === "how-to", onSelect: () => navigate("how-to") },
        ]}
        onHome={handleHome}
      />

      {view === "how-to" ? (
        <HowToPlay />
      ) : view === "themes" ? (
        <DecodeThemes selected={theme} onSelect={setTheme} />
      ) : puzzle && run && run.mode === view && !(run.mode === "daily-5" && dailyPaused) ? (
        <>
          <main className="decode-play-layout">
            <section className="decode-signal-panel">
              <div className="decode-puzzle-meta">
                <RunRail clock={clock} onRestart={restartCurrentRun} progress={progress} run={run} urgent={urgent} />
                <span className="decode-signal-label">Clue word</span>
              </div>
              <ClueWord feedback={clueFeedback} puzzle={puzzle} />
              <div className={`decode-definition${correctPulse ? " is-correct" : ""}${wrongPulse ? " is-wrong" : ""}`}>
                <span>Definition</span>
                <p>“{puzzle.clue}”</p>
              </div>
              <div className="decode-answer-zone">
                <div><span>Answer</span></div>
                <button
                  aria-label="Focus answer entry"
                  className={`decode-answer-grid${wrongPulse ? " is-wrong" : ""}${correctPulse ? " is-correct" : ""}`}
                  disabled={!interactive}
                  onClick={() => inputRef.current?.focus()}
                  type="button"
                >
                  {Array.from({ length: puzzle.answer.length }, (_, index) => (
                    <span className={interactive && index === answer.length ? "is-active" : undefined} key={index}>{displayedAnswer[index] || ""}</span>
                  ))}
                </button>
                <input
                  aria-describedby="decode-feedback"
                  aria-label="Decoded word"
                  autoComplete="off"
                  className="decode-native-input"
                  disabled={!interactive}
                  id="decode-answer"
                  maxLength={puzzle.answer.length}
                  onChange={(event) => setAnswer(normalizeDecodeInput(event.target.value, puzzle.answer.length))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleSubmit();
                    }
                  }}
                  ref={inputRef}
                  spellCheck={false}
                  value={answer}
                />
              </div>
              <p className={`decode-feedback is-${tone}`} id="decode-feedback" aria-live="polite">{feedback}</p>
            </section>
          </main>
        </>
      ) : view === "home" ? (
        <Welcome onMode={(nextMode) => navigate(nextMode)} />
      ) : (
        <ModeLanding key={view} mode={view} onBegin={() => beginModeLanding(view)} onZenLength={setZenLength} progress={progress} resumable={view === "daily-5" && (dailyResumeAvailable || (run?.mode === "daily-5" && run.status === "playing"))} zenLength={zenLength} />
      )}

      {!timedExit && run && puzzle && run.mode === view && run.status !== "playing" && (run.mode !== "daily-5" || showDailyResult) && (
        <div className="decode-result-modal" role="dialog" aria-modal="true" aria-labelledby="decode-result-title">
          <ResultPanel dailyPuzzles={dailyPuzzles} mode={run.mode} onAgain={() => handleBegin()} onDismiss={() => setShowDailyResult(false)} onHome={handleResultHome} progress={progress} puzzle={puzzle} run={run} />
        </div>
      )}

      {timedExit && <RunDecisionDialog
        confirmLabel="abandon run"
        description="Your Timed score and current signal will be lost."
        onCancel={() => setTimedExit(null)}
        onConfirm={confirmTimedExit}
        title="Abandon this Timed run?"
      />}
    </div>
  );
}

function RunRail({ clock, onRestart, progress, run, urgent }: {
  clock: number;
  onRestart: () => void;
  progress: DecodeProgress;
  run: DecodeState;
  urgent: boolean;
}) {
  const timed = run.mode === "timed";
  const zen = run.mode === "zen";
  if (zen) {
    return (
      <section className="decode-run-rail" data-mode="zen" aria-label="Zen run status">
        <div><span>Mode</span><strong>Zen</strong></div>
        <div><span>Solved</span><strong>{run.score}</strong></div>
        <div><span>Clock</span><strong>Off</strong></div>
        <button onClick={onRestart} type="button">restart</button>
      </section>
    );
  }
  const meter = timed ? Math.max(0, Math.min(100, (clock / 20) * 100)) : Math.min(100, (run.score / 5) * 100);
  return (
    <section className="decode-run-rail" data-mode={run.mode} aria-label="Run status">
      <div className={`decode-clock${urgent ? " is-urgent" : ""}`}>
        <span>{timed ? "Time" : "Elapsed"}</span>
        <strong>{formatDecodeTime(clock)}</strong>
        {timed && <i><span style={{ width: `${meter}%` }} /></i>}
      </div>
      <div className="decode-run-progress">
        <span>{timed ? "Score" : "Puzzle"}</span>
        <strong>{timed ? run.score : `${Math.min(run.dailyIndex + 1, 5)}/5`}</strong>
        {!timed && (
          <i className="decode-mini-daily-track" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <b className={index < run.dailyIndex ? "is-complete" : index === run.dailyIndex ? "is-current" : ""} key={index} />
            ))}
          </i>
        )}
      </div>
      <div><span>Best</span><strong>{timed ? progress.bestTimedScore : progress.bestDailySeconds === null ? "—" : formatDecodeTime(progress.bestDailySeconds)}</strong></div>
      {timed && <button onClick={onRestart} type="button">restart run</button>}
    </section>
  );
}

function ClueWord({ feedback, puzzle }: { feedback: DecodeFeedback[]; puzzle: DecodePuzzle }) {
  return (
    <div className="decode-clue-word" aria-label="Colored letter clue">
      {puzzle.clueWord.split("").map((letter, index) => {
        const state = feedback[index];
        const marker = state === "correct" ? "●" : state === "present" ? "↔" : "×";
        return (
          <span aria-label={`${letter}, ${feedbackLabel(state)}`} className={`is-${state}`} key={`${letter}-${index}`}>
            <b>{letter}</b><small aria-hidden="true">{marker}</small>
          </span>
        );
      })}
    </div>
  );
}

function ResultPanel({ dailyPuzzles, mode, progress, puzzle, run, onAgain, onDismiss, onHome }: {
  dailyPuzzles: DecodePuzzle[];
  mode: DecodeMode;
  progress: DecodeProgress;
  puzzle: DecodePuzzle;
  run: DecodeState;
  onAgain: () => void;
  onDismiss: () => void;
  onHome: () => void;
}) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useModalFocus(dialogRef, actionRef, mode === "daily-5" ? onDismiss : onHome);

  if (mode === "timed" && run.mode === "timed") {
    const length = decodeTimedWordLength(run.score);
    return (
      <section className="decode-result is-expired" ref={dialogRef}>
        <span>Transmission ended</span><strong>{run.score}</strong><h2 id="decode-result-title">signals decoded</h2>
        <div><p><small>Tier reached</small><b>{length} letters</b></p><p><small>Personal best</small><b>{progress.bestTimedScore}</b></p></div>
        <p className="decode-final-answer">Final answer <b>{puzzle.answer}</b></p>
        <div className="decode-result-actions">
          <button onClick={onAgain} ref={actionRef} type="button">start a new run</button>
          <button onClick={onHome} type="button">back to menu</button>
        </div>
      </section>
    );
  }
  return (
    <section className="decode-result" ref={dialogRef}>
      <span>Sequence decoded</span><strong>{run.mode === "daily-5" ? formatDecodeTime(run.elapsedSeconds) : "0:00"}</strong><h2 id="decode-result-title">{dailyPuzzles.every((entry) => entry.theme && entry.theme === dailyPuzzles[0]?.theme) ? dailyPuzzles[0]?.theme : "Daily 5"}</h2>
      <div className="decode-result-answers">{dailyPuzzles.map((entry) => <b key={entry.id}>{entry.answer}</b>)}</div>
      <p className="decode-final-answer">Best time <b>{progress.bestDailySeconds === null ? "--" : formatDecodeTime(progress.bestDailySeconds)}</b></p>
      <div className="decode-result-actions">
        <button onClick={onDismiss} ref={actionRef} type="button">view completed puzzle</button>
        <button onClick={onHome} type="button">back to menu</button>
      </div>
    </section>
  );
}

function ModeLanding({ mode, onBegin, onZenLength, progress, resumable = false, zenLength }: {
  mode: DecodeMode;
  onBegin: () => void;
  onZenLength: (length: 4 | 5 | 6 | 7) => void;
  progress: DecodeProgress;
  resumable?: boolean;
  zenLength: 4 | 5 | 6 | 7;
}) {
  const copy = MODE_DETAILS[mode];
  return (
    <main className="decode-mode-landing">
      <section>
        <span>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <ul className="decode-mode-rules">{copy.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        {mode === "zen" && (
          <div className="decode-mode-length" aria-label="Zen word length" role="group">
            <span>Word length</span>
            {([4, 5, 6, 7] as const).map((length) => <button aria-pressed={zenLength === length} key={length} onClick={() => onZenLength(length)} type="button">{length}</button>)}
          </div>
        )}
        {mode === "timed" && (
          <div className="decode-mode-best">
            <small>Personal best:</small>
            <b>{progress.bestTimedScore ? `${progress.bestTimedScore} signals` : "No run yet"}</b>
          </div>
        )}
        <button className="decode-mode-start" onClick={onBegin} type="button">{resumable ? "resume today’s sequence" : copy.action}</button>
      </section>
    </main>
  );
}

function Welcome({ onMode }: {
  onMode: (mode: DecodeMode) => void;
}) {
  return (
    <main className="decode-welcome">
      <section className="decode-welcome-copy">
        <DecodeTileWordmark />
        <h1>Two clues. <em>One answer.</em></h1>
      </section>
      <section className="decode-mode-cards" aria-label="Choose a game mode">
        <button onClick={() => onMode("daily-5")} type="button">
          <div className="decode-mode-copy"><strong>Daily 5</strong><p>Five puzzles against the clock.</p></div>
          <i aria-hidden="true">↗</i>
        </button>
        <button onClick={() => onMode("timed")} type="button">
          <div className="decode-mode-copy"><strong>Timed</strong><p>Twenty seconds per answer.</p></div>
          <i aria-hidden="true">↗</i>
        </button>
        <button onClick={() => onMode("zen")} type="button">
          <div className="decode-mode-copy"><strong>Zen</strong><p>No clock. A quiet stream of signals.</p></div>
          <i aria-hidden="true">↗</i>
        </button>
      </section>
    </main>
  );
}

function DecodeThemes({ selected, onSelect }: {
  selected: DecodeTheme;
  onSelect: (theme: DecodeTheme) => void;
}) {
  return (
    <main className="decode-themes-page" aria-labelledby="decode-themes-title">
      <section>
        <header>
          <span>Interface profiles</span>
          <h1 id="decode-themes-title">Themes</h1>
          <p>Change the room, not the protocol. Tile symbols and their meaning remain consistent in every palette.</p>
        </header>
        <div className="decode-theme-grid" role="radiogroup" aria-label="Choose a DECODE theme">
          {DECODE_THEMES.map((choice) => (
            <button
              aria-checked={selected === choice.id}
              className={selected === choice.id ? "is-current" : undefined}
              data-mode={choice.mode}
              key={choice.id}
              onClick={() => onSelect(choice.id)}
              role="radio"
              style={{
                "--decode-preview-bg": choice.background,
                "--decode-preview-surface": choice.surface,
                "--decode-preview-accent": choice.accent,
                "--decode-preview-correct": choice.correct,
                "--decode-preview-present": choice.present,
                "--decode-preview-absent": choice.absent,
              } as CSSProperties}
              type="button"
            >
              <span className="decode-theme-preview" aria-hidden="true">
                <i className="is-correct"><b>D</b><small>●</small></i>
                <i className="is-present"><b>E</b><small>↔</small></i>
                <i className="is-absent"><b>C</b><small>×</small></i>
              </span>
              <span className="decode-theme-copy">
                <b>{choice.name}</b>
                <small>{choice.description}</small>
              </span>
              <em>{selected === choice.id ? "current" : "apply"}</em>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function HowToPlay() {
  const example = deriveDecodeFeedback("PLACE", "CLAMP");
  return (
    <main className="decode-how-page" aria-labelledby="decode-how-title">
      <section>
        <header><div><span>Decoding protocol</span><h1 id="decode-how-title">How to play</h1></div></header>
        <p className="decode-how-intro">Find the answer that matches both clues. The colored clue word shows which letters carry over; the definition tells you what the answer means. Your answer is always the same length as the clue word.</p>
        <div className="decode-how-example-section">
          <span className="decode-how-example-label">Example</span>
          <div className="decode-how-example">
            <div className="decode-how-example-flow">
              <div className="decode-how-clues">
                <div className="decode-clue-word">{"PLACE".split("").map((letter, index) => {
                  const state = example[index];
                  return <i className={`is-${state}`} key={index}><b>{letter}</b><small>{state === "correct" ? "●" : state === "present" ? "↔" : "×"}</small></i>;
                })}</div>
                <p>“fastening tool”</p>
              </div>
              <i className="decode-how-arrow" aria-hidden="true">→</i>
              <div className="decode-how-answer" aria-label="Correct answer, CLAMP">
                {"CLAMP".split("").map((letter) => <span key={letter}><b>{letter}</b><small aria-hidden="true">●</small></span>)}
              </div>
            </div>
          </div>
          <div className="decode-how-rules">
            <article><i className="is-correct">●</i><div><b>Same position</b><p>Green letters stay in this exact spot.</p></div></article>
            <article><i className="is-present">↔</i><div><b>Different position</b><p>Blue letters appear elsewhere in the answer.</p></div></article>
            <article><i className="is-absent">×</i><div><b>Not used</b><p>Gray letters have no remaining match in the answer.</p></div></article>
          </div>
          <p className="decode-how-entry-note">Use both signals, then type your answer and press <kbd>Enter</kbd> to submit.</p>
        </div>
      </section>
    </main>
  );
}

function RunDecisionDialog({ confirmLabel, description, onCancel, onConfirm, title }: {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useModalFocus(dialogRef, confirmRef, onCancel);
  return (
    <div className="decode-run-decision" role="dialog" aria-modal="true" aria-labelledby="decode-run-decision-title">
      <section ref={dialogRef}>
        <span>Run in progress</span>
        <h2 id="decode-run-decision-title">{title}</h2>
        <p>{description}</p>
        <div>
          <button onClick={onCancel} type="button">stay here</button>
          <button onClick={onConfirm} ref={confirmRef} type="button">{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
