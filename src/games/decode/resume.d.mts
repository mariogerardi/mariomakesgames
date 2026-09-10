import type { DecodeMode, DecodeState } from "./engine.mjs";
import type { DecodePuzzle } from "./catalog";
export function resumeDecodeCheckpoint(raw: string | null, mode: DecodeMode, date: string, now?: number): {
  run: DecodeState; puzzle: DecodePuzzle; runMeta: { startedAt: string; puzzleId: string };
  zenLength: 4 | 5 | 6 | 7; dailyPuzzles: DecodePuzzle[];
} | null;
