export type GameId =
  | "syllabl"
  | "rarity"
  | "gridl"
  | "expl41n"
  | "before-after"
  | "decode";

export type GameManifest = {
  id: GameId;
  symbol: string;
  eyebrow: string;
  description: string;
  mechanics: readonly string[];
  stage: "first-up" | "queued";
};
