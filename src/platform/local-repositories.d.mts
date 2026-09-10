import type { PlayerRepository } from "./identity.mjs";
import type { RunRepository } from "./runs.mjs";

export type LocalStore = Pick<Storage, "getItem" | "setItem">;

export const LOCAL_RUNS_STORAGE_KEY: "mg-games:v1:platform:runs";
export function createGuestPlayerRepository(): PlayerRepository;
export function createLocalRunRepository(store: LocalStore, options?: { key?: string }): RunRepository;
