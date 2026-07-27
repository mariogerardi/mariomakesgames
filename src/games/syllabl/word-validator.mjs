function normalizeParse(parse) {
  return {
    count: Number(parse.count),
    syllables: Array.isArray(parse.syllables)
      ? [...parse.syllables]
      : [],
  };
}

export function normalizeSyllablWordInfo(payload) {
  return {
    isValid: Boolean(payload?.isValid),
    syllables: Number(payload?.syllables ?? 0),
    syllableList: Array.isArray(payload?.syllableList)
      ? [...payload.syllableList]
      : [],
    syllableParses: Array.isArray(payload?.syllableParses)
      ? payload.syllableParses.map(normalizeParse)
      : [],
    error: typeof payload?.error === "string" ? payload.error : null,
  };
}

export function createSyllablWordValidator({ fetcher, endpoint }) {
  return async function validateWord(word) {
    const response = await fetcher(
      `${endpoint}?word=${encodeURIComponent(word.trim().toLowerCase())}`,
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return normalizeSyllablWordInfo({
        ...payload,
        isValid: false,
        error:
          payload?.error ??
          (response.status >= 500 ? "word-service-unavailable" : null),
      });
    }
    return normalizeSyllablWordInfo(payload);
  };
}
