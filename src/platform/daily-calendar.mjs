const DAY_IN_MILLISECONDS = 86_400_000;

// Temporary shared epoch for the catalog-backed Daily rotations. Moving the
// historical catalogs again should require changing this value only.
export const CURRENT_DAILY_EPOCH = "2026-09-01";

function dateKeyTimestamp(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey));
  if (!match) throw new TypeError(`Invalid Daily date key: ${dateKey}`);
  const [, year, month, day] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) throw new TypeError(`Invalid Daily date key: ${dateKey}`);
  return timestamp;
}

export function dailyDateKey(value = new Date()) {
  if (typeof value === "string") {
    dateKeyTimestamp(value);
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("Daily calendar needs a valid date");
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dailyCatalogOffset(value, epoch = CURRENT_DAILY_EPOCH) {
  return Math.floor(
    (dateKeyTimestamp(dailyDateKey(value)) - dateKeyTimestamp(epoch)) /
      DAY_IN_MILLISECONDS,
  );
}

export function dailyCatalogIndex(value, count, epoch = CURRENT_DAILY_EPOCH) {
  if (!Number.isInteger(count) || count < 1) throw new TypeError("Daily catalog must not be empty");
  const offset = dailyCatalogOffset(value, epoch);
  return ((offset % count) + count) % count;
}

export function catalogDateKey(index, epoch = CURRENT_DAILY_EPOCH) {
  if (!Number.isInteger(index) || index < 0) throw new TypeError("Catalog index must be a non-negative integer");
  const timestamp = dateKeyTimestamp(epoch) + index * DAY_IN_MILLISECONDS;
  return new Date(timestamp).toISOString().slice(0, 10);
}
