import type { GameManifest } from "../types";

export const expl41nManifest = {
  id: "expl41n",
  symbol: "E4",
  eyebrow: "Clue carefully",
  description:
    "Give an AI just enough to guess the secret word—without saying too much.",
  mechanics: ["Four game modes", "AI guesser", "Shortest clue wins"],
  stage: "playable",
} as const satisfies GameManifest;
