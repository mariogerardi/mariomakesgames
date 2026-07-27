export type Expl41nMode = "daily" | "shuffle" | "archive" | "custom";
export type Expl41nPuzzle = { word: string; date: string; funFact: string };
export type Expl41nGuess = {
  guess: string;
  confidence: number;
  searchSpace: number;
  reasoning: string;
};
export type Expl41nAttempt = Expl41nGuess & {
  clue: string;
  characters: number;
  won: boolean;
  timestamp: string;
};
export type Expl41nSession = {
  version: 1;
  puzzle: Expl41nPuzzle;
  mode: Expl41nMode;
  sessionDate: string;
  attempts: Expl41nAttempt[];
  status: "active" | "won" | "lost";
  winningAttempt: Expl41nAttempt | null;
};
export const EXPL41N_CLUE_LIMIT: 25;
export const EXPL41N_DAILY_ATTEMPTS: 5;
export function validateExpl41nClue(value: unknown):
  | { valid: true; reason: null; clue: string }
  | { valid: false; reason: string; clue: string };
export function validateExpl41nCustomWord(value: unknown):
  | { valid: true; reason: null; word: string }
  | { valid: false; reason: string; word: string };
export function createExpl41nSession(input: {
  puzzle: Expl41nPuzzle;
  mode: Expl41nMode;
  sessionDate: string;
}): Expl41nSession;
export function applyExpl41nGuess(
  session: Expl41nSession,
  input: {
    clue: string;
    response: Expl41nGuess;
    timestamp: string;
  },
): {
  accepted: boolean;
  reason: string | null;
  won?: boolean;
  lost?: boolean;
  attempt?: Expl41nAttempt;
  state: Expl41nSession;
};
export function serializeExpl41nSession(
  session: Expl41nSession,
): Record<string, unknown>;
export function hydrateExpl41nSession(input: {
  payload: unknown;
  puzzle: Expl41nPuzzle;
  mode: Expl41nMode;
  sessionDate: string;
}): Expl41nSession;
export function attemptsRemaining(session: Expl41nSession): number;
export function expl41nAvatarMood(
  confidence: number,
  status?: Expl41nSession["status"],
): string;
