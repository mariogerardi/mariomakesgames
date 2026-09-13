import { runContent } from "./run-sync.mjs";

export function prepareRunWrite(existing, candidate) {
  if (existing && runContent(existing) === runContent(candidate)) return existing;
  const conflict = (message) => { throw Object.assign(new Error(message), { status: 409 }); };
  if ((candidate.syncRevision ?? 0) !== (existing?.syncRevision ?? 0)) conflict("Progress changed on another device.");
  if (existing?.outcome === "completed") conflict("Completed runs are immutable.");
  if (existing && (existing.playerId !== candidate.playerId || existing.gameId !== candidate.gameId || existing.startedAt !== candidate.startedAt
    || existing.mode !== candidate.mode || existing.puzzle.id !== candidate.puzzle.id || existing.puzzle.revision !== candidate.puzzle.revision)) {
    conflict("A run cannot change its owner, puzzle, mode, or start time.");
  }
  return { ...candidate, syncRevision: (existing?.syncRevision ?? 0) + 1 };
}
