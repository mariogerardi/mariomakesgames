import type { GameManifest } from "../types";

export const dualManifest = {
  id: "dual",
  symbol: "EN·ES",
  eyebrow: "Two languages, one string",
  description: "Find English and Spanish words in the same letters.",
  mechanics: ["English + Spanish", "Lemma scoring", "Dual discoveries"],
  stage: "playable",
} as const satisfies GameManifest;
