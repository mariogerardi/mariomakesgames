"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./syllabl.css";
import { useGameTheme } from "../../platform/game-theme-provider";
import {
  createSyllablSession,
  evaluateSyllablAttempt,
  getSyllablConstraint,
  hydrateSyllablSession,
  serializeSyllablSession,
  syllablDailyStorageKey,
  validateSyllablPlacement,
  type SyllablSession,
  type SyllablPuzzle,
} from "./engine.mjs";
import { syllablPuzzles } from "./catalog";
import { selectDailySyllablPuzzle, SYLLABL_DAILY_START_DATE } from "./puzzle-loader.mjs";
import {
  createSyllablWordValidator,
  type SyllablWordInfo,
} from "./word-validator.mjs";
import { GameLocalBar } from "../../app-shell/game-local-bar";
import { dailyRunId, useGameRunPersistence } from "../../platform/game-run-persistence";
import { useGameRestoration, useProgressStorage } from "../../platform/game-progress-provider";
import type { DeviceStore } from "../../platform/storage";
import type { GameRun } from "../../platform/runs.mjs";
import { loadLocalStudioSlot } from "../../authoring/local-runtime";

const WORD_INFO_ENDPOINT =
  "https://fr9m4nzsu1.execute-api.us-east-1.amazonaws.com/wordinfo";
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
type SyllablView = "menu" | "daily" | "archive" | "how-to" | "themes";

const syllablViews: SyllablView[] = ["menu", "daily", "archive", "how-to", "themes"];

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

function SyllablDailyRestoring({ message }: { message: string }) {
  return (
    <div className="syllabl-play syllabl-route-restoring" aria-busy="true" aria-label="Preparing daily puzzle">
      <main className="syllabl-play-stage" aria-hidden="true" />
      <span className="syllabl-route-status" role="status">{message}</span>
    </div>
  );
}

const placementCopy = {
  1: { prompt: "ends with", feedback: "end with", short: "ends with" },
  2: { prompt: "begins with", feedback: "begin with", short: "begins with" },
  3: { prompt: "fully contains", feedback: "fully contain", short: "fully contains" },
  4: { prompt: "begins and ends with", feedback: "begin and end with", short: "begins & ends" },
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

function createDailySetup(date = new Date()): DailySetup {
  const dateKey = localDateKey(date);
  const selection = selectDailySyllablPuzzle(syllablPuzzles, dateKey);
  return {
    dateKey,
    dayNumber: selection.dayOffset + 1,
    displayDate: new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
  };
}

function syllablDateFromKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime()) || localDateKey(date) !== dateKey ? null : date;
}

function syllablArchiveSetups(today = new Date()) {
  const todaySetup = createDailySetup(today);
  const count = Math.max(0, todaySetup.dayNumber);
  return Array.from({ length: count }, (_, index) => (
    createDailySetup(new Date(today.getFullYear(), today.getMonth(), today.getDate() - index, 12))
  ));
}

function syllablCompactDate(dateKey: string) {
  const date = syllablDateFromKey(dateKey);
  return date
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)
    : dateKey;
}

function syllablUrlForView(nextView: SyllablView, dateKey?: string) {
  const url = new URL(window.location.href);
  if (nextView === "menu") url.searchParams.delete("view");
  else url.searchParams.set("view", nextView);
  if (nextView === "daily" && dateKey) url.searchParams.set("date", dateKey);
  else url.searchParams.delete("date");
  return url;
}

