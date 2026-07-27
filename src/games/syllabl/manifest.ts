import type { GameManifest } from "../types";

export const syllablManifest = {
  id: "syllabl",
  symbol: "SY",
  eyebrow: "The flagship daily",
  description:
    "Build a word through six increasingly specific clues—placement, syllables, and all.",
  mechanics: ["Six stages", "Daily puzzle", "Completion only"],
  stage: "playable",
} as const satisfies GameManifest;
