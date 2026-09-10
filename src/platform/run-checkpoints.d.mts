import type { AnyGameRun } from "./runs.mjs";
import type { DeviceStore } from "./storage";
export function restoreRunCheckpoints(storage: DeviceStore, runs: AnyGameRun[]): void;
export function legacyNativeCheckpoint(run: AnyGameRun): Record<string, unknown> | null;
