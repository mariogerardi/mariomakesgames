import type { GridlLevel, GridlState } from "./engine.mjs";
export function initState(level: GridlLevel): GridlState;
export function startLevel(state: GridlState, level: GridlLevel): void;
export function extractRuns(state: GridlState): Array<{
  text: string;
  r: number;
  c: number;
  dir: "H" | "V";
  cells: number;
}>;
export function getPortalOverlayText(
  state: GridlState,
  r: number,
  c: number,
): string;
export function toA1(r: number, c: number): string;
