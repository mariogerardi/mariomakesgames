import type { GameManifest } from "../types";

export const rarityManifest = {
  id: "rarity",
  symbol: "RA",
  eyebrow: "One word. Make it count.",
  description:
    "Find the rarest valid word containing the daily string. You only get one.",
  mechanics: ["One submission", "Daily string", "Continuous score"],
  stage: "queued",
} as const satisfies GameManifest;
