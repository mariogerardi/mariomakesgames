import type { GameManifest } from "../types";

export const expl41nManifest = {
  id: "expl41n",
  symbol: "E4",
  eyebrow: "Clue carefully",
  description:
    "Give an AI just enough to guess the secret word—without saying too much.",
  mechanics: ["Strategic clues", "AI guesser", "Language play"],
  stage: "queued",
} as const satisfies GameManifest;
