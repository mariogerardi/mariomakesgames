import type { AuthorableGameId } from "./contracts.mjs";

export type StudioDailyMode = {
  id: string;
  label: string;
  puzzleCount: number;
};

export type StudioGameDefinition = {
  id: AuthorableGameId;
  name: string;
  shortName: string;
  description: string;
  accent: string;
  tint: string;
  dailyModes: StudioDailyMode[];
};

export const STUDIO_GAMES: StudioGameDefinition[] = [
  { id: "syllabl", name: "Syllabl", shortName: "SY", description: "Six-stage word and syllable puzzles", accent: "#338fd0", tint: "#dcecf3", dailyModes: [{ id: "daily", label: "Daily", puzzleCount: 1 }] },
  { id: "rarity", name: "Rarity", shortName: "RA", description: "One-string rarity challenges", accent: "#8050ba", tint: "#efe2f0", dailyModes: [{ id: "daily", label: "Daily", puzzleCount: 1 }] },
  { id: "before-after", name: "Before&After", shortName: "B&A", description: "Phrase bridges and connection puzzles", accent: "#c49125", tint: "#f6e5ac", dailyModes: [{ id: "daily", label: "Daily", puzzleCount: 1 }] },
  { id: "decode", name: "DECODE", shortName: "DE", description: "Color, position, and definition signals", accent: "#7651c7", tint: "#e8e0f5", dailyModes: [{ id: "daily-5", label: "Daily 5", puzzleCount: 1 }] },
  { id: "token", name: "TOKEN", shortName: "TK", description: "Model prediction puzzles", accent: "#61715d", tint: "#e2e9df", dailyModes: [{ id: "daily-easy", label: "Easy Daily", puzzleCount: 1 }, { id: "daily-hard", label: "Hard Daily", puzzleCount: 1 }] },
  { id: "dual", name: "DUAL", shortName: "DU", description: "English and Spanish word families", accent: "#287053", tint: "#d9ebd8", dailyModes: [{ id: "daily", label: "Daily", puzzleCount: 1 }] },
];

export const STUDIO_GAME_BY_ID = Object.freeze(Object.fromEntries(
  STUDIO_GAMES.map((game) => [game.id, game]),
) as Record<AuthorableGameId, StudioGameDefinition>);

export function isAuthorableGameId(value: string): value is AuthorableGameId {
  return STUDIO_GAMES.some((game) => game.id === value);
}
