import { assertGameRun } from "./runs.mjs";

export function scopedProgressStorage(storage, ownerId) {
  const key = (name) => ownerId ? `mg-player:${encodeURIComponent(ownerId)}:${name}` : name;
  return {
    getItem: (name) => storage.getItem(key(name)),
    setItem: (name, value) => storage.setItem(key(name), value),
    removeItem: (name) => storage.removeItem(key(name)),
  };
}

export function runContent(run) {
  if (!run) return "";
  const { syncRevision, updatedAt, ...content } = run;
  void syncRevision; void updatedAt;
  // DynamoDB does not retain object key order.
  const sort = (value) => Array.isArray(value) ? value.map(sort)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])) : value;
  return JSON.stringify(sort(content));
}

function isPristineDualPuzzleReplacement(local, remote) {
  const isPristine = (run) => run?.outcome === "in-progress" && Number(run.score) === 0 &&
    Array.isArray(run.result?.submissions) && run.result.submissions.length === 0;
  return local?.gameId === "dual" && remote?.gameId === "dual" &&
    local.mode === "daily" && remote.mode === "daily" &&
    Boolean(local.puzzle?.date) && local.puzzle.date === remote.puzzle?.date &&
    (local.puzzle.id !== remote.puzzle.id || local.puzzle.revision !== remote.puzzle.revision) &&
    isPristine(local) && isPristine(remote);
}

function isDualContinuation(earlier, later) {
  if (earlier?.gameId !== "dual" || later?.gameId !== "dual" ||
    earlier.runId !== later.runId || earlier.mode !== later.mode ||
    earlier.startedAt !== later.startedAt || earlier.puzzle?.id !== later.puzzle?.id ||
    earlier.puzzle?.revision !== later.puzzle?.revision) return false;
  const before = earlier.result?.submissions;
  const after = later.result?.submissions;
  if (!Array.isArray(before) || !Array.isArray(after) || before.length > after.length) return false;
  if (Number(later.score) < Number(earlier.score)) return false;
  return before.every((submission, index) => runContent(submission) === runContent(after[index]));
}

