export type SyllablWordInfo = {
  isValid: boolean;
  syllables: number;
  syllableList: string[];
  syllableParses: Array<{ count: number; syllables: string[] }>;
  error: string | null;
};
export function normalizeSyllablWordInfo(payload: unknown): SyllablWordInfo;
export function createSyllablWordValidator(input: {
  fetcher: typeof fetch;
  endpoint: string;
}): (word: string) => Promise<SyllablWordInfo>;
