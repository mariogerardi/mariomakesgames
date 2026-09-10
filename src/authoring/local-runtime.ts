import type { AnyPublishedPuzzle, PuzzleSchedule } from "./contracts.mjs";
import promotedData from "./data/promoted-puzzles.json" with { type: "json" };
import { createStudioRuntime } from "./studio-runtime.mjs";

// Local Studio assignments take precedence. Deployed builds use promoted
// immutable revisions until a cloud puzzle-publishing service is connected.
const runtime = createStudioRuntime({
  fetcher: (...args) => fetch(...args),
  promoted: promotedData as { schedule: PuzzleSchedule; puzzles: AnyPublishedPuzzle[] },
});
export const loadLocalStudioSlot = runtime.loadSlot;
export const loadLocalStudioPublished = runtime.loadPublished;
