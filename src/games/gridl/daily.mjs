/** Stable djb2-style hash preserved from the original Gridl daily picker. */
export function hashGridlDate(text = "") {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return hash >>> 0;
}

/** Pick one repeatable daily board from the supplied authored-level pool. */
export function gridlDailyLevelId(dateKey, levelIds) {
  if (!Array.isArray(levelIds) || levelIds.length === 0) {
    throw new Error("Gridl daily selection requires at least one authored level.");
  }
  return String(levelIds[hashGridlDate(String(dateKey)) % levelIds.length]);
}
