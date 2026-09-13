import type { AnyGameRun, RunQuery, RunRepository } from "./runs.mjs";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type SyncConflict = { local: AnyGameRun; remote: AnyGameRun };
export type SyncState = { status: string; pending: number; conflicts: SyncConflict[]; savedCount: number };
export type RunSync = {
  ownerId: string | null;
  storageKey: string;
  list(query?: RunQuery): AnyGameRun[];
  prepare(gameId: string): Promise<void>;
  stage(run: AnyGameRun): void;
  clearGame(gameId: string): Promise<void>;
  resolve(runId: string, choice: "cloud" | "device"): void;
  refresh(): void;
  flush(): Promise<void>;
  dispose(): void;
};
export function runContent(run: AnyGameRun | null): string;
export function scopedProgressStorage(storage: Store, ownerId: string | null): Store;
export function createRunSync(options: { storage: Store; ownerId: string | null; remote: RunRepository; onChange?: (state: SyncState) => void }): RunSync;
