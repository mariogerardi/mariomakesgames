export type DualLanguage = "en" | "es";
export type DualFormKind = "lemma" | "inflection";
export type DualLoanwordStatus = "none" | "historical" | "modern" | "uncertain" | "unmarked" | "cross-language" | string;

export type DualLexicalSense = {
  language: DualLanguage;
  lemma: string;
  familyId?: string;
  formKind: DualFormKind;
  partOfSpeech?: string;
};

export type DualLexicalEntry = {
  surface: string;
  senses: DualLexicalSense[];
  familyAssignments?: Partial<Record<DualLanguage, string>>;
  policy: {
    accepted: boolean;
    loanwordStatus: DualLoanwordStatus;
    decision?: string;
  };
  source: {
    kind: "curated-fixture" | "wiktionary" | "kaikki-builder";
    reference?: string;
  };
};

export type DualLexicon = {
  entries: DualLexicalEntry[];
  byExact: Map<string, DualLexicalEntry[]>;
  byFolded: Map<string, DualLexicalEntry[]>;
};

export type DualInputResolution = {
  status: "empty" | "resolved" | "ambiguous" | "unknown";
  entry: DualLexicalEntry | null;
  candidates: DualLexicalEntry[];
  normalizedByAccent?: boolean;
};

export const DUAL_LANGUAGES: readonly DualLanguage[];
export function normalizeDualInput(value: unknown): string;
export function foldDualAccents(value: unknown): string;
export function createDualLexicon(entries: DualLexicalEntry[]): DualLexicon;
export function resolveDualInput(lexicon: DualLexicon, input: unknown): DualInputResolution;
export function canonicalContainsSequence(surface: string, sequence: string): boolean;
export function dualEntryLanguages(entry: DualLexicalEntry): DualLanguage[];
export function isDualEntry(entry: DualLexicalEntry): boolean;
export function dualEntryFamily(entry: DualLexicalEntry, language: DualLanguage): string;
export function dualFamilyKey(sense: DualLexicalSense): string;
export function dualLemmaKey(sense: DualLexicalSense): string;
