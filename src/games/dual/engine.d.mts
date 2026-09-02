import type { DualLanguage, DualLexicon } from "./lexicon.mjs";

export type DualPuzzle = {
  id: string;
  sequence: string;
  targetScore: number;
  minimumEnglish: number;
  minimumSpanish: number;
  dualCount: number;
};

export type DualSubmissionKind = "new-lemma" | "inflection" | "dual";
export type DualSubmission = {
  typed: string;
  surface: string;
  kind: DualSubmissionKind;
  languages: DualLanguage[];
  points: number;
  enPoints: number;
  esPoints: number;
  normalizedByAccent: boolean;
  submittedAt: number;
};

export type DualSession = {
  version: number;
  puzzleId: string;
  dateKey: string;
  submissions: DualSubmission[];
  seenFamilies: string[];
  score: number;
  enScore: number;
  esScore: number;
  solvedAt: number | null;
  allDualsFoundAt: number | null;
  finishedAt: number | null;
  startedAt: number;
};

export type DualProgress = {
  score: number;
  enScore: number;
  esScore: number;
  enFamilies: number;
  esFamilies: number;
  foundDuals: number;
  isSolved: boolean;
  allDualsFound: boolean;
};

export type DualWordProgress = {
  found: number;
  total: number;
  allWordsFound: boolean;
};

export type DualFamilyDiscovery = {
  family: string;
  anchor: DualSubmission;
  forms: DualSubmission[];
  lastIndex: number;
};

export type DualSubmitResult = {
  accepted: boolean;
  reason: string | null;
  state: DualSession;
  submission: DualSubmission | null;
  progress?: DualProgress;
  canonical?: string;
  candidates?: string[];
};

export const DUAL_SESSION_VERSION: number;
export const DUAL_NEW_FAMILY_POINTS: number;
export const DUAL_ADDITIONAL_FORM_POINTS: number;
export function createDualSession(input: { puzzle: DualPuzzle; dateKey: string; startedAt?: number }): DualSession;
export function dualProgress(session: DualSession, puzzle: DualPuzzle): DualProgress;
export function dualWordProgress(session: DualSession, puzzle: DualPuzzle, lexicon: DualLexicon): DualWordProgress;
export function dualFamilyDiscoveries(input: { session: DualSession; lexicon: DualLexicon; language: DualLanguage }): DualFamilyDiscovery[];
export function submitDualWord(input: { session: DualSession; puzzle: DualPuzzle; lexicon: DualLexicon; input: string; now?: number }): DualSubmitResult;
export function finishDualSession(session: DualSession, now?: number): DualSession;
export function serializeDualSession(session: DualSession): Record<string, unknown>;
export function hydrateDualSession(input: { payload: unknown; puzzle: DualPuzzle; lexicon: DualLexicon; dateKey: string }): DualSession;
