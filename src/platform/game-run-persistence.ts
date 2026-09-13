"use client";

import { useEffect, useMemo } from "react";
import type { AnyGameRun, CloudGameId, RunQuery, RunRepository } from "./runs.mjs";
import { createLocalRunRepository } from "./local-repositories.mjs";
import { createCloudRunRepository } from "./cloud-run-repository";
import { browserAuthClient } from "./auth-client";
import { useGameProgress, useGameRestoration } from "./game-progress-provider";
import { restoreRunCheckpoints } from "./run-checkpoints.mjs";

export async function gameRunRepository(): Promise<RunRepository> {
  const session = await browserAuthClient.getValidSession();
  if (session.kind === "authenticated") return createCloudRunRepository(session.playerId);
  return createLocalRunRepository(window.localStorage);
}

export async function getGameRun(runId: string) {
  return (await gameRunRepository()).get(runId);
}

export async function listGameRuns(query?: RunQuery) {
  return (await gameRunRepository()).list(query);
}

export async function saveGameRun(run: AnyGameRun) {
  const repository = await gameRunRepository();
  if (run.outcome === "completed") {
    const existing = await repository.get(run.runId);
    if (existing?.outcome === "completed") return existing;
  }
  return repository.save(run);
}

export function useGameRunPersistence(run: AnyGameRun | null, enabled = true) {
  const progress = useGameProgress();
  const restoration = useGameRestoration();
  const fingerprint = useMemo(() => run ? JSON.stringify(run) : "", [run]);
  useEffect(() => {
    if (!enabled || !fingerprint || !progress || !restoration.ready) return;
    const candidate = JSON.parse(fingerprint) as AnyGameRun;
    progress.sync.stage(candidate);
    try { restoreRunCheckpoints(progress.storage, progress.sync.list({ gameId: candidate.gameId }).filter((saved) => saved.runId === candidate.runId)); }
    catch { /* The durable journal still contains the native checkpoint. */ }
  }, [enabled, fingerprint, progress, restoration.ready]);
}

export function dailyRunId(gameId: CloudGameId, mode: string, puzzleId: string) {
  return `${gameId}:${mode}:${puzzleId}`;
}

export function sessionRunId(gameId: CloudGameId, mode: string, startedAt: string) {
  return `${gameId}:${mode}:${startedAt}`;
}
