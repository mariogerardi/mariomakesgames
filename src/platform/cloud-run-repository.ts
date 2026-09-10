import type { AnyGameRun, RunQuery, RunRepository } from "./runs.mjs";
import { assertGameRun } from "./runs.mjs";
import { authenticatedApiFetch } from "./authenticated-fetch";

export function createCloudRunRepository(ownerId?: string): RunRepository {
  const request = (path: string, init?: RequestInit) => authenticatedApiFetch(path, init, ownerId);
  return {
    async get(runId) {
      const response = await request(`/v1/runs/${encodeURIComponent(runId)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw await apiError(response);
      return validatedRun(await response.json());
    },
    async list(query = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query) as Array<[keyof RunQuery, string | undefined]>) {
        if (value) params.set(key, value);
      }
      const runs: AnyGameRun[] = [];
      let cursor: string | undefined;
      do {
        if (cursor) params.set("cursor", cursor);
        const response = await request(`/v1/runs${params.size ? `?${params}` : ""}`);
        if (!response.ok) throw await apiError(response);
        const payload = await response.json() as { runs?: AnyGameRun[]; cursor?: string };
        runs.push(...(payload.runs ?? []).map(validatedRun));
        cursor = payload.cursor;
      } while (cursor);
      return runs;
    },
    async save(run) {
      assertGameRun(run);
      const response = await request(`/v1/runs/${encodeURIComponent(run.runId)}`, {
        method: "PUT",
        body: JSON.stringify(run),
      });
      if (!response.ok) throw await apiError(response);
      return validatedRun(await response.json());
    },
    async remove(runId) {
      const response = await request(`/v1/runs/${encodeURIComponent(runId)}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw await apiError(response);
    },
  };
}

function validatedRun(value: unknown): AnyGameRun {
  assertGameRun(value as AnyGameRun);
  return value as AnyGameRun;
}

async function apiError(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return Object.assign(new Error(payload.error || `Run request failed (${response.status}).`), { status: response.status });
}
