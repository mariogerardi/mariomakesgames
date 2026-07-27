import type { GameManifest } from "../types";

export const decodeManifest = {
  id: "decode",
  symbol: "DE",
  eyebrow: "Color, clue, transform",
  description:
    "Turn one word into another using positional colors and a crossword-style hint.",
  mechanics: ["118 unique puzzles", "Timed escalation", "Original Daily 5"],
  stage: "playable",
} as const satisfies GameManifest;
