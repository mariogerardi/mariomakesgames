export const TOKEN_PHASES: Readonly<Record<string, string>>;
export function transitionTokenRun(run: Record<string, unknown>, phase: string): Record<string, unknown>;
export function createTokenRun(puzzle: { id: string }): {
  puzzleId: string;
  phase: string;
  cursor: number;
  stopCursor: number;
  submissions: unknown[];
  completed: boolean;
};
export function findTokenCandidate(stop: { candidates: readonly { token: string; score: number }[] }, token: string): { token: string; score: number } | null;
export function scoreTokenEntry(stop: { token: string; candidates: readonly { token: string; score: number }[] }, rawEntry: unknown, entryLimit?: number): {
  accepted: boolean;
  entry: string;
  tokenized?: string[];
  firstToken?: string;
  exact?: boolean;
  score?: number;
  status?: string;
  reason: string | null;
};
export function tokenScoreStatus(score: number): "exact" | "ok" | "warn" | "crit";
export function averageTokenScore(submissions: readonly { score: number }[]): number;
export function serializeTokenRun(run: Record<string, unknown>): string;
export function hydrateTokenRun(value: unknown, puzzle: { id: string; responseTokens: readonly string[]; stops: readonly unknown[] }): Record<string, unknown> | null;
