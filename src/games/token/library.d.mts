import type { TokenPuzzle } from "./catalog";

export type TokenLibraryEntry = {
  dailyDate: string | null;
  puzzle: TokenPuzzle;
  savedAt: string;
  schemaVersion: number;
  title: string;
};

export const TOKEN_LIBRARY_SCHEMA_VERSION: number;
export const TOKEN_DAILY_EPOCH: string;
export function isTokenPuzzle(value: unknown): value is TokenPuzzle;
export function tokenDateKey(value?: Date | string): string;
export function selectDailyTokenPuzzle<T extends TokenPuzzle>(puzzles: readonly T[], options: { date?: Date | string; difficulty: "easy" | "hard" }): { dateKey: string; index: number; puzzle: T; total: number } | null;
export function createLocalTokenLibraryEntry(value: { puzzle: TokenPuzzle; title?: string; savedAt?: string; dailyDate?: string | null }): TokenLibraryEntry;
export function parseLocalTokenLibrary(value: unknown): TokenLibraryEntry[];
export function serializeLocalTokenLibrary(entries: readonly TokenLibraryEntry[]): string;
export function upsertLocalTokenLibraryEntry(entries: readonly TokenLibraryEntry[], nextEntry: { puzzle: TokenPuzzle; title?: string; savedAt?: string; dailyDate?: string | null }): TokenLibraryEntry[];
