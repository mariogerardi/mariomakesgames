import { dailyCatalogOffset } from "../platform/daily-calendar.mjs";

export function catalogRunwayItem(items, date) {
  const offset = dailyCatalogOffset(date);
  return offset >= 0 ? items[offset] ?? null : null;
}
