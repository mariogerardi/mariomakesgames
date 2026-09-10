import { assertGameRun, GAME_RUN_SCHEMA_VERSION } from "./runs.mjs";

export const LOCAL_RUNS_STORAGE_KEY = "mg-games:v1:platform:runs";

function readRunStore(store, key) {
  try {
    const parsed = JSON.parse(store.getItem(key) ?? "null");
    if (!parsed || parsed.schemaVersion !== GAME_RUN_SCHEMA_VERSION || !Array.isArray(parsed.runs)) return [];
    return parsed.runs.filter((run) => {
      try {
        assertGameRun(run);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function writeRunStore(store, key, runs) {
  store.setItem(key, JSON.stringify({ schemaVersion: GAME_RUN_SCHEMA_VERSION, runs }));
}

export function createGuestPlayerRepository() {
  return {
    async getCurrent() {
      return null;
    },
    async saveCurrent() {
      throw new Error("A guest session cannot save a cloud player profile.");
    },
  };
}

export function createLocalRunRepository(store, options = {}) {
  const key = options.key ?? LOCAL_RUNS_STORAGE_KEY;
  return {
    async get(runId) {
      return structuredClone(readRunStore(store, key).find((run) => run.runId === runId) ?? null);
    },
    async list(query = {}) {
      const runs = readRunStore(store, key).filter((run) => (
        (query.gameId === undefined || run.gameId === query.gameId)
        && (query.mode === undefined || run.mode === query.mode)
        && (query.outcome === undefined || run.outcome === query.outcome)
        && (query.puzzleId === undefined || run.puzzle.id === query.puzzleId)
      ));
      return structuredClone(runs.sort((left, right) => right.startedAt.localeCompare(left.startedAt)));
    },
    async save(run) {
      assertGameRun(run);
      const runs = readRunStore(store, key);
      const index = runs.findIndex((candidate) => candidate.runId === run.runId);
      if (index >= 0 && runs[index].outcome === "completed" && JSON.stringify(runs[index]) !== JSON.stringify(run)) {
        throw new Error("Completed runs are immutable.");
      }
      if (index >= 0) runs[index] = structuredClone(run);
      else runs.push(structuredClone(run));
      writeRunStore(store, key, runs);
      return structuredClone(run);
    },
    async remove(runId) {
      const runs = readRunStore(store, key).filter((run) => run.runId !== runId);
      writeRunStore(store, key, runs);
    },
  };
}
