import type { AnyPublishedPuzzle, AuthorableGameId, PuzzleSchedule } from "./contracts.mjs";
import promotedData from "./data/promoted-puzzles.json" with { type: "json" };

function promotedSlot(gameId: AuthorableGameId, mode: string, date: string) {
  const schedule = promotedData.schedule as PuzzleSchedule;
  const puzzles = promotedData.puzzles as AnyPublishedPuzzle[];
  const slot = schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === date);
  return slot?.puzzles.flatMap((reference) => puzzles.filter((puzzle) => puzzle.gameId === gameId && puzzle.id === reference.puzzleId && puzzle.revision === reference.revision)) ?? [];
}

/**
 * Resolves the immutable puzzle revisions assigned to a local Studio calendar
 * slot. The endpoint exists only in the local authoring server; shipped builds
 * intentionally fall back to their bundled catalogs.
 */
export async function loadLocalStudioSlot(gameId: AuthorableGameId, mode: string, date: string) {
  try {
    const [scheduleResponse, publishedResponse] = await Promise.all([
      fetch("/api/studio/schedule", { cache: "no-store" }),
      fetch(`/api/studio/published?gameId=${encodeURIComponent(gameId)}`, { cache: "no-store" }),
    ]);
    if (!scheduleResponse.ok || !publishedResponse.ok) return promotedSlot(gameId, mode, date);
    const schedulePayload = await scheduleResponse.json() as { schedule?: PuzzleSchedule };
    const publishedPayload = await publishedResponse.json() as { puzzles?: AnyPublishedPuzzle[] };
    const slot = schedulePayload.schedule?.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === date);
    if (!slot) return promotedSlot(gameId, mode, date);
    const published = publishedPayload.puzzles ?? [];
    return slot.puzzles.flatMap((reference) => {
      const match = published.find((puzzle) => puzzle.gameId === gameId && puzzle.id === reference.puzzleId && puzzle.revision === reference.revision);
      return match ? [match] : [];
    });
  } catch {
    return promotedSlot(gameId, mode, date);
  }
}

export async function loadLocalStudioPublished(gameId: AuthorableGameId) {
  try {
    const response = await fetch(`/api/studio/published?gameId=${encodeURIComponent(gameId)}`, { cache: "no-store" });
    if (!response.ok) return (promotedData.puzzles as AnyPublishedPuzzle[]).filter((puzzle) => puzzle.gameId === gameId);
    const payload = await response.json() as { puzzles?: AnyPublishedPuzzle[] };
    return payload.puzzles ?? [];
  } catch {
    return (promotedData.puzzles as AnyPublishedPuzzle[]).filter((puzzle) => puzzle.gameId === gameId);
  }
}
