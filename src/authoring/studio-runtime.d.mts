import type { AnyPublishedPuzzle, AuthorableGameId, PuzzleSchedule } from "./contracts.mjs";
export function createStudioRuntime(options: { fetcher: typeof fetch; promoted: { schedule: PuzzleSchedule; puzzles: AnyPublishedPuzzle[] } }): {
  loadSlot(gameId: AuthorableGameId, mode: string, date: string): Promise<AnyPublishedPuzzle[]>;
  loadPublished(gameId: AuthorableGameId): Promise<AnyPublishedPuzzle[]>;
};
