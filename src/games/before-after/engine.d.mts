export type BridgePosition = "before" | "after" | "both";
export type BridgeMode = "packs" | "daily" | "archive" | "custom";
export type BridgePuzzle = {
  id: string;
  clueWords: string[];
  position: BridgePosition;
  answer: string;
  difficulty: number;
};
export type BridgeSession = {
  version: 1;
  puzzle: BridgePuzzle;
  mode: BridgeMode;
  answerText: string;
  attempts: number;
  status: "active" | "solved" | "expired";
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
};
export const BEFORE_AFTER_ANSWER_LIMIT: 15;
export const BEFORE_AFTER_DAILY_SECONDS: 60;
export function normalizeBridgeAnswer(value: unknown): string;
export function createBridgeSession(input: {
  puzzle: BridgePuzzle;
  mode: BridgeMode;
  startedAt?: number;
}): BridgeSession;
export function submitBridgeAnswer(
  session: BridgeSession,
  answer: string,
  now?: number,
): {
  accepted: boolean;
  correct: boolean;
  state: BridgeSession;
};
export function expireBridgeSession(
  session: BridgeSession,
  now?: number,
): BridgeSession;
export function remainingBridgeSeconds(
  session: BridgeSession,
  now?: number,
): number;
export function bridgePhrases(
  puzzle: BridgePuzzle,
  answer?: string,
): string[];
export function validateCustomBridgePuzzle(input: {
  answer: string;
  clueOne: string;
  clueTwo: string;
  position: BridgePosition;
}):
  | { valid: true; reason: null; puzzle: BridgePuzzle }
  | { valid: false; reason: string };
export function hydrateBridgeSession(input: {
  payload: unknown;
  puzzle: BridgePuzzle;
  mode: BridgeMode;
  now?: number;
}): BridgeSession;
export function serializeBridgeSession(
  session: BridgeSession,
): Record<string, unknown>;
