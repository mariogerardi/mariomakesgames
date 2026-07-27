import type { GameManifest } from "../types";

export const decodeManifest = {
  id: "decode",
  symbol: "DE",
  eyebrow: "Color, clue, transform",
  description:
    "Turn one word into another using positional colors and a crossword-style hint.",
  mechanics: ["Timed mode", "Daily five", "Position clues"],
  stage: "queued",
} as const satisfies GameManifest;
