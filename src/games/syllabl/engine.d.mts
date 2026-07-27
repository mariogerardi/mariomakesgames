export type SyllablPuzzle = {
  puzzleLetters: string;
  inputsEnabled: number[];
  syllablesRequired: number[];
};

export type SyllablGuess = {
  word: string;
  syllables: number;
  syllableList: string[];
};

export type SyllablSession = {
  schemaVersion: 2;
  puzzle: SyllablPuzzle;
  puzzleDate: string;
  mode: string;
  currentStage: number;
  guesses: SyllablGuess[];
  status: "in-progress" | "complete";
};

export const SYLLABL_STAGE_COUNT: 6;
export const SYLLABL_SESSION_SCHEMA_VERSION: 2;
export function validateSyllablPlacement(
  word: string,
  puzzleLetters: string,
  placementCode: number,
): boolean;
export function createSyllablSession(input: {
  puzzle: SyllablPuzzle;
  puzzleDate: string;
  mode?: string;
}): SyllablSession;
export function getSyllablConstraint(
  session: SyllablSession,
): { placementCode: number; syllablesRequired: number } | null;
export function evaluateSyllablAttempt(input: {
  session: SyllablSession;
  word: string;
  wordInfo?: {
    isValid: boolean;
    syllableList?: string[];
    syllableParses?: Array<{ count: number; syllables?: string[] }>;
  };
}):
  | {
      accepted: true;
      reason: "accepted";
      guess: SyllablGuess;
      session: SyllablSession;
    }
  | {
      accepted: false;
      reason: string;
      session: SyllablSession;
    };
export function serializeSyllablSession(
  session: SyllablSession,
): Record<string, unknown>;
export function hydrateSyllablSession(input: {
  stored?: Record<string, unknown> | null;
  puzzle: SyllablPuzzle;
  puzzleDate: string;
  mode?: string;
}): SyllablSession;
export function syllablDailyStorageKey(dateKey: string): string;
