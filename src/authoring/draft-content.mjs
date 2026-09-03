import { createEmptyPuzzlePayload } from "./contracts.mjs";

/**
 * A blank creator canvas is not a draft yet. It becomes one only after the
 * author adds game content or private authoring metadata.
 */
export function isMeaningfulPuzzleDraft(draft) {
  if (!draft) return false;
  if (draft.title?.trim() || draft.notes?.trim() || draft.tags?.length) return true;
  return JSON.stringify(draft.payload) !== JSON.stringify(createEmptyPuzzlePayload(draft.gameId));
}
