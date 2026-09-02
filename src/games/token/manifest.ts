import type { GameManifest } from "../types";

export const tokenManifest = {
  id: "token",
  symbol: "T",
  eyebrow: "Prediction game",
  description: "Predict the machine.",
  mechanics: ["Frozen responses", "Partial credit", "One token at a time"],
  stage: "playable",
} as const satisfies GameManifest;