function readStoredSession(dateKey: string, storage: DeviceStore) {
  const current = storage.getItem(syllablDailyStorageKey(dateKey));
  const legacy = storage.getItem(`syllabl_daily_${dateKey}`);
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

export function SyllablGame({ initialRoute }: { initialRoute?: { view?: string; date?: string } }) {
  const progressStorage = useProgressStorage();
  const restoration = useGameRestoration();
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
  const [todaySetup, setTodaySetup] = useState<DailySetup | null>(null);
  const [archivePuzzles, setArchivePuzzles] = useState<Record<string, SyllablPuzzle>>({});
  const [savedSession, setSession] = useState<SyllablSession | null>(null);
  const [hydratedRevision, setHydratedRevision] = useState<typeof restoration.revision | undefined>(undefined);
  const [dailyPuzzle, setDailyPuzzle] = useState<SyllablPuzzle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showLoading, setShowLoading] = useState(false);
  const validationGeneration = useRef(0);
  const session = restoration.ready
    && hydratedRevision === restoration.revision
    && savedSession?.puzzleDate === setup?.dateKey
    ? savedSession
    : null;
  const sessionReady = Boolean(session);
  const [guess, setGuess] = useState("");
  const [feedback, setFeedback] = useState(INITIAL_FEEDBACK);
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [isChecking, setIsChecking] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [view, setView] = useState<SyllablView>(() => syllablViews.includes(initialRoute?.view as SyllablView)
    ? initialRoute!.view as SyllablView
    : "menu");
  const [isViewLeaving, setIsViewLeaving] = useState(false);
  const [theme, setTheme, themeRestored] = useGameTheme<SyllablTheme>("syllabl", "light");
  const [animatedTheme, setAnimatedTheme] = useState<SyllablTheme | null>(null);
  const viewTransitionRef = useRef<number | null>(null);
  const themeAnimationRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    // Calendar presentation is deterministic and does not need to wait for
    // account progress or the local Studio schedule.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const today = new Date();
      const current = createDailySetup(today);
      const archive = syllablArchiveSetups(today);
      const requested = initialRoute?.view === "daily"
        ? archive.find((entry) => entry.dateKey === initialRoute.date)
        : null;
      setTodaySetup(current);
      setSetup(requested ?? current);
    });
    return () => { cancelled = true; };
  }, [initialRoute?.date, initialRoute?.view]);

  useEffect(() => {
    if (!todaySetup) return;
    let cancelled = false;
    const today = syllablDateFromKey(todaySetup.dateKey) ?? new Date();
    const archive = syllablArchiveSetups(today);
    queueMicrotask(async () => {
      const catalog = Object.fromEntries(archive.map((entry) => [
        entry.dateKey,
        selectDailySyllablPuzzle(syllablPuzzles, entry.dateKey).puzzle,
      ])) as Record<string, SyllablPuzzle>;
      try {
        const slots = await Promise.all(archive.map(async (entry) => {
          const [scheduled] = await loadLocalStudioSlot("syllabl", "daily", entry.dateKey);
          return scheduled?.gameId === "syllabl"
            ? [entry.dateKey, scheduled.payload] as const
            : null;
        }));
        slots.forEach((slot) => { if (slot) catalog[slot[0]] = slot[1]; });
      } catch { /* The checked-in dated catalog remains available. */ }
      if (!cancelled) setArchivePuzzles(catalog);
    });
    return () => { cancelled = true; };
  }, [todaySetup]);

  useEffect(() => {
    if (!setup) return;
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      try {
        const selection = selectDailySyllablPuzzle(syllablPuzzles, setup.dateKey);
        const [scheduled] = await loadLocalStudioSlot("syllabl", "daily", setup.dateKey);
        if (cancelled) return;
        setDailyPuzzle(scheduled?.gameId === "syllabl" ? scheduled.payload : selection.puzzle);
      } catch {
        if (!cancelled) setLoadError("today’s puzzle couldn’t load. please refresh to try again.");
      }
    });
    return () => { cancelled = true; };
  }, [setup]);

  useEffect(() => {
    let cancelled = false;
    if (restoration.ready && dailyPuzzle && setup) queueMicrotask(() => {
      if (cancelled) return;
      try {
        const dateKey = setup.dateKey;
        let stored = null;
        try { stored = readStoredSession(dateKey, progressStorage); } catch { /* Device storage can be unavailable. */ }
        const nextSession = stored
          ? hydrateSyllablSession({ stored, puzzle: dailyPuzzle, puzzleDate: dateKey })
          : createSyllablSession({ puzzle: dailyPuzzle, puzzleDate: dateKey });

        setSession(nextSession);
        setHydratedRevision(restoration.revision);
        setGuess("");
        setIsChecking(false);
        setFeedback(INITIAL_FEEDBACK);
        setFeedbackTone("neutral");
        setLoadError("");
      } catch {
        setLoadError("today’s puzzle couldn’t be restored. please refresh to try again.");
      }
    });
    return () => {
      cancelled = true;
      validationGeneration.current += 1;
    };
  }, [restoration.ready, restoration.revision, dailyPuzzle, setup, progressStorage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoading(true), 700);
    return () => window.clearTimeout(timer);
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
      const nextView = viewFromUrl();
      const requestedDate = new URL(window.location.href).searchParams.get("date");
      const archiveDate = requestedDate ? syllablDateFromKey(requestedDate) : null;
      const availableDate = archiveDate && archivePuzzles[requestedDate!] ? requestedDate : null;
      if (nextView === "daily" && availableDate) {
        setSetup(createDailySetup(archiveDate!));
        setDailyPuzzle(archivePuzzles[availableDate]);
      } else if ((nextView === "daily" || nextView === "menu") && todaySetup) {
        setSetup(todaySetup);
        if (archivePuzzles[todaySetup.dateKey]) setDailyPuzzle(archivePuzzles[todaySetup.dateKey]);
      }
      setView(nextView);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    syncView();
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, [archivePuzzles, todaySetup]);

  useEffect(() => {
    if (view === "daily" && sessionReady) {
      const frame = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      return () => cancelAnimationFrame(frame);
    }
  }, [view, sessionReady]);

  const constraint = session ? getSyllablConstraint(session) : null;
  const isComplete = session?.status === "complete";
  const platformRun = useMemo<GameRun<"syllabl"> | null>(() => setup && session ? ({
    schemaVersion: 1,
    runId: dailyRunId("syllabl", "daily", setup.dateKey),
    playerId: null,
    gameId: "syllabl",
    mode: "daily",
    puzzle: { id: `${setup.dateKey}-${session.puzzle.puzzleLetters}`, revision: 1, date: setup.dateKey },
    startedAt: new Date(`${setup.dateKey}T00:00:00`).toISOString(),
    completedAt: isComplete ? new Date().toISOString() : null,
    outcome: isComplete ? "completed" : "in-progress",
    score: session.currentStage,
    checkpoint: { version: 1, state: { native: serializeSyllablSession(session) } },
    result: { stagesCompleted: session.currentStage, totalStages: 6, guesses: session.guesses },
  }) : null, [isComplete, session, setup]);
  useGameRunPersistence(platformRun, Boolean(session?.guesses.length));

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
  }

  function openView(nextView: SyllablView) {
    const returningToToday = nextView === "daily"
      && setup?.dateKey !== todaySetup?.dateKey;
    if ((nextView === view && !returningToToday) || isViewLeaving) return;

    setShareStatus("");
    window.history.pushState({}, "", syllablUrlForView(nextView, nextView === "daily" ? todaySetup?.dateKey : undefined));
    setIsViewLeaving(true);
    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 280;
    viewTransitionRef.current = window.setTimeout(() => {
      if ((nextView === "menu" || nextView === "daily") && todaySetup) {
        setSetup(todaySetup);
        if (archivePuzzles[todaySetup.dateKey]) setDailyPuzzle(archivePuzzles[todaySetup.dateKey]);
      }
      setView(nextView);
      setIsViewLeaving(false);
      viewTransitionRef.current = null;
      window.scrollTo({ top: 0, behavior: "instant" });
    }, transitionDuration);
  }

  function openArchiveRound(dateKey: string) {
    const puzzle = archivePuzzles[dateKey];
    const date = syllablDateFromKey(dateKey);
    if (!puzzle || !date || isViewLeaving) return;
    setShareStatus("");
    setSetup(createDailySetup(date));
    setDailyPuzzle(puzzle);
    window.history.pushState({}, "", syllablUrlForView("daily", dateKey));
    setIsViewLeaving(true);
    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280;
    viewTransitionRef.current = window.setTimeout(() => {
      setView("daily");
      setIsViewLeaving(false);
      viewTransitionRef.current = null;
      window.scrollTo({ top: 0, behavior: "instant" });
    }, transitionDuration);
  }

  function refocusInput() {
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
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
      refocusInput();
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
        `your word must ${placementCopy[constraint.placementCode as keyof typeof placementCopy].feedback} ${session.puzzle.puzzleLetters.toLowerCase()}.`,
      );
      setFeedbackTone("error");
      refocusInput();
      return;
    }

    setIsChecking(true);
    const generation = validationGeneration.current;
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

    if (generation !== validationGeneration.current) return;
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
      refocusInput();
      return;
    }

    setSession(result.session);
    try {
      progressStorage.setItem(
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
        ? `six for six. ${isToday ? "today’s syllabl" : "this archive puzzle"} is complete.`
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

  const dailyReady = Boolean(session && setup && (isComplete || constraint));
  const dailyError = loadError || (session && !isComplete && !constraint ? "today’s puzzle could not be prepared. please refresh and try again." : "");
  const loadingMessage = dailyError || (restoration.conflict ? "choose which save to continue." : showLoading ? "getting your daily ready…" : "");
  const token = session?.puzzle.puzzleLetters.toLowerCase() ?? "";
  const activeConstraint = constraint!;
  const completedStages = session?.currentStage ?? 0;
  const dailyAction = isComplete
    ? "review today’s result"
    : completedStages > 0
      ? `continue at level ${completedStages + 1}`
      : "start today’s puzzle";
  const dailyMenuAction = dailyError || restoration.conflict
    ? loadingMessage
    : dailyReady
      ? dailyAction
      : "open today’s puzzle";
  const isToday = Boolean(setup && todaySetup && setup.dateKey === todaySetup.dateKey);
  const archiveSetups = todaySetup
    ? syllablArchiveSetups(syllablDateFromKey(todaySetup.dateKey) ?? new Date())
    : [];
  const archiveRounds = archiveSetups.map((archiveSetup) => {
    const puzzle = archivePuzzles[archiveSetup.dateKey]
      ?? selectDailySyllablPuzzle(syllablPuzzles, archiveSetup.dateKey).puzzle;
    let stored = null;
    try { stored = readStoredSession(archiveSetup.dateKey, progressStorage); } catch { /* Display the round as unplayed. */ }
    const archiveSession = stored
      ? hydrateSyllablSession({ stored, puzzle, puzzleDate: archiveSetup.dateKey })
      : createSyllablSession({ puzzle, puzzleDate: archiveSetup.dateKey });
    return { setup: archiveSetup, puzzle, session: archiveSession };
  });

  return (
    <section
      className="syllabl-game-card"
      data-syllabl-theme={theme}
      data-theme-restored={themeRestored}
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
          { label: "home", current: view === "menu", onSelect: () => openView("menu") },
          { label: "daily", current: view === "daily" && (!setup || isToday), onSelect: () => openView("daily") },
          { label: "archive", current: view === "archive" || (view === "daily" && Boolean(setup) && !isToday), onSelect: () => openView("archive") },
          { label: "how to play", current: view === "how-to", onSelect: () => openView("how-to") },
          { label: "themes", current: view === "themes", onSelect: () => openView("themes") },
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
                <span className="syllabl-menu-eyebrow">{setup ? `daily #${setup.dayNumber}` : "daily puzzle"}</span>
                <strong>dai<i>·</i>ly puzzle</strong>
                <small>{setup ? `${setup.displayDate} · six levels` : "today · six levels"}</small>
                <span className={`syllabl-menu-progress${dailyReady ? " is-restored" : ""}`} aria-label={dailyReady ? `${completedStages} of 6 levels complete` : "Loading today’s progress"} aria-busy={!dailyReady}>
                  {Array.from({ length: 6 }, (_, index) => (
                    <i className={!dailyReady ? "" : index < completedStages ? "is-done" : index === completedStages && !isComplete ? "is-current" : ""} key={index} />
                  ))}
                </span>
                <span className="syllabl-menu-action" role="status"><span className="syllabl-menu-action-copy" key={dailyMenuAction}>{dailyMenuAction}</span><b aria-hidden="true">→</b></span>
              </button>
              <div className="syllabl-menu-secondary">
                <button className="syllabl-menu-archive" onClick={() => openView("archive")} type="button">
                  <span>ar<i>·</i>chive</span><small>every daily since Sep. 1</small><b aria-hidden="true">→</b>
                </button>
                <button className="syllabl-menu-themes" onClick={() => openView("themes")} type="button">
                  <span>themes</span><small>eight ways to play</small><b aria-hidden="true">→</b>
                </button>
                <button className="syllabl-menu-how" onClick={() => openView("how-to")} type="button">
                  <span>how to play</span><small>learn the three rules</small><b aria-hidden="true">→</b>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : view === "daily" ? (!dailyReady || !session || !setup ? (
        dailyError || restoration.conflict ? (
          <div className="syllabl-daily-pending" aria-busy="false">
            <h2>daily puzzle</h2>
            <p role={dailyError ? "alert" : "status"}>{loadingMessage}</p>
            <button type="button" className="syllabl-primary-action" onClick={() => openView("menu")}>back to menu</button>
          </div>
        ) : <SyllablDailyRestoring message={loadingMessage} />
      ) : (
        <div className="syllabl-play syllabl-route-ready">
          <div
            className="syllabl-step-progress"
            role="progressbar"
            aria-label="puzzle progress"
            aria-valuemin={0}
            aria-valuemax={6}
            aria-valuenow={session.currentStage}
          >
            <div className="syllabl-step-progress-track" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => {
                const enteredGuess = session.guesses[index];
                const enteredWord = enteredGuess
                  ? enteredGuess.syllableList.length > 0
                    ? enteredGuess.syllableList.join("·")
                    : enteredGuess.word
                  : "";
                const enteredParts = enteredGuess
                  ? enteredGuess.syllableList.length > 0
                    ? enteredGuess.syllableList.flatMap((syllable, partIndex) => partIndex === 0 ? [syllable] : ["·", syllable])
                    : [enteredGuess.word]
                  : [];

                return (
                  <span className="syllabl-step-progress-segment" key={index}>
                    <i className={index < completedStages ? "is-done" : index === completedStages && !isComplete ? "is-current" : ""} />
                    <small className={enteredWord ? "has-word" : undefined} key={enteredWord || "empty"} title={enteredWord || undefined}>
                      {enteredParts.length > 0
                        ? enteredParts.map((part, partIndex) => (
                            <span
                              aria-hidden="true"
                              key={`${part}-${partIndex}`}
                              style={{ animationDelay: `${partIndex * 42}ms` }}
                            >
                              {part}
                            </span>
                          ))
                        : "\u00a0"}
                    </small>
                  </span>
                );
              })}
            </div>
          </div>

          <main className="syllabl-play-stage">
            <section className="syllabl-play-primary" aria-label="current challenge">
              <div className="syllabl-play-card">
                {!isComplete ? (
                  <header className="syllabl-round-meta">
                    <span>{isToday ? "daily" : "archive"} #{isToday ? setup.dayNumber : Math.abs(setup.dayNumber)}</span>
                    <time dateTime={setup.dateKey}>{setup.displayDate}</time>
                  </header>
                ) : null}
                <div className="syllabl-token-row" aria-label={`puzzle letters ${token}`}>
                  <span className="syllabl-token-label">{isToday ? "today’s letters" : "archive letters"}</span>
                  <strong><span>{token}</span></strong>
                </div>

                {isComplete ? (
                  <div className="syllabl-complete">
                    <p className="syllabl-complete-kicker">{isToday ? "today’s words" : "archive words"}</p>
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
                    {!isToday ? <button className="syllabl-archive-back" onClick={() => openView("archive")} type="button">back to archive</button> : null}
                  </div>
                ) : (
                  <>
                    <div className="syllabl-current-rule" key={session.currentStage}>
                      <p>
                        find a word that <strong>{placementCopy[activeConstraint.placementCode as keyof typeof placementCopy].prompt} {token}</strong>
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
      )) : view === "archive" ? (
        <div className="syllabl-archive-view">
          <main className="syllabl-archive-shell">
            <header>
              <p>syllabl archive</p>
              <h2>past puzzles</h2>
              <span>Every daily puzzle since {syllablCompactDate(SYLLABL_DAILY_START_DATE)}. Continue an old run or start a new one.</span>
            </header>
            <div className="syllabl-archive-grid">
              {archiveRounds.map((round) => {
                const completed = round.session.status === "complete";
                const progress = round.session.currentStage;
                return (
                  <button
                    className={completed ? "is-complete" : progress > 0 ? "is-progress" : "is-unplayed"}
                    key={round.setup.dateKey}
                    onClick={() => openArchiveRound(round.setup.dateKey)}
                    type="button"
                  >
                    <span className="syllabl-archive-meta">
                      <small>{round.setup.dateKey === todaySetup?.dateKey ? "today" : syllablCompactDate(round.setup.dateKey)}</small>
                      <b>{completed ? "complete" : progress > 0 ? `level ${progress + 1} of 6` : "unplayed"}</b>
                    </span>
                    <strong aria-label={`Puzzle string ${round.puzzle.puzzleLetters}`}>{round.puzzle.puzzleLetters}</strong>
                    <span className="syllabl-archive-progress" aria-label={`${progress} of 6 levels complete`}>
                      {Array.from({ length: 6 }, (_, index) => <i className={index < progress ? "is-done" : ""} key={index} />)}
                    </span>
                    <span className="syllabl-archive-action">{completed ? "review words" : progress > 0 ? "continue puzzle" : "play puzzle"}<b aria-hidden="true">→</b></span>
                  </button>
                );
              })}
            </div>
          </main>
        </div>
      ) : (
        <div className="syllabl-info-view">
          <article className="syllabl-info-card">
            {view === "how-to" ? (
              <>
                <header className="syllabl-how-heading">
                  <h2>how to play</h2>
                </header>
                <div className="syllabl-how-board">
                  <section className="syllabl-how-check is-letters">
                    <header><b>1</b><div><h3>find the letters</h3><p>Every answer includes the day’s three-letter string.</p></div></header>
                    <div className="syllabl-how-string-example">
                      <span><small>today’s string</small><strong>PRO</strong></span>
                      <div aria-label="PRO in procrastinator"><b>pro</b><span>crastinator</span></div>
                    </div>
                  </section>

                  <section className="syllabl-how-check is-placement">
                    <header><b>2</b><div><h3>place them correctly</h3><p>The prompt asks for one of four positions.</p></div></header>
                    <div className="syllabl-position-grid">
                      <div aria-label="begins with PRO"><span>begins with</span><i><b>PRO</b><em /></i></div>
                      <div aria-label="ends with PRO"><span>ends with</span><i><em /><b>PRO</b></i></div>
                      <div aria-label="fully contains PRO"><span>fully contains</span><i><em /><b>PRO</b><em /></i></div>
                      <div aria-label="begins and ends with PRO"><span>begins &amp; ends</span><i><b>PRO</b><em /><b>PRO</b></i></div>
                    </div>
                    <aside className="syllabl-position-note"><b>Tip</b><span>Fully contains means the string is inside the word, not at either end.</span></aside>
                  </section>

                  <section className="syllabl-how-check is-sound">
                    <header><b>3</b><div><h3>match the sound</h3><p>Your answer needs exactly the number of syllables shown.</p></div></header>
                    <div className="syllabl-how-sound-example">
                      <small>5 syllables</small>
                      <strong aria-label="pro cras ti na tor">
                        {['pro', '·', 'cras', '·', 'ti', '·', 'na', '·', 'tor'].map((part, index) => <span className={index === 0 ? "is-string" : undefined} key={`${part}-${index}`}>{part}</span>)}
                      </strong>
                      <span>✓ valid</span>
                    </div>
                  </section>
                </div>
                <footer className="syllabl-how-footer">
                  <p>Pass all three checks and move on to the next level. Complete all six levels to win!</p>
                  <button className="syllabl-primary-action" onClick={() => openView("daily")} type="button">play today’s puzzle <span aria-hidden="true">→</span></button>
                </footer>
              </>
            ) : (
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
            )}
          </article>
        </div>
      )}
      </div>
    </section>
  );
}
