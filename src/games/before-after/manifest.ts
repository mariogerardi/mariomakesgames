import type { GameManifest } from "../types";

export const beforeAfterManifest = {
  id: "before-after",
  symbol: "B&A",
  eyebrow: "Find the word in between",
  description:
    "Bridge a pair of clues with the one word that belongs before, after, or both.",
  mechanics: ["204 authored puzzles", "Three bridge rules", "Timed Daily"],
  stage: "playable",
} as const satisfies GameManifest;
