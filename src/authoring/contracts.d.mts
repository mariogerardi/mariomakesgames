import type { TokenDraft } from "../games/token/authoring.mjs";
import type { TokenCandidate } from "../games/token/catalog";
import type { DualBuilderFamilyOverrides, DualBuilderOverrides } from "../games/dual/builder.mjs";
import type { DualLexicalEntry } from "../games/dual/lexicon.mjs";

export type AuthorableGameId = "syllabl" | "rarity" | "before-after" | "decode" | "token" | "dual";
export type PuzzleDraftStatus = "draft" | "validated" | "playtested" | "approved";
export type PuzzleSchemaError = { path: string; message: string };
export type PuzzleSchemaResult = { valid: boolean; errors: PuzzleSchemaError[] };

export type SyllablDraftPayload = {
  puzzleLetters: string;
  difficulty: 1 | 2 | 3 | 4 | 5 | null;
  stages: Array<{ placementCode: 1 | 2 | 3 | 4; syllablesRequired: 1 | 2 | 3 | 4 | 5 | 6; proofWord: string }>;
};
export type SyllablPublishedPayload = {
  puzzleLetters: string;
  difficulty: 1 | 2 | 3 | 4 | 5 | null;
  inputsEnabled: Array<1 | 2 | 3 | 4>;
  syllablesRequired: Array<1 | 2 | 3 | 4 | 5 | 6>;
};

export type RarityDraftPayload = { puzzleString: string; difficulty: 0 | 1 | 2 | 3 | 4 | 5 | null; curatorName: string; referenceWords: string[] };
export type RarityPublishedPayload = Omit<RarityDraftPayload, "referenceWords">;

export type BeforeAfterPayload = {
  answer: string;
  clueWords: [string, string];
  position: "before" | "after" | "both";
  difficulty: 1 | 2 | 3 | 4 | 5;
  packId: string;
};

export type DecodeEntryPayload = { answer: string; clueWord: string; clue: string };
export type DecodePayload = {
  authoringType?: "daily-5" | "bank";
  entries?: DecodeEntryPayload[];
  /** Legacy single-entry fields retained for existing drafts and imports. */
  answer?: string;
  clueWord?: string;
  clue?: string;
  theme: string | null;
  modes: Array<"timed" | "daily-5" | "zen">;
};

export type TokenDraftPayload = {
  difficulty: "easy" | "hard";
  summary: string;
  generation: TokenDraft | null;
  selectedStopIds: string[];
};
export type TokenPublishedPayload = {
  difficulty: "easy" | "hard";
  summary: string;
  prompt: string;
  responseTokens: string[];
  stops: Array<{ candidates: TokenCandidate[]; index: number; token: string }>;
  tokenizer: { id: string; note: string };
};

export type DualDraftPayload = {
  sequence: string;
  corpusRevision: string;
  settings: { targetScore: number; minimumEnglish: number; minimumSpanish: number };
  overrides: DualBuilderOverrides;
  familyOverrides: DualBuilderFamilyOverrides;
  lexicon?: DualLexicalEntry[];
};
export type DualPublishedPayload = {
  sequence: string;
  targetScore: number;
  minimumEnglish: number;
  minimumSpanish: number;
  dualCount: number;
  lexicon: DualLexicalEntry[];
};

export type DraftPayloadByGame = {
  syllabl: SyllablDraftPayload;
  rarity: RarityDraftPayload;
  "before-after": BeforeAfterPayload;
  decode: DecodePayload;
  token: TokenDraftPayload;
  dual: DualDraftPayload;
};
export type PublishedPayloadByGame = {
  syllabl: SyllablPublishedPayload;
  rarity: RarityPublishedPayload;
  "before-after": BeforeAfterPayload;
  decode: DecodePayload;
  token: TokenPublishedPayload;
  dual: DualPublishedPayload;
};

type CommonPuzzleDocument<G extends AuthorableGameId> = {
  schemaVersion: 1;
  gameId: G;
  id: string;
  title: string;
  tags: string[];
};

export type PuzzleDraft<G extends AuthorableGameId = AuthorableGameId> = CommonPuzzleDocument<G> & {
  kind: "puzzle-draft";
  status: PuzzleDraftStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  baseRevision: number | null;
  payload: DraftPayloadByGame[G];
};
export type AnyPuzzleDraft = { [G in AuthorableGameId]: PuzzleDraft<G> }[AuthorableGameId];

export type PublishedPuzzle<G extends AuthorableGameId = AuthorableGameId> = CommonPuzzleDocument<G> & {
  kind: "published-puzzle";
  summary: string;
  revision: number;
  publishedAt: string;
  payload: PublishedPayloadByGame[G];
};
export type AnyPublishedPuzzle = { [G in AuthorableGameId]: PublishedPuzzle<G> }[AuthorableGameId];

export type PuzzleReference = { puzzleId: string; revision: number };
export type PuzzleScheduleEntry = {
  gameId: AuthorableGameId;
  mode: string;
  date: string;
  puzzles: PuzzleReference[];
};
export type PuzzleSchedule = {
  kind: "puzzle-schedule";
  schemaVersion: 1;
  timeZone: string;
  entries: PuzzleScheduleEntry[];
};

export const PUZZLE_STUDIO_SCHEMA_VERSION: 1;
export const PUZZLE_STUDIO_TIME_ZONE: "America/New_York";
export const AUTHORABLE_GAME_IDS: readonly AuthorableGameId[];
export const PUZZLE_DRAFT_STATUSES: readonly PuzzleDraftStatus[];
export function createEmptyPuzzlePayload<G extends AuthorableGameId>(gameId: G): DraftPayloadByGame[G];
export function validatePuzzleDraft(document: unknown): PuzzleSchemaResult;
export function validatePublishedPuzzle(document: unknown): PuzzleSchemaResult;
export function validatePuzzleSchedule(document: unknown): PuzzleSchemaResult;
export function assertPuzzleDraft<G extends AuthorableGameId>(document: PuzzleDraft<G>): PuzzleDraft<G>;
export function assertPublishedPuzzle<G extends AuthorableGameId>(document: PublishedPuzzle<G>): PublishedPuzzle<G>;
