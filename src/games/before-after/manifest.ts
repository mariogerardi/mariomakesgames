import type { GameManifest } from "../types";

export const beforeAfterManifest = {
  id: "before-after",
  symbol: "B&A",
  eyebrow: "Find the word in between",
  description:
    "Bridge a pair of clues with the one word that belongs before, after, or both.",
  mechanics: ["Two clues", "One bridge", "Phrase logic"],
  stage: "queued",
} as const satisfies GameManifest;
