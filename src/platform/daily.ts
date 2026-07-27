import type { GameId } from "../games/types";

export const HUB_DAILY_TIME_ZONE = "America/New_York";

export function dailyPuzzleKey(
  gameId: GameId,
  date = new Date(),
  timeZone = HUB_DAILY_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${gameId}:${part("year")}-${part("month")}-${part("day")}`;
}
