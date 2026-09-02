import type { DualLexicalEntry } from "./lexicon.mjs";

export type DualBuilderSense = {
  language: "en" | "es";
  lemma: string;
  familyId: string;
  partOfSpeech: string;
  formKind: "lemma" | "inflection";
  status: "accepted" | "review" | "excluded";
  reason: string;
  gloss: string;
  zipf?: number | null;
};

export type DualBuilderEntry = {
  surface: string;
  folded: string;
  senses: DualBuilderSense[];
  policy: {
    accepted: boolean;
    reviewReasons: string[];
    exclusionReasons: string[];
    loanwordStatuses: string[];
  };
  flags: { homograph: boolean; accentCollision: boolean; unfamiliar: boolean };
};

export type DualBuilderAssignment = "default" | "en" | "es" | "both" | "review" | "exclude";
export type DualBuilderDecision = DualBuilderAssignment;
export type DualBuilderOverrides = Record<string, DualBuilderAssignment | { assignment: DualBuilderAssignment }>;
export type DualBuilderFamilyOverrides = Record<string, Partial<Record<"en" | "es", string>>>;

export const DUAL_BUILDER_ASSIGNMENTS: readonly DualBuilderAssignment[];
export const DUAL_FAMILIARITY_INCLUDED_ZIPF: number;
export const DUAL_FAMILIARITY_BORDERLINE_ZIPF: number;
export declare function normalizeDualBuilderAssignment(value: unknown): DualBuilderAssignment;
export declare function dualBuilderLanguageFamiliarity(entry: DualBuilderEntry, language: "en" | "es"): {
  language: "en" | "es"; zipf: number | null; tier: "familiar" | "borderline" | "low" | "missing"; hasAnalysis: boolean;
};
export declare function dualBuilderFamilyAmbiguity(entry: DualBuilderEntry, language: "en" | "es"): string[];
export declare function dualBuilderModernSharedLoanwordLanguages(entry: DualBuilderEntry): Array<"en" | "es">;
export declare function defaultDualBuilderAssignment(entry: DualBuilderEntry): Exclude<DualBuilderAssignment, "default">;
export declare function dualBuilderEntryState(entry: DualBuilderEntry, override?: DualBuilderOverrides[string]): {
  assignment: Exclude<DualBuilderAssignment, "default">;
  sourceAssignment: Exclude<DualBuilderAssignment, "default">;
  languages: Array<"en" | "es">;
  reviewLanguages: Array<"en" | "es">;
  status: "playable" | "review" | "excluded";
  manual: boolean;
};
export declare function effectiveDualBuilderSenses(entry: DualBuilderEntry, decision?: DualBuilderOverrides[string]): DualBuilderSense[];
export declare function buildDualBuilderLexicon(entries: DualBuilderEntry[], overrides?: DualBuilderOverrides, familyOverrides?: DualBuilderFamilyOverrides): DualLexicalEntry[];
export declare function dualBuilderPlayableLanguages(entries: DualBuilderEntry[], overrides?: DualBuilderOverrides, familyOverrides?: DualBuilderFamilyOverrides): Map<string, Array<"en" | "es">>;
export declare function calculateDualBuilderMetrics(entries: DualBuilderEntry[], overrides?: DualBuilderOverrides, familyOverrides?: DualBuilderFamilyOverrides): {
  en: { surfaces: number; families: number; capacity: number; largestFamily: number };
  es: { surfaces: number; families: number; capacity: number; largestFamily: number };
  duals: number;
  totalCapacity: number;
  balance: number;
  suggested: { targetScore: number; minimumEnglish: number; minimumSpanish: number; dualCount: number };
};
export declare function calculateDualBuilderReviewSummary(entries: DualBuilderEntry[], overrides?: DualBuilderOverrides, familyOverrides?: DualBuilderFamilyOverrides): {
  reviewSurfaces: number; homographs: number; accentCollisions: number; unfamiliarLanguageSides: number;
  borderlineLanguageSides: number; missingFrequencyLanguageSides: number; familyConcentration: number;
};
export declare function createDualBuilderPuzzle(
  sequence: string,
  settings: { id?: string; targetScore: number; minimumEnglish: number; minimumSpanish: number },
  entries: DualBuilderEntry[],
  overrides?: DualBuilderOverrides,
  familyOverrides?: DualBuilderFamilyOverrides,
): { id: string; sequence: string; targetScore: number; minimumEnglish: number; minimumSpanish: number; dualCount: number };
export declare function filterDualBuilderEntries(
  entries: DualBuilderEntry[],
  overrides: DualBuilderOverrides,
  criteria?: { text?: string; tab?: "playable" | "review" | "excluded" | "all"; filters?: string[] },
  familyOverrides?: DualBuilderFamilyOverrides,
): DualBuilderEntry[];
export declare function applyDualBuilderBulk(
  overrides: DualBuilderOverrides,
  surfaces: Iterable<string>,
  assignment: DualBuilderAssignment,
): DualBuilderOverrides;
export declare function deduplicateDualBuilderSenses(senses: DualBuilderSense[]): DualBuilderSense[];
export declare function restoreDualBuilderDraft(payload: unknown, expectedSequence?: string): {
  sequence: string;
  overrides: DualBuilderOverrides;
  familyOverrides: Record<string, unknown>;
  settings: { id: string; targetScore: number; minimumEnglish: number; minimumSpanish: number };
};
export declare function dualBuilderWarnings(metrics: {
  reviewSurfaces: number;
  homographs: number;
  accentCollisions: number;
  familyConcentration: number;
  unfamiliarLanguageSides: number;
  borderlineLanguageSides: number;
  missingFrequencyLanguageSides: number;
}): string[];
