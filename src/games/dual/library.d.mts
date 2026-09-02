import type { DualSession } from "./engine.mjs";

export type DualRunLibrary = Record<string, Record<string, unknown>>;
export function parseDualRunLibrary(payload: unknown): DualRunLibrary;
export function upsertDualRun(
  library: DualRunLibrary,
  session: DualSession,
  serialized: Record<string, unknown>,
): DualRunLibrary;
