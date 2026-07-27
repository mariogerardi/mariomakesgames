"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { gameStorageKey } from "../../platform/storage";
import {
  chapterForGridlLevel,
  gridlChapters,
  gridlLevelIds,
} from "./catalog";
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

type GridlProgress = {
  completed: string[];
  bestTurns: Record<string, number>;
};

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
    };
  } catch {
    return { completed: [], bestTurns: {} };
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

export function GridlGame() {
  const [levelId, setLevelId] = useState("101");
  const [level, setLevel] = useState<GridlLevel | null>(null);
  const [state, setState] = useState<GridlState | null>(null);
  const [progress, setProgress] = useState<GridlProgress>({
    completed: [],
    bestTurns: {},
  });
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [mode, setMode] = useState<"play" | "recall">("play");
  const [feedback, setFeedback] = useState(
    "Choose a fragment, then choose a board cell.",
  );
  const [feedbackTone, setFeedbackTone] = useState<
    "neutral" | "error" | "success"
  >("neutral");
  const [won, setWon] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedProgress = readProgress();
      const storedLevel = localStorage.getItem(LAST_LEVEL_KEY);
      setProgress(storedProgress);
      if (storedLevel && gridlLevelIds.includes(storedLevel)) {
        setLevelId(storedLevel);
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
      setSelectedTileId(null);
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
        localStorage.setItem(LAST_LEVEL_KEY, levelId);
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
  }, [levelId]);

  const chapter = useMemo(
    () => chapterForGridlLevel(levelId),
    [levelId],
  );
  const stagedPlacements = state?.turnPlacements.filter(
    (action) => action.type === "place",
  );
  const stagedRecalls = state?.turnPlacements.filter(
    (action) => action.type === "recall",
  );

  const refresh = useCallback(
    (nextFeedback?: string, tone: "neutral" | "error" | "success" = "neutral") => {
      if (!state) return;
      setState({ ...state });
      if (nextFeedback !== undefined) setFeedback(nextFeedback);
      setFeedbackTone(tone);
    },
    [state],
  );

  function chooseTile(tileId: string) {
    if (mode !== "play") setMode("play");
    setSelectedTileId(tileId);
    setFeedback("Now choose an open cell.");
    setFeedbackTone("neutral");
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
      const result = tryStageRecall(state, cell.tileId);
      setSelectedTileId(null);
      refresh(
        result.ok ? "Recall staged. Submit to spend the turn." : resultMessage(result),
        result.ok ? "neutral" : "error",
      );
      return;
    }

    if (staged?.type === "place") {
      setSelectedTileId(staged.tile.id);
      setFeedback("Fragment selected. Choose a new cell to move it.");
      setFeedbackTone("neutral");
      return;
    }

    if (!selectedTileId) {
      refresh("Choose a fragment from your hand or reserve first.", "error");
      return;
    }

    const moving = state.turnPlacements.some(
      (action) =>
        action.type === "place" && action.tile.id === selectedTileId,
    );
    const result = moving
      ? moveStagedPlacement(state, selectedTileId, r, c)
      : tryStagePlacement(state, selectedTileId, r, c);
    if (result.ok) setSelectedTileId(null);
    refresh(
      result.ok
        ? "Placement staged. Add another on the same line, or submit."
        : resultMessage(result),
      result.ok ? "neutral" : "error",
    );
  }

  function handleReturnSelected() {
    if (!state || !selectedTileId) return;
    const action = state.turnPlacements.find(
      (candidate) =>
        candidate.type === "place" && candidate.tile.id === selectedTileId,
    );
    if (!action || action.type !== "place") return;
    const result = returnStagedToPool(state, action.r, action.c, "hand");
    if (result.ok) setSelectedTileId(null);
    refresh(
      result.ok ? "Fragment returned to your hand." : resultMessage(result),
      result.ok ? "neutral" : "error",
    );
  }

  function handleSubmit() {
    if (!state || !level) return;
    const result = commitPlayTurn(state);
    if (!result.ok) {
      refresh(result.reason, "error");
      return;
    }
    setSelectedTileId(null);
    if (result.win) {
      const turns = state.turn - 1;
      const nextProgress: GridlProgress = {
        completed: Array.from(new Set([...progress.completed, level.id])),
        bestTurns: {
          ...progress.bestTurns,
          [level.id]: Math.min(
            progress.bestTurns[level.id] ?? Number.POSITIVE_INFINITY,
            turns,
          ),
        },
      };
      setProgress(nextProgress);
      writeProgress(nextProgress);
      setWon(true);
      refresh(
        turns <= level.par
          ? `Route complete in ${turns} turn${turns === 1 ? "" : "s"}—at par or better.`
          : `Route complete in ${turns} turns.`,
        "success",
      );
      return;
    }
    refresh("Valid turn. Keep routing toward the star.", "success");
  }

  function handleUndo() {
    if (!state) return;
    rollbackTurn(state);
    setSelectedTileId(null);
    refresh("Staged actions cleared.");
  }

  function handleRestart() {
    if (!level) return;
    setState(startGridlLevel(level));
    setSelectedTileId(null);
    setMode("play");
    setWon(false);
    setFeedback(level.intro || "Route a valid word to the star.");
    setFeedbackTone("neutral");
  }

  function handleNext() {
    const index = gridlLevelIds.indexOf(levelId);
    setLevelId(gridlLevelIds[(index + 1) % gridlLevelIds.length]);
  }

  if (!level || !state) {
    return <div className="gridl-game-loading">Preparing the grid…</div>;
  }

  const turnsUsed = state.turn - 1;
  const best = progress.bestTurns[level.id];
  const runs = extractRuns(state)
    .filter((run) => run.cells >= 2)
    .map((run) => run.text.toUpperCase());

  return (
    <div className="gridl-game-card">
      <header className="gridl-game-header">
        <div>
          <p>{chapter?.name || "Campaign"} · Level {level.id}</p>
          <h2>{level.name}</h2>
        </div>
        <div className="gridl-scoreboard" aria-label="Turn score">
          <span><b>{turnsUsed}</b> turns</span>
          <span><b>{level.par}</b> par</span>
          <span><b>{best ?? "—"}</b> best</span>
        </div>
      </header>

      <nav className="gridl-chapters" aria-label="Gridl chapters">
        {gridlChapters.map((entry) => (
          <button
            className={entry.id === chapter?.id ? "is-current" : ""}
            key={entry.id}
            onClick={() => setLevelId(entry.levelIds[0])}
            type="button"
          >
            {entry.name}
            <small>
              {entry.levelIds.filter((id) => progress.completed.includes(id)).length}/
              {entry.levelIds.length}
            </small>
          </button>
        ))}
      </nav>

      <div className="gridl-level-strip" aria-label="Levels in this chapter">
        {chapter?.levelIds.map((id, index) => (
          <button
            aria-label={`Open level ${id}`}
            className={id === levelId ? "is-current" : ""}
            key={id}
            onClick={() => setLevelId(id)}
            type="button"
          >
            {progress.completed.includes(id) ? "✓" : index + 1}
          </button>
        ))}
      </div>

      <p className="gridl-intro">{level.intro}</p>

      <div className="gridl-workbench">
        <div
          className="gridl-board"
          style={{
            gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
            "--gridl-cols": state.cols,
          } as React.CSSProperties}
        >
          {state.grid.flatMap((row, r) =>
            row.map((cell, c) => {
              const projection = getPortalOverlayText(state, r, c);
              const staged = state.turnPlacements.some(
                (action) =>
                  action.type === "place" && action.r === r && action.c === c,
              );
              const isGoal = level.goal.r === r && level.goal.c === c;
              const isSelected = Boolean(
                staged && cell.tileId === selectedTileId,
              );
              return (
                <button
                  aria-label={`${toA1(r, c)}${cell.text ? `, ${cell.text}` : ""}${projection ? `, projected ${projection}` : ""}${isGoal ? ", goal" : ""}`}
                  className={[
                    "gridl-cell",
                    cell.special ? `is-${cell.special}` : "",
                    cell.seed ? "is-seed" : "",
                    staged ? "is-staged" : "",
                    projection ? "is-projection" : "",
                    isGoal ? "is-goal" : "",
                    isSelected ? "is-selected" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={cell.special === "blocked"}
                  key={`${r}-${c}`}
                  onClick={() => handleCell(r, c)}
                  type="button"
                >
                  <small>{toA1(r, c)}</small>
                  {cell.special === "blocked" ? (
                    <span aria-hidden="true">×</span>
                  ) : (
                    <>
                      <strong>{cell.text || projection}</strong>
                      {isGoal && <i aria-hidden="true">★</i>}
                      {cell.special === "portal" && (
                        <em aria-hidden="true">{state.portalAt[r][c]}</em>
                      )}
                    </>
                  )}
                </button>
              );
            }),
          )}
        </div>

        <aside className="gridl-rack">
          <div className="gridl-mode-switch">
            <button
              className={mode === "play" ? "is-current" : ""}
              onClick={() => {
                setMode("play");
                setSelectedTileId(null);
              }}
              type="button"
            >
              Place
            </button>
            <button
              className={mode === "recall" ? "is-current" : ""}
              onClick={() => {
                setMode("recall");
                setSelectedTileId(null);
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
            <div className="gridl-tiles">
              {state.hand.map((tile) => (
                <button
                  className={selectedTileId === tile.id ? "is-selected" : ""}
                  key={tile.id}
                  onClick={() => chooseTile(tile.id)}
                  type="button"
                >
                  {tile.text}
                </button>
              ))}
              {Array.from({ length: Math.max(0, 4 - state.hand.length) }).map(
                (_, index) => <span key={`hand-empty-${index}`} />,
              )}
            </div>
          </section>

          <section>
            <div className="gridl-rack-label">
              <span>Reserve</span><small>max 2</small>
            </div>
            <div className="gridl-tiles is-reserve">
              {state.reserve.map((tile) => (
                <button
                  className={selectedTileId === tile.id ? "is-selected" : ""}
                  key={tile.id}
                  onClick={() => chooseTile(tile.id)}
                  type="button"
                >
                  {tile.text}
                </button>
              ))}
              {stagedRecalls?.map(
                (action) =>
                  action.type === "recall" && (
                    <button
                      className="is-recall"
                      key={action.tileSnapshot.id}
                      onClick={() => {
                        const result = cancelStagedRecall(
                          state,
                          action.tileSnapshot.id,
                        );
                        refresh(
                          result.ok
                            ? "Recall cancelled."
                            : resultMessage(result),
                          result.ok ? "neutral" : "error",
                        );
                      }}
                      type="button"
                    >
                      {action.tileSnapshot.text}
                    </button>
                  ),
              )}
            </div>
          </section>

          {runs.length > 0 && (
            <p className="gridl-runs">
              <span>On the board</span> {Array.from(new Set(runs)).join(" · ")}
            </p>
          )}

          <div className="gridl-actions">
            <button
              className="is-primary"
              disabled={won || state.turnPlacements.length === 0}
              onClick={handleSubmit}
              type="button"
            >
              Submit turn <span aria-hidden="true">→</span>
            </button>
            <button
              disabled={state.turnPlacements.length === 0}
              onClick={handleUndo}
              type="button"
            >
              Clear
            </button>
            {selectedTileId &&
              stagedPlacements?.some(
                (action) =>
                  action.type === "place" &&
                  action.tile.id === selectedTileId,
              ) && (
                <button onClick={handleReturnSelected} type="button">
                  Return to hand
                </button>
              )}
          </div>
        </aside>
      </div>

      <p
        aria-live="polite"
        className={`gridl-feedback is-${feedbackTone}`}
      >
        {feedback}
      </p>

      {won && (
        <div className="gridl-complete">
          <div>
            <p>Star reached</p>
            <h3>{turnsUsed <= level.par ? "A par-perfect route." : "Route complete."}</h3>
            <span>
              {turnsUsed} turn{turnsUsed === 1 ? "" : "s"} · par {level.par}
            </span>
          </div>
          <div>
            <button onClick={handleRestart} type="button">Replay</button>
            <button className="is-primary" onClick={handleNext} type="button">
              Next level <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      {!won && (
        <footer className="gridl-game-footer">
          <button onClick={handleRestart} type="button">Restart board</button>
          <details>
            <summary>How to play</summary>
            <p>
              Place one or more fragments in a single row or column. Every
              resulting run must be allowed and connected to the seed. Reach
              the starred cell with a word. Recalling a committed fragment
              costs a turn and sends it to your two-slot reserve. Portals copy
              a fragment across matching letters.
            </p>
          </details>
        </footer>
      )}
    </div>
  );
}
