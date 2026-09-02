export type GameId =
  | "syllabl"
  | "rarity"
  | "gridl"
  | "expl41n"
  | "before-after"
  | "decode"
  | "token"
  | "dual";

export type GameManifest = {
  id: GameId;
  symbol: string;
  eyebrow: string;
  description: string;
  mechanics: readonly string[];
  stage: "playable" | "queued";
};