/** Account-bound write-ahead journal. No tokens and no cross-account migration. */
export function createRunSync({ storage, ownerId, remote, onChange = () => {} }) {
  const key = `mg-games:run-sync:v1:${ownerId ? encodeURIComponent(ownerId) : "guest"}`;
  const blankJournal = () => ({ runs: {}, pending: {}, conflicts: {}, recovery: [], changes: {} });
  const parseJournal = (raw) => {
    const next = blankJournal();
    const parsed = JSON.parse(raw ?? "null");
    if (parsed?.version !== 1) return next;
    for (const run of Object.values(parsed.runs ?? {})) {
      try { assertGameRun(run); if (run.playerId === ownerId) next.runs[run.runId] = run; } catch { /* Ignore corrupt records. */ }
    }
    for (const [id, pending] of Object.entries(parsed.pending ?? {})) {
      if (next.runs[id] && pending.run?.playerId === ownerId) next.pending[id] = pending;
    }
    next.conflicts = parsed.conflicts ?? {};
    next.recovery = Array.isArray(parsed.recovery) ? parsed.recovery : [];
    for (const [id, stamp] of Object.entries(parsed.changes ?? {})) {
      if (typeof stamp === "string") next.changes[id] = stamp;
    }
    return next;
  };
  let journal = blankJournal();
  let storageFailed = false;
  let status = ownerId ? "saved" : "local";
  let active = true;
  let flushing = false;
  let savedCount = 0;
  let logicalClock = Date.now();
  const instanceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    journal = parseJournal(storage.getItem(key));
  } catch { storageFailed = true; }
  const ids = (value) => new Set([...Object.keys(value.runs), ...Object.keys(value.pending), ...Object.keys(value.conflicts), ...Object.keys(value.changes)]);
  const legacyStamp = (value, id) => {
    const candidates = [value.runs[id], value.pending[id]?.run, value.conflicts[id]?.local, value.conflicts[id]?.remote];
    const time = Math.max(0, ...candidates.map((run) => Date.parse(run?.updatedAt ?? run?.startedAt ?? "") || 0));
    return `${String(time).padStart(16, "0")}:legacy`;
  };
  const recordStamp = (value, id) => value.changes[id] ?? legacyStamp(value, id);
  const observeStamp = (stamp) => { logicalClock = Math.max(logicalClock, Number.parseInt(stamp.slice(0, 16), 10) || 0); };
  const touch = (id) => {
    logicalClock = Math.max(logicalClock + 1, Date.now());
    journal.changes[id] = `${String(logicalClock).padStart(16, "0")}:${instanceId}`;
  };
  const adoptRecord = (source, id) => {
    for (const field of ["runs", "pending", "conflicts"]) {
      if (source[field][id] === undefined) delete journal[field][id];
      else journal[field][id] = source[field][id];
    }
    journal.changes[id] = recordStamp(source, id);
  };
  function reconcileStored() {
    try {
      const stored = parseJournal(storage.getItem(key));
      const allIds = new Set([...ids(journal), ...ids(stored)]);
      for (const id of allIds) {
        const localStamp = recordStamp(journal, id);
        const storedStamp = recordStamp(stored, id);
        observeStamp(localStamp); observeStamp(storedStamp);
        if (storedStamp > localStamp) adoptRecord(stored, id);
        else if (!journal.changes[id]) journal.changes[id] = localStamp;
      }
      const recovery = new Map(journal.recovery.map((item) => [JSON.stringify(item), item]));
      stored.recovery.forEach((item) => recovery.set(JSON.stringify(item), item));
      journal.recovery = [...recovery.values()];
    } catch { storageFailed = true; }
  }
  function notify(next = status) {
    status = next;
    onChange({ status: storageFailed ? "storage-error" : status, pending: Object.keys(journal.pending).length, conflicts: Object.values(journal.conflicts), savedCount });
  }
  function persist(reconcile = true) {
    // Another tab may have written a different run since this instance loaded.
    // Per-run change stamps make the merge preserve that record while allowing
    // an acknowledged pending record to remain deleted.
    if (reconcile) reconcileStored();
    try { storage.setItem(key, JSON.stringify({ version: 1, ...journal })); storageFailed = false; }
    catch { storageFailed = true; }
  }
  function acceptRemote(run) {
    if (run.playerId !== ownerId) throw new Error("Account mismatch in saved progress.");
    const pending = journal.pending[run.runId];
    if (pending && runContent(pending.run) !== runContent(run)) {
      // DUAL progress only appends accepted submissions. If one copy is a
      // strict continuation of the other, it is safe to keep the furthest
      // copy and rebase it instead of interrupting play with a false conflict.
      if (isDualContinuation(run, pending.run)) {
        pending.baseRevision = run.syncRevision ?? 0;
        pending.run.syncRevision = run.syncRevision;
        journal.runs[run.runId] = pending.run;
        delete journal.conflicts[run.runId];
        touch(run.runId);
        return;
      }
      if (isDualContinuation(pending.run, run)) {
        journal.runs[run.runId] = run;
        delete journal.pending[run.runId];
        delete journal.conflicts[run.runId];
        touch(run.runId);
        return;
      }
      // Older DUAL clients keyed authored dailies by date alone. Replacing a
      // same-day draft could therefore look like conflicting progress even
      // when neither puzzle had been played. Preserve the discarded device
      // snapshot for recovery, then let the newly keyed authored run restore.
      if (isPristineDualPuzzleReplacement(pending.run, run)) {
        journal.recovery.push({ savedAt: new Date().toISOString(), run: pending.run });
        journal.runs[run.runId] = run;
        delete journal.pending[run.runId];
        delete journal.conflicts[run.runId];
        touch(run.runId);
        return;
      }
      if ((run.syncRevision ?? 0) !== pending.baseRevision || run.outcome === "completed") {
        journal.conflicts[run.runId] = { local: pending.run, remote: run };
        touch(run.runId);
      }
      return;
    }
    journal.runs[run.runId] = run;
    delete journal.pending[run.runId];
    delete journal.conflicts[run.runId];
    touch(run.runId);
  }
  async function flush() {
    reconcileStored();
    if (!active || !ownerId || flushing || !Object.keys(journal.pending).length) return;
    flushing = true;
    try {
      for (const id of Object.keys(journal.pending)) {
        if (!active) break;
        if (journal.conflicts[id]) continue;
        const pending = journal.pending[id];
        notify("saving");
        try {
          const saved = await remote.save({ ...pending.run, syncRevision: pending.baseRevision });
          if (!active) break;
          reconcileStored();
          savedCount += 1;
          const latest = journal.pending[id];
          if (!latest) continue;
          if (latest && runContent(latest.run) !== runContent(pending.run)) {
            latest.baseRevision = saved.syncRevision ?? 0;
            latest.run.syncRevision = saved.syncRevision;
            journal.runs[id] = latest.run;
          } else {
            journal.runs[id] = saved;
            delete journal.pending[id];
          }
          touch(id);
          persist();
        } catch (error) {
          if (!active) break;
          reconcileStored();
          if (!journal.pending[id]) continue;
          if (error.status === 409) {
            const server = await remote.get(id);
            if (server) {
              // A retry after a lost HTTP response is not a conflict.
              if (runContent(server) === runContent(pending.run)) {
                savedCount += 1;
                const latest = journal.pending[id];
                if (latest && runContent(latest.run) !== runContent(pending.run)) {
                  latest.baseRevision = server.syncRevision ?? 0;
                } else {
                  journal.runs[id] = server;
                  delete journal.pending[id];
                }
              } else if (isDualContinuation(server, journal.pending[id].run)) {
                journal.pending[id].baseRevision = server.syncRevision ?? 0;
                journal.pending[id].run.syncRevision = server.syncRevision;
                journal.runs[id] = journal.pending[id].run;
                delete journal.conflicts[id];
              } else if (isDualContinuation(journal.pending[id].run, server)) {
                journal.runs[id] = server;
                delete journal.pending[id];
                delete journal.conflicts[id];
              } else journal.conflicts[id] = { local: journal.pending[id].run, remote: server };
              touch(id);
              persist();
              continue;
            }
          }
          notify(error.status === 401 ? "auth-required" : error.status >= 400 && error.status < 500 ? "rejected" : "offline");
          return;
        }
      }
      notify(Object.keys(journal.conflicts).length ? "conflict" : Object.keys(journal.pending).length ? "pending" : "saved");
    } catch { notify("offline"); }
    finally { flushing = false; }
  }
  return {
    ownerId,
    storageKey: key,
    list(query = {}) {
      reconcileStored();
      return Object.values(journal.runs).filter((run) => Object.entries(query).every(([field, value]) => value === undefined || (field === "puzzleId" ? run.puzzle.id : run[field]) === value))
        .sort((a, b) => (b.updatedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.startedAt));
    },
    async prepare(gameId) {
      reconcileStored();
      if (ownerId) {
        try {
          const runs = await remote.list({ gameId });
          if (!active) return;
          runs.forEach(acceptRemote);
          persist();
          notify(Object.keys(journal.conflicts).length ? "conflict" : "saved");
        } catch { notify("offline"); }
      } else notify("local");
    },
    stage(candidate) {
      if (!active) return;
      reconcileStored();
      const previous = journal.runs[candidate.runId];
      // Completed records are final, including when reopened on another device.
      if (previous?.outcome === "completed") return;
      const run = structuredClone({ ...candidate, playerId: ownerId,
        startedAt: previous?.startedAt ?? candidate.startedAt,
        completedAt: previous?.completedAt ?? candidate.completedAt,
      });
      assertGameRun(run);
      if (runContent(previous) === runContent(run)) return;
      run.updatedAt = new Date().toISOString();
      journal.runs[run.runId] = run;
      if (ownerId) journal.pending[run.runId] = {
        run, baseRevision: journal.pending[run.runId]?.baseRevision ?? previous?.syncRevision ?? 0,
      };
      if (journal.conflicts[run.runId]) journal.conflicts[run.runId].local = run;
      touch(run.runId);
      persist();
      notify(ownerId ? "pending" : "local");
    },
    async clearGame(gameId) {
      if (!active) return;
      reconcileStored();
      notify(ownerId ? "saving" : "local");
      try {
        if (ownerId) {
          const remoteRuns = await remote.list({ gameId });
          for (const run of remoteRuns) await remote.remove(run.runId);
        }
        reconcileStored();
        const matchingIds = [...ids(journal)].filter((id) => {
          const candidates = [journal.runs[id], journal.pending[id]?.run, journal.conflicts[id]?.local, journal.conflicts[id]?.remote];
          return candidates.some((run) => run?.gameId === gameId);
        });
        for (const id of matchingIds) {
          delete journal.runs[id];
          delete journal.pending[id];
          delete journal.conflicts[id];
          touch(id);
        }
        journal.recovery = journal.recovery.filter((item) => item.run?.gameId !== gameId);
        persist(false);
        notify(ownerId ? "saved" : "local");
      } catch (error) {
        notify(error?.status === 401 ? "auth-required" : error?.status >= 400 && error?.status < 500 ? "rejected" : "offline");
        throw error;
      }
    },
    resolve(runId, choice) {
      reconcileStored();
      const conflict = journal.conflicts[runId];
      if (!conflict) return;
      if (choice === "device" && conflict.remote.outcome === "completed") throw new Error("The completed cloud result is final.");
      journal.recovery.push({ savedAt: new Date().toISOString(), run: choice === "cloud" ? conflict.local : conflict.remote });
      if (choice === "cloud") {
        journal.runs[runId] = conflict.remote;
        delete journal.pending[runId];
      } else {
        journal.pending[runId] = { run: { ...conflict.local, startedAt: conflict.remote.startedAt }, baseRevision: conflict.remote.syncRevision ?? 0 };
        journal.runs[runId] = journal.pending[runId].run;
      }
      delete journal.conflicts[runId];
      touch(runId);
      persist();
      notify("pending");
    },
    refresh() {
      if (!active) return;
      reconcileStored();
      notify(Object.keys(journal.conflicts).length ? "conflict" : Object.keys(journal.pending).length ? "pending" : ownerId ? "saved" : "local");
    },
    flush,
    dispose() { active = false; },
  };
}
