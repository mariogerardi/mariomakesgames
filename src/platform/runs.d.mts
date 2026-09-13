import type { RaritySubmission } from "../games/rarity/engine.mjs";

export type CloudGameId = "syllabl" | "rarity" | "before-after" | "decode" | "token" | "dual";
export type GameRunOutcome = "in-progress" | "completed" | "abandoned";

export type GameModeByGame = {
  syllabl: "daily";
  rarity: "daily";
  "before-after": "packs" | "daily" | "archive";
  decode: "timed" | "daily-5" | "zen";
  token: "daily-easy" | "daily-hard" | "archive";
  dual: "daily" | "archive";
};

export type SyllablRunResult = {
  stagesCompleted: number;
  totalStages: 6;
  guesses: Array<{ word: string; syllables: number; syllableList: string[] }>;
};

export type RarityRunResult = {
  submission: RaritySubmission | null;
};

export type BeforeAfterRunResult = {
  attempts: number;
  durationMs: number;
  status: "active" | "solved" | "expired" | "abandoned";
};

export type DecodeRunResult = {
  score: number;
  signalsCompleted: number;
  elapsedSeconds?: number;
  finalAnswer?: string;
};

export type TokenRunResult = {
  averageScore: number;
  exactMatches: number;
  predictions: Array<{
    stopIndex: number;
    canonical: string;
    entry: string;
    exact: boolean;
    score: number;
    tokenized: string[];
  }>;
};

export type DualRunResult = {
  score: number;
  enScore: number;
  esScore: number;
  enFamilies: number;
  esFamilies: number;
  foundDuals: number;
  totalDuals: number;
  submissions: Array<{
    surface: string;
    languages: Array<"en" | "es">;
    points: number;
    submittedAt: number;
  }>;
};

export type GameRunResultByGame = {
  syllabl: SyllablRunResult;
  rarity: RarityRunResult;
  "before-after": BeforeAfterRunResult;
  decode: DecodeRunResult;
  token: TokenRunResult;
  dual: DualRunResult;
};

export type GameRun<G extends CloudGameId = CloudGameId> = {
  schemaVersion: 1;
  runId: string;
  playerId: string | null;
  gameId: G;
  mode: GameModeByGame[G];
  puzzle: {
    id: string;
    revision: number;
    date?: string;
  };
  startedAt: string;
  completedAt: string | null;
  outcome: GameRunOutcome;
  score?: number;
  syncRevision?: number;
  updatedAt?: string;
  checkpoint?: { version: 1; state: Record<string, unknown> };
  result: GameRunResultByGame[G];
};

export type AnyGameRun = { [G in CloudGameId]: GameRun<G> }[CloudGameId];

export type RunQuery = {
  gameId?: CloudGameId;
  mode?: string;
  outcome?: GameRunOutcome;
  puzzleId?: string;
};

export interface RunRepository {
  get(runId: string): Promise<AnyGameRun | null>;
  list(query?: RunQuery): Promise<AnyGameRun[]>;
  save(run: AnyGameRun): Promise<AnyGameRun>;
  remove(runId: string): Promise<void>;
}

export type GameRunValidation = { valid: boolean; errors: string[] };

export const GAME_RUN_SCHEMA_VERSION: 1;
export const CLOUD_GAME_IDS: readonly CloudGameId[];
export function validateGameRun(value: unknown): GameRunValidation;
export function assertGameRun<G extends CloudGameId>(value: GameRun<G>): GameRun<G>;
