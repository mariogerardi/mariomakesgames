import type { GridlResult, GridlState } from "./engine.mjs";
export function tryStagePlacement(
  state: GridlState,
  tileId: string,
  r: number,
  c: number,
): GridlResult;
export function moveStagedPlacement(
  state: GridlState,
  tileId: string,
  r: number,
  c: number,
): GridlResult;
export function returnStagedToPool(
  state: GridlState,
  r: number,
  c: number,
  pool: "hand" | "reserve",
): GridlResult;
export function tryStageRecall(
  state: GridlState,
  tileId: string,
): GridlResult;
export function cancelStagedRecall(
  state: GridlState,
  tileId: string,
): GridlResult;
export function commitPlayTurn(state: GridlState): GridlResult;
export function rollbackTurn(state: GridlState): void;
