"use client";

import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { gameStorageKey } from "../../platform/storage";
import {
  chapterForGridlLevel,
  gridlChapters,
  gridlLevelIds,
} from "./catalog";
import { gridlDailyLevelId } from "./daily.mjs";
import type {
  GridlLevel,
  GridlResult,
  GridlState,
} from "./engine/engine.mjs";
import { normalizeLevel } from "./engine/level-loader.mjs";
import {
  cancelStagedRecall,
  commitPlayTurn,
  moveStagedPlacement,
  returnStagedToPool,
  rollbackTurn,
  tryStagePlacement,
  tryStageRecall,
} from "./engine/rules.mjs";
import {
  extractRuns,
  getPortalOverlayText,
  initState,
  startLevel,
  toA1,
} from "./engine/state.mjs";

const PROGRESS_KEY = gameStorageKey("gridl", "campaign");
const LAST_LEVEL_KEY = gameStorageKey("gridl", "last-level");
const GRIDL_DRAG_TYPE = "application/x-gridl-tile";

const gridlThemes = [
  {
    id: "light",
    name: "Light",
    description: "Airy blues, crisp white tiles, and the classic Gridl look.",
  },
  {
    id: "dark",
    name: "Dark",
    description: "Midnight boards with luminous blue fragments.",
  },
  {
    id: "contrast",
    name: "Contrast",
    description: "A high-contrast cyan treatment built for maximum clarity.",
  },
  {
    id: "frutiger-aero",
    name: "Frutiger Aero",
    description: "Glossy glass, bright water blues, and optimistic color.",
  },
] as const;

type GridlThemeId = (typeof gridlThemes)[number]["id"];
type GridlView =
  | "play"
  | "packs"
  | "pack"
  | "how"
  | "themes"
  | "achievements";
type PlayKind = "daily" | "campaign";
type FeedbackTone = "neutral" | "error" | "success";
type GridlSelection = {
  tileId: string;
  source: "pool" | "staged" | "committed";
} | null;
type DragPayload = NonNullable<GridlSelection>;

type GridlProgress = {
  completed: string[];
  bestTurns: Record<string, number>;
  achievements: string[];
  theme: GridlThemeId;
};

type GridlLevelSummary = {
  name: string;
  par: number;
  intro: string;
};

function isGridlTheme(value: unknown): value is GridlThemeId {
  return gridlThemes.some((theme) => theme.id === value);
}

function readProgress(): GridlProgress {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return {
      completed: Array.isArray(parsed.completed)
        ? parsed.completed.map(String)
        : [],
      bestTurns:
        parsed.bestTurns && typeof parsed.bestTurns === "object"
          ? parsed.bestTurns
          : {},
      achievements: Array.isArray(parsed.achievements)
        ? parsed.achievements.map(String)
        : [],
      theme: isGridlTheme(parsed.theme) ? parsed.theme : "light",
    };
  } catch {
    return {
      completed: [],
      bestTurns: {},
      achievements: [],
      theme: "light",
    };
  }
}

