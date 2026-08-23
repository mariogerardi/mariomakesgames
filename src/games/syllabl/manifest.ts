import type { GameManifest } from "../types";

export const syllablManifest = {
  id: "syllabl",
  symbol: "sy",
  eyebrow: "one string · six words",
  description:
    "find six words that match changing placement and syllable rules.",
  mechanics: ["six stages", "daily puzzle", "completion only"],
  stage: "playable",
} as const satisfies GameManifest;
