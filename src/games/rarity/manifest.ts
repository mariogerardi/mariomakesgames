import type { GameManifest } from "../types";

export const rarityManifest = {
  id: "rarity",
  symbol: "RA",
  eyebrow: "one word. make it count.",
  description:
    "find the rarest valid word containing the daily string. you only get one.",
  mechanics: ["One submission", "Daily string", "Continuous score"],
  stage: "playable",
} as const satisfies GameManifest;
