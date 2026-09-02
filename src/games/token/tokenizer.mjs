export const TOKEN_ENTRY_LIMIT = 12;

export function trimTokenEntry(value) {
  return String(value ?? "").trim();
}

export function limitTokenEntry(value, limit = TOKEN_ENTRY_LIMIT) {
  return Array.from(String(value ?? "")).slice(0, limit).join("");
}

export function normalizeTokenValue(value) {
  return trimTokenEntry(value).toLocaleLowerCase();
}

export function tokenizePrototypeEntry(value) {
  return trimTokenEntry(value).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[^\s]/gu) ?? [];
}

export function validateTokenEntry(value, limit = TOKEN_ENTRY_LIMIT) {
  const entry = trimTokenEntry(value);
  if (!entry) return { valid: false, entry, reason: "empty" };
  if (Array.from(entry).length > limit) {
    return { valid: false, entry, reason: "limit" };
  }
  return { valid: true, entry, reason: null };
}
