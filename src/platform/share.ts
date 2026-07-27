import type { GameCompletionSummary } from "./results";

export function formatShareText(summary: GameCompletionSummary): string {
  return [
    `${summary.gameName} — ${summary.headline}`,
    ...summary.detailLines,
    ...(summary.shareGrid ?? []),
  ]
    .filter(Boolean)
    .join("\n");
}