function writeProgress(progress: GridlProgress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function startGridlLevel(level: GridlLevel) {
  const state = initState(level);
  startLevel(state, level);
  return state;
}

function resultMessage(result: GridlResult) {
  return result.ok ? "" : result.reason;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readDragPayload(event: ReactDragEvent): DragPayload | null {
  try {
    const raw =
      event.dataTransfer.getData(GRIDL_DRAG_TYPE) ||
      event.dataTransfer.getData("text/plain");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.tileId === "string" &&
      ["pool", "staged", "committed"].includes(parsed.source)
    ) {
      return parsed as DragPayload;
    }
  } catch {
    return null;
  }
  return null;
}

function setDragPayload(event: ReactDragEvent, payload: DragPayload) {
  const serialized = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = payload.source === "committed" ? "copy" : "move";
  event.dataTransfer.setData(GRIDL_DRAG_TYPE, serialized);
  event.dataTransfer.setData("text/plain", serialized);
}

function portalColor(group: string | null) {
  if (group === "A") return "139, 92, 246";
  if (group === "B") return "16, 185, 129";
  if (group === "C") return "245, 158, 11";
  if (group === "D") return "239, 68, 68";
  return "31, 77, 255";
}

function MiniGrid({ kind }: { kind: "goal" | "line" | "recall" | "portal" }) {
  return (
    <div className={`gridl-mini-grid is-${kind}`} aria-hidden="true">
      {Array.from({ length: kind === "line" ? 3 : 4 }, (_, index) => (
        <span key={index}>{kind === "goal" && index === 3 ? "★" : ""}</span>
      ))}
    </div>
  );
}

export function GridlGame() {
  const todayKey = useMemo(() => localDateKey(), []);
  const dailyLevelId = useMemo(
    () => gridlDailyLevelId(todayKey, gridlLevelIds),
    [todayKey],
  );
  const [view, setView] = useState<GridlView>("play");
  const [playKind, setPlayKind] = useState<PlayKind>("daily");
  const [levelId, setLevelId] = useState(dailyLevelId);
  const [selectedChapterId, setSelectedChapterId] = useState("tutorial");
  const [level, setLevel] = useState<GridlLevel | null>(null);
  const [levelSummaries, setLevelSummaries] = useState<
    Record<string, GridlLevelSummary>
  >({});
  const [state, setState] = useState<GridlState | null>(null);
  const [progress, setProgress] = useState<GridlProgress>({
    completed: [],
    bestTurns: {},
    achievements: [],
    theme: "light",
  });
  const [selection, setSelection] = useState<GridlSelection>(null);
  const [mode, setMode] = useState<"play" | "recall">("play");
  const [feedback, setFeedback] = useState(
    "Choose a fragment, then choose a board cell.",
  );
  const [feedbackTone, setFeedbackTone] =
    useState<FeedbackTone>("neutral");
  const [won, setWon] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setProgress(readProgress());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      const entries = await Promise.all(
        gridlLevelIds.map(async (id) => {
          try {
            const response = await fetch(`/gridl/levels/level-${id}.json`);
            if (!response.ok) return null;
            const loaded = normalizeLevel(await response.json(), id);
            return [
              id,
              { name: loaded.name, par: loaded.par, intro: loaded.intro },
            ] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!cancelled) {
        setLevelSummaries(
          Object.fromEntries(entries.filter((entry) => entry !== null)),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      setLevel(null);
      setState(null);
      setSelection(null);
      setMode("play");
      setWon(false);
      setFeedback("Loading the board…");
      setFeedbackTone("neutral");
      try {
        const response = await fetch(`/gridl/levels/level-${levelId}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const nextLevel = normalizeLevel(await response.json(), levelId);
        if (cancelled) return;
        setLevel(nextLevel);
        setState(startGridlLevel(nextLevel));
        setFeedback(nextLevel.intro || "Route a valid word to the star.");
        if (playKind === "campaign") {
          localStorage.setItem(LAST_LEVEL_KEY, levelId);
        }
      } catch {
        if (!cancelled) {
          setFeedback("This level could not be loaded. Pick another board.");
          setFeedbackTone("error");
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [levelId, playKind]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const chapter = useMemo(() => chapterForGridlLevel(levelId), [levelId]);
  const selectedChapter =
    gridlChapters.find((entry) => entry.id === selectedChapterId) ||
    gridlChapters[0];
  const firstPuzzleUnlocked =
    progress.completed.length > 0 ||
    progress.achievements.includes("first-puzzle");
  const stagedRecalls = state?.turnPlacements.filter(
    (action) => action.type === "recall",
  );

  const refresh = useCallback(
    (nextFeedback?: string, tone: FeedbackTone = "neutral") => {
      if (!state) return;
      setState({ ...state });
      if (nextFeedback !== undefined) setFeedback(nextFeedback);
      setFeedbackTone(tone);
    },
    [state],
  );

  function showView(nextView: GridlView) {
    setView(nextView);
    setMenuOpen(false);
  }

  function openDaily() {
    setPlayKind("daily");
    setLevelId(dailyLevelId);
    showView("play");
  }

  function openChapter(chapterId: string) {
    setSelectedChapterId(chapterId);
    showView("pack");
  }

  function openCampaignLevel(id: string) {
    setPlayKind("campaign");
    setLevelId(id);
    showView("play");
  }

  function chooseTile(tileId: string) {
    setMode("play");
    setSelection({ tileId, source: "pool" });
    setFeedback("Selected. Choose any open cell to place it.");
    setFeedbackTone("neutral");
  }

  function stageRecall(tileId: string) {
    if (!state) return;
    const result = tryStageRecall(state, tileId);
    setSelection(null);
    refresh(
      result.ok
        ? "Recall staged in reserve. Submit to spend the turn."
        : resultMessage(result),
      result.ok ? "neutral" : "error",
    );
  }

  function handleCell(r: number, c: number) {
    if (!state) return;
    const cell = state.grid[r][c];
    const staged = state.turnPlacements.find(
      (action) =>
        action.type === "place" && action.r === r && action.c === c,
    );

    if (mode === "recall") {
      if (!cell.tileId || cell.seed || !state.placed.has(cell.tileId)) {
        refresh("Only committed, non-seed fragments can be recalled.", "error");
        return;
      }
      stageRecall(cell.tileId);
      return;
    }

    if (selection?.source === "committed") {
      refresh("Send that committed fragment to an empty reserve slot.", "error");
      return;
    }

    if (selection?.source === "pool" || selection?.source === "staged") {
      const result =
        selection.source === "staged"
          ? moveStagedPlacement(state, selection.tileId, r, c)
          : tryStagePlacement(state, selection.tileId, r, c);
      if (result.ok) setSelection(null);
      refresh(
        result.ok
          ? "Placement staged. Add another on the same line, or submit."
          : resultMessage(result),
        result.ok ? "neutral" : "error",
      );
      return;
    }

    if (staged?.type === "place") {
      setSelection({ tileId: staged.tile.id, source: "staged" });
      setFeedback("Staged fragment selected. Move it or return it to your hand.");
      setFeedbackTone("neutral");
      return;
    }

    if (cell.tileId && !cell.seed && state.placed.has(cell.tileId)) {
      setSelection({ tileId: cell.tileId, source: "committed" });
      setFeedback("Committed fragment selected. Choose an empty reserve slot to recall it.");
      setFeedbackTone("neutral");
      return;
    }

    if (cell.seed) {
      refresh("Seed fragments are fixed and cannot be moved.", "error");
      return;
    }

    refresh("Choose a fragment from your hand or reserve first.", "error");
  }

  function handleCellDrop(event: ReactDragEvent, r: number, c: number) {
    event.preventDefault();
    if (!state) return;
    const payload = readDragPayload(event);
    if (!payload) return;
    if (payload.source === "committed") {
      refresh("Committed fragments can only be recalled to reserve.", "error");
      return;
    }
    const result =
      payload.source === "staged"
        ? moveStagedPlacement(state, payload.tileId, r, c)
        : tryStagePlacement(state, payload.tileId, r, c);
    setSelection(null);
    refresh(
      result.ok ? "Fragment placed." : resultMessage(result),
      result.ok ? "neutral" : "error",
    );
  }

  function returnStagedTile(tileId: string) {
    if (!state) return;
    const action = state.turnPlacements.find(
      (candidate) =>
        candidate.type === "place" && candidate.tile.id === tileId,
    );
    if (!action || action.type !== "place") return;
    const result = returnStagedToPool(state, action.r, action.c, "hand");
    setSelection(null);
    refresh(
      result.ok ? "Fragment returned to your hand." : resultMessage(result),
      result.ok ? "neutral" : "error",
    );
  }

  function handleHandSlot() {
    if (selection?.source === "staged") {
      returnStagedTile(selection.tileId);
      return;
    }
    if (selection?.source === "committed") {
      refresh("Committed fragments can only be recalled to reserve.", "error");
    }
  }

  function handleHandDrop(event: ReactDragEvent) {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (payload?.source === "staged") returnStagedTile(payload.tileId);
  }

  function handleReserveSlot() {
    if (selection?.source === "committed") {
      stageRecall(selection.tileId);
      return;
    }
    if (selection?.source === "staged") {
      refresh("Only committed fragments can be recalled to reserve.", "error");
    }
  }

  function handleReserveDrop(event: ReactDragEvent) {
    event.preventDefault();
    const payload = readDragPayload(event);
    if (payload?.source === "committed") {
      stageRecall(payload.tileId);
    } else if (payload?.source === "staged") {
      refresh("Only committed fragments can be recalled to reserve.", "error");
    }
  }

  function handleSubmit() {
    if (!state || !level) return;
    const result = commitPlayTurn(state);
    setSelection(null);
    if (!result.ok) {
      refresh(result.reason, "error");
      return;
    }
    if (result.win) {
      const turns = state.turn - 1;
      const firstWin = progress.completed.length === 0;
      const nextProgress: GridlProgress = {
        ...progress,
        completed: Array.from(new Set([...progress.completed, level.id])),
        bestTurns: {
          ...progress.bestTurns,
          [level.id]: Math.min(
            progress.bestTurns[level.id] ?? Number.POSITIVE_INFINITY,
            turns,
          ),
        },
        achievements: Array.from(
          new Set([...progress.achievements, "first-puzzle"]),
        ),
      };
      setProgress(nextProgress);
      writeProgress(nextProgress);
      setWon(true);
      const performance =
        turns < level.par
          ? `Under par by ${level.par - turns}.`
          : turns === level.par
            ? `Right at par (${level.par}).`
            : `Over par by ${turns - level.par}.`;
      refresh(`Puzzle complete! ${performance}`, "success");
      setToast(
        firstWin
          ? `Puzzle complete in ${turns}. Frutiger Aero unlocked.`
          : `Puzzle complete in ${turns}. ${performance}`,
      );
      return;
    }
    refresh("Move accepted. Keep routing toward the star.", "success");
  }

  function handleUndo() {
    if (!state) return;
    rollbackTurn(state);
    setSelection(null);
    refresh("Staged actions cleared.");
  }

  function handleRestart() {
    if (!level) return;
    setState(startGridlLevel(level));
    setSelection(null);
    setMode("play");
    setWon(false);
    setFeedback(level.intro || "Route a valid word to the star.");
    setFeedbackTone("neutral");
  }

  function handleNext() {
    if (!chapter) {
      showView("packs");
      return;
    }
    const index = chapter.levelIds.indexOf(levelId);
    const nextLevel = chapter.levelIds[index + 1];
    if (nextLevel) openCampaignLevel(nextLevel);
    else showView("packs");
  }

  function selectTheme(themeId: GridlThemeId) {
    if (themeId === "frutiger-aero" && !firstPuzzleUnlocked) return;
    const nextProgress = { ...progress, theme: themeId };
    setProgress(nextProgress);
    writeProgress(nextProgress);
    setToast(`Theme switched to ${gridlThemes.find((item) => item.id === themeId)?.name}.`);
  }

  const turnsUsed = state ? state.turn - 1 : 0;
  const best = level ? progress.bestTurns[level.id] : undefined;
  const runs = state
    ? extractRuns(state)
        .filter((run) => run.cells >= 2)
        .map((run) => run.text.toUpperCase())
    : [];
  const parCount = Math.min(10, Math.max(0, Number(level?.par || 0)));
  const nextLevelId =
    playKind === "campaign" && chapter
      ? chapter.levelIds[chapter.levelIds.indexOf(levelId) + 1]
      : undefined;
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${todayKey}T12:00:00`));

  return (
    <div className="gridl-game-card" data-gridl-theme={progress.theme}>
      <header className="gridl-local-header">
        <button
          aria-label="Open Daily Puzzle"
          className="gridl-wordmark"
          onClick={openDaily}
          type="button"
        >
          gridl
        </button>
        <div className="gridl-local-menu-wrap">
          <button
            aria-expanded={menuOpen}
            aria-label="Gridl menu"
            className="gridl-menu-button"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <span /><span /><span /><span />
          </button>
          {menuOpen && (
            <nav aria-label="Gridl navigation" className="gridl-local-menu">
              <button onClick={openDaily} type="button">Daily Puzzle</button>
              <button onClick={() => showView("packs")} type="button">Puzzle Packs</button>
              <button onClick={() => showView("how")} type="button">How to Play</button>
              <button onClick={() => showView("themes")} type="button">Themes</button>
              <button onClick={() => showView("achievements")} type="button">Milestones</button>
            </nav>
          )}
        </div>
      </header>

      <main className={`gridl-view is-${view}`}>
        {view === "play" && (!level || !state) && (
          <div className="gridl-game-loading">Preparing the grid…</div>
        )}

        {view === "play" && level && state && (
          <section className="gridl-play-view">
            <div className="gridl-level-meta">
              <p>
                {playKind === "daily"
                  ? `Daily Puzzle · ${formattedDate}`
                  : `${chapter?.name || "Campaign"} · Level ${level.id}`}
              </p>
              <h2>{level.name}</h2>
              <div
                aria-label={`Par ${level.par}${best ? `, best ${best}` : ""}`}
                className="gridl-par-meter"
              >
                <div>
                  {Array.from({ length: 10 }, (_, index) => (
                    <span
                      className={[
                        index < parCount ? "is-filled" : "",
                        best === index + 1 ? "is-best" : "",
                      ].filter(Boolean).join(" ")}
                      key={index}
                      style={{ "--gridl-dot-index": index } as CSSProperties}
                    />
                  ))}
                </div>
                <small>{turnsUsed} turns · par {level.par} · best {best ?? "—"}</small>
              </div>
            </div>

            <div className="gridl-play-layout">
              <div className="gridl-board-column">
                <div
                  className="gridl-board"
                  style={{
                    gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
                    "--gridl-cols": state.cols,
                    "--gridl-rows": state.rows,
                  } as CSSProperties}
                >
                  {state.grid.flatMap((row, r) =>
                    row.map((cell, c) => {
                      const projection = getPortalOverlayText(state, r, c);
                      const staged = state.turnPlacements.some(
                        (action) =>
                          action.type === "place" && action.r === r && action.c === c,
                      );
                      const recallStaged = state.turnPlacements.some(
                        (action) =>
                          action.type === "recall" &&
                          action.tileSnapshot.id === cell.tileId,
                      );
                      const isGoal = level.goal.r === r && level.goal.c === c;
                      const selected = selection?.tileId === cell.tileId;
                      const source = staged
                        ? "staged"
                        : cell.tileId && !cell.seed && state.placed.has(cell.tileId)
                          ? "committed"
                          : null;
                      const group = state.portalAt[r][c];
                      return (
                        <button
                          aria-label={`${toA1(r, c)}${cell.text ? `, ${cell.text}` : ""}${projection ? `, projected ${projection}` : ""}${isGoal ? ", goal" : ""}`}
                          className={[
                            "gridl-cell",
                            cell.text ? "is-filled" : "",
                            cell.special ? `is-${cell.special}` : "",
                            cell.seed ? "is-seed" : "",
                            staged ? "is-staged" : "",
                            recallStaged ? "is-recall-staged" : "",
                            projection ? "is-projection" : "",
                            isGoal ? "is-goal" : "",
                            selected ? "is-selected" : "",
                          ].filter(Boolean).join(" ")}
                          disabled={cell.special === "blocked"}
                          draggable={Boolean(source)}
                          key={`${r}-${c}`}
                          onClick={() => handleCell(r, c)}
                          onDragOver={(event) => event.preventDefault()}
                          onDragStart={(event) => {
                            if (source && cell.tileId) {
                              setDragPayload(event, { tileId: cell.tileId, source });
                            }
                          }}
                          onDrop={(event) => handleCellDrop(event, r, c)}
                          style={{
                            "--gridl-portal-rgb": portalColor(group),
                          } as CSSProperties}
                          type="button"
                        >
                          {cell.special === "blocked" ? (
                            <span className="gridl-block-mark" aria-hidden="true" />
                          ) : (
                            <>
                              {isGoal && <i aria-hidden="true">★</i>}
                              <strong>{cell.text || projection}</strong>
                              <small>{toA1(r, c)}</small>
                              {cell.special === "portal" && group && (
                                <em aria-hidden="true">{group}</em>
                              )}
                            </>
                          )}
                        </button>
                      );
                    }),
                  )}
                </div>
                <p className="gridl-board-hint">Drag fragments or select, then place. Every move stays on one line.</p>
              </div>

              <aside className="gridl-rack">
                <div className="gridl-mode-switch" aria-label="Interaction mode">
                  <button
                    className={mode === "play" ? "is-current" : ""}
                    onClick={() => {
                      setMode("play");
                      setSelection(null);
                      setFeedback("Choose a fragment, then choose a board cell.");
                    }}
                    type="button"
                  >
                    Place
                  </button>
                  <button
                    className={mode === "recall" ? "is-current" : ""}
                    onClick={() => {
                      setMode("recall");
                      setSelection(null);
                      setFeedback("Choose a committed fragment to recall.");
                      setFeedbackTone("neutral");
                    }}
                    type="button"
                  >
                    Recall
                  </button>
                </div>

                <section>
                  <div className="gridl-rack-label">
                    <span>Hand</span><small>{state.deck.length} left</small>
                  </div>
                  <div className="gridl-tiles is-hand">
                    {Array.from({ length: 4 }, (_, index) => {
                      const tile = state.hand[index];
                      return tile ? (
                        <button
                          className={selection?.tileId === tile.id ? "is-selected" : ""}
                          draggable
                          key={tile.id}
                          onClick={() => chooseTile(tile.id)}
                          onDragStart={(event) =>
                            setDragPayload(event, { tileId: tile.id, source: "pool" })
                          }
                          type="button"
                        >
                          {tile.text}
                        </button>
                      ) : (
                        <button
                          aria-label="Empty hand slot"
                          className="is-empty"
                          key={`hand-${index}`}
                          onClick={handleHandSlot}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={handleHandDrop}
                          type="button"
                        >
                          +
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <div className="gridl-rack-label">
                    <span>Reserve</span><small>max 2</small>
                  </div>
                  <div className="gridl-tiles is-reserve">
                    {Array.from({ length: 2 }, (_, index) => {
                      const tile = state.reserve[index];
                      const recall = stagedRecalls?.[index - state.reserve.length];
                      if (tile) {
                        return (
                          <button
                            className={selection?.tileId === tile.id ? "is-selected" : ""}
                            draggable
                            key={tile.id}
                            onClick={() => chooseTile(tile.id)}
                            onDragStart={(event) =>
                              setDragPayload(event, { tileId: tile.id, source: "pool" })
                            }
                            type="button"
                          >
                            {tile.text}
                          </button>
                        );
                      }
                      if (recall?.type === "recall") {
                        return (
                          <button
                            className="is-recall"
                            key={recall.tileSnapshot.id}
                            onClick={() => {
                              const result = cancelStagedRecall(
                                state,
                                recall.tileSnapshot.id,
                              );
                              refresh(
                                result.ok ? "Recall cancelled." : resultMessage(result),
                                result.ok ? "neutral" : "error",
                              );
                            }}
                            type="button"
                          >
                            {recall.tileSnapshot.text}<span aria-hidden="true">↩</span>
                          </button>
                        );
                      }
                      return (
                        <button
                          aria-label="Empty reserve slot"
                          className="is-empty"
                          key={`reserve-${index}`}
                          onClick={handleReserveSlot}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={handleReserveDrop}
                          type="button"
                        >
                          +
                        </button>
                      );
                    })}
                  </div>
                </section>

                <div className="gridl-board-words">
                  <span>On the board</span>
                  <strong>{runs.length ? Array.from(new Set(runs)).join(" · ") : "Build your first run"}</strong>
                </div>

                <p
                  aria-live="polite"
                  className={`gridl-feedback is-${feedbackTone}`}
                >
                  {feedback}
                </p>

                <div className="gridl-actions">
                  <button
                    className="is-primary"
                    disabled={won || state.turnPlacements.length === 0}
                    onClick={handleSubmit}
                    type="button"
                  >
                    Submit
                  </button>
                  <button
                    disabled={state.turnPlacements.length === 0}
                    onClick={handleUndo}
                    type="button"
                  >
                    Clear
                  </button>
                  <button onClick={handleRestart} type="button">Reset</button>
                </div>

                {selection?.source === "staged" && (
                  <button
                    className="gridl-return-action"
                    onClick={() => returnStagedTile(selection.tileId)}
                    type="button"
                  >
                    Return selected fragment to hand
                  </button>
                )}

                {won && (
                  <div className="gridl-complete">
                    <p>Star reached</p>
                    <h3>{turnsUsed <= level.par ? "Par-perfect route." : "Route complete."}</h3>
                    <span>{turnsUsed} turns · par {level.par}</span>
                    <div>
                      <button onClick={handleRestart} type="button">Replay</button>
                      <button className="is-primary" onClick={handleNext} type="button">
                        {nextLevelId ? "Next" : "Packs"} →
                      </button>
                    </div>
                  </div>
                )}
              </aside>
            </div>

            <div className="gridl-play-footer">
              {playKind === "campaign" ? (
                <button onClick={() => openChapter(chapter?.id || "tutorial")} type="button">← Back to pack</button>
              ) : (
                <button onClick={() => showView("packs")} type="button">Browse puzzle packs</button>
              )}
              <button onClick={() => showView("how")} type="button">How to play</button>
            </div>
          </section>
        )}

        {view === "packs" && (
          <section className="gridl-library-view">
            <div className="gridl-view-heading">
              <p>31 handcrafted boards</p>
              <h2>Puzzle Packs</h2>
              <span>Learn the route, then bend it.</span>
            </div>
            <div className="gridl-pack-grid">
              {gridlChapters.map((entry) => {
                const completed = entry.levelIds.filter((id) =>
                  progress.completed.includes(id),
                ).length;
                return (
                  <button
                    className={`gridl-pack-card is-${entry.id}`}
                    key={entry.id}
                    onClick={() => openChapter(entry.id)}
                    type="button"
                  >
                    <span className="gridl-pack-grid-mark" aria-hidden="true" />
                    <small>{completed}/{entry.levelIds.length} complete</small>
                    <strong>{entry.name}</strong>
                    <p>
                      {entry.id === "tutorial" && "Guided stages that teach the route."}
                      {entry.id === "basics" && "Core moves and compact word paths."}
                      {entry.id === "building-blocks" && "Compose longer runs from simple parts."}
                      {entry.id === "singles" && "One-letter fragments, many possibilities."}
                      {entry.id === "portals" && "Project fragments across linked cells."}
                    </p>
                    <span className="gridl-pack-open">Open pack →</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {view === "pack" && (
          <section className="gridl-library-view">
            <div className="gridl-view-heading is-left">
              <button onClick={() => showView("packs")} type="button">← All packs</button>
              <p>{selectedChapter.levelIds.length} puzzles</p>
              <h2>{selectedChapter.name}</h2>
              <span>
                {selectedChapter.levelIds.filter((id) => progress.completed.includes(id)).length} complete
              </span>
            </div>
            <div className="gridl-level-grid">
              {selectedChapter.levelIds.map((id, index) => {
                const summary = levelSummaries[id];
                const complete = progress.completed.includes(id);
                return (
                  <button key={id} onClick={() => openCampaignLevel(id)} type="button">
                    {complete && <i aria-label="Complete">✓</i>}
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    <strong>{summary?.name || `Level ${id}`}</strong>
                    <span>Par {summary?.par ?? "—"}</span>
                    <em>{progress.bestTurns[id] ? `Best ${progress.bestTurns[id]}` : "Play"}</em>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {view === "how" && (
          <section className="gridl-info-view">
            <div className="gridl-view-heading">
              <p>The route in six moves</p>
              <h2>How to Play</h2>
              <span>Build words, stay connected, and cover the star.</span>
            </div>
            <div className="gridl-how-grid">
              <article><MiniGrid kind="goal" /><small>01</small><h3>Reach the goal</h3><p>Win when a submitted valid word covers the ★ cell.</p></article>
              <article><MiniGrid kind="line" /><small>02</small><h3>Play one line</h3><p>Place one or more fragments in a single row or column each turn.</p></article>
              <article><MiniGrid kind="line" /><small>03</small><h3>Make valid words</h3><p>Every new run and crossing on the board must be allowed.</p></article>
              <article><MiniGrid kind="line" /><small>04</small><h3>Stay connected</h3><p>All real fragments must connect back to a fixed seed.</p></article>
              <article><MiniGrid kind="recall" /><small>05</small><h3>Recall carefully</h3><p>A committed fragment can return to the two-slot reserve for one turn.</p></article>
              <article><MiniGrid kind="portal" /><small>06</small><h3>Use portals</h3><p>Matching portals project fragments and bridge board connectivity.</p></article>
            </div>
            <button className="gridl-primary-link" onClick={openDaily} type="button">Play today’s puzzle</button>
          </section>
        )}

        {view === "themes" && (
          <section className="gridl-info-view">
            <div className="gridl-view-heading">
              <p>Make the grid yours</p>
              <h2>Themes</h2>
              <span>Four complete looks from the original Gridl collection.</span>
            </div>
            <div className="gridl-theme-grid">
              {gridlThemes.map((theme) => {
                const locked = theme.id === "frutiger-aero" && !firstPuzzleUnlocked;
                const active = progress.theme === theme.id;
                return (
                  <button
                    className={[active ? "is-active" : "", locked ? "is-locked" : ""].filter(Boolean).join(" ")}
                    data-theme-preview={theme.id}
                    disabled={locked}
                    key={theme.id}
                    onClick={() => selectTheme(theme.id)}
                    type="button"
                  >
                    <span className="gridl-theme-preview" aria-hidden="true"><i /><i /><i /><i /></span>
                    <strong>{theme.name}</strong>
                    <p>{theme.description}</p>
                    <small>{active ? "Active" : locked ? "Complete one puzzle to unlock" : "Use theme"}</small>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {view === "achievements" && (
          <section className="gridl-info-view">
            <div className="gridl-view-heading">
              <p>Your route so far</p>
              <h2>Milestones</h2>
              <span>{progress.completed.length} of {gridlLevelIds.length} puzzles complete.</span>
            </div>
            <div className={`gridl-achievement-card ${firstPuzzleUnlocked ? "is-unlocked" : ""}`}>
              <span className="gridl-achievement-mark" aria-hidden="true">★</span>
              <div><small>{firstPuzzleUnlocked ? "Unlocked" : "Locked"}</small><h3>First Puzzle</h3><p>You did the thing.</p></div>
              <strong>Frutiger Aero theme</strong>
            </div>
            <div className="gridl-progress-summary">
              {gridlChapters.map((entry) => {
                const completed = entry.levelIds.filter((id) => progress.completed.includes(id)).length;
                return <div key={entry.id}><span>{entry.name}</span><i><b style={{ width: `${(completed / entry.levelIds.length) * 100}%` }} /></i><strong>{completed}/{entry.levelIds.length}</strong></div>;
              })}
            </div>
          </section>
        )}
      </main>

      {toast && <div className="gridl-toast" role="status">{toast}</div>}
    </div>
  );
}
