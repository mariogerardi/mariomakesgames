import { assertGameRun } from "./runs.mjs";

export function scopedProgressStorage(storage, ownerId) {
  const key = (name) => ownerId ? `mg-player:${encodeURIComponent(ownerId)}:${name}` : name;
  return {
    getItem: (name) => storage.getItem(key(name)),
    setItem: (name, value) => storage.setItem(key(name), value),
    removeItem: (name) => storage.removeItem(key(name)),
  };
}

export function runSyncResetKey(ownerId) {
  return `mg-games:run-sync:reset:${ownerId ? encodeURIComponent(ownerId) : "guest"}`;
}

export function runContent(run) {
  if (!run) return "";
  const { syncRevision, updatedAt, ...content } = run;
  void syncRevision; void updatedAt;
  // Clock ticks are useful for local resume but should not create a new cloud
  // revision. Keeping them out of the comparison prevents active Before&After
  // and DECODE sessions from racing another device every few seconds.
  if (content.outcome === "in-progress" && content.gameId === "before-after") {
    const native = content.checkpoint?.state?.native;
    if (native && typeof native === "object") {
      content.checkpoint = { ...content.checkpoint, state: { ...content.checkpoint.state, native: { ...native } } };
      delete content.checkpoint.state.native.activeElapsedMs;
      delete content.checkpoint.state.native.resumedAt;
    }
  }
  if (content.outcome === "in-progress" && content.gameId === "decode") {
    if (content.result && typeof content.result === "object") content.result = { ...content.result };
    if (content.result) delete content.result.elapsedSeconds;
    const native = content.checkpoint?.state?.native;
    if (native?.run && typeof native.run === "object") {
      content.checkpoint = { ...content.checkpoint, state: { ...content.checkpoint.state, native: { ...native, run: { ...native.run } } } };
      delete content.checkpoint.state.native.run.elapsedSeconds;
    }
  }
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

function isDecodeContinuation(earlier, later) {
  if (earlier?.gameId !== "decode" || later?.gameId !== "decode" ||
    earlier.runId !== later.runId || earlier.mode !== "daily-5" || later.mode !== "daily-5" ||
    earlier.startedAt !== later.startedAt || earlier.puzzle?.id !== later.puzzle?.id ||
    earlier.puzzle?.revision !== later.puzzle?.revision ||
    earlier.outcome !== "in-progress" || !["in-progress", "completed"].includes(later.outcome)) return false;
  const earlierRun = earlier.checkpoint?.state?.native?.run;
  const laterRun = later.checkpoint?.state?.native?.run;
  if (!earlierRun || !laterRun || Number(later.score) < Number(earlier.score) ||
    Number(laterRun.dailyIndex) < Number(earlierRun.dailyIndex)) return false;
  return Number(later.score) > Number(earlier.score) || Number(laterRun.dailyIndex) > Number(earlierRun.dailyIndex);
}

/** Account-bound write-ahead journal. No tokens and no cross-account migration. */
export function createRunSync({ storage, ownerId, remote, onChange = () => {} }) {
  const key = `mg-games:run-sync:v1:${ownerId ? encodeURIComponent(ownerId) : "guest"}`;
  const resetKey = runSyncResetKey(ownerId);
  const instanceStartedAt = Date.now();
  const blankJournal = () => ({ runs: {}, pending: {}, rejected: {}, conflicts: {}, recovery: [], changes: {} });
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
    for (const [id, rejection] of Object.entries(parsed.rejected ?? {})) {
      if (next.runs[id] && rejection?.playerId === ownerId) next.rejected[id] = rejection;
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
  const rebasedMissingRuns = new Set();
  let logicalClock = Date.now();
  const instanceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    journal = parseJournal(storage.getItem(key));
  } catch { storageFailed = true; }
  function invalidated() {
    try {
      const resetAt = Number.parseInt(storage.getItem(resetKey) ?? "", 10);
      if (Number.isFinite(resetAt) && resetAt >= instanceStartedAt) {
        // A different tab deleted this account's data. Stop this old tab from
        // re-uploading its in-memory timer/checkpoint state.
        active = false;
        journal = blankJournal();
        return true;
      }
    } catch { /* Storage failures are handled by the normal persistence path. */ }
    return false;
  }
  const ids = (value) => new Set([...Object.keys(value.runs), ...Object.keys(value.pending), ...Object.keys(value.rejected), ...Object.keys(value.conflicts), ...Object.keys(value.changes)]);
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
    for (const field of ["runs", "pending", "rejected", "conflicts"]) {
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
      if (isDecodeContinuation(run, pending.run)) {
        pending.baseRevision = run.syncRevision ?? 0;
        pending.run.syncRevision = run.syncRevision;
        journal.runs[run.runId] = pending.run;
        delete journal.conflicts[run.runId];
        touch(run.runId);
        return;
      }
      if (isDecodeContinuation(pending.run, run)) {
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
      // Any divergent non-append-only snapshot needs an explicit choice,
      // even when both copies happen to carry the same revision. Leaving it
      // pending would resend the stale snapshot on every checkpoint tick.
      journal.conflicts[run.runId] = { local: pending.run, remote: run };
      delete journal.pending[run.runId];
      touch(run.runId);
      return;
    }
    journal.runs[run.runId] = run;
    delete journal.pending[run.runId];
    delete journal.rejected[run.runId];
    delete journal.conflicts[run.runId];
    touch(run.runId);
  }
  async function flush() {
    if (invalidated()) return;
    reconcileStored();
    if (!active || !ownerId || flushing || !Object.keys(journal.pending).length) return;
    flushing = true;
    try {
      for (const id of Object.keys(journal.pending)) {
        if (!active) break;
        if (journal.rejected[id]) continue;
        if (journal.conflicts[id]) continue;
        const pending = journal.pending[id];
        notify("saving");
        try {
          const saved = await remote.save({ ...pending.run, syncRevision: pending.baseRevision });
          // Account deletion can invalidate this queue while the request is
          // in flight. Do not merge or persist the response from that stale
          // request when it returns after the reset marker was written.
          if (!active || invalidated()) break;
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
          if (!active || invalidated()) break;
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
              } else if (isDecodeContinuation(server, journal.pending[id].run)) {
                journal.pending[id].baseRevision = server.syncRevision ?? 0;
                journal.pending[id].run.syncRevision = server.syncRevision;
                journal.runs[id] = journal.pending[id].run;
                delete journal.conflicts[id];
              } else if (isDualContinuation(server, journal.pending[id].run)) {
                journal.pending[id].baseRevision = server.syncRevision ?? 0;
                journal.pending[id].run.syncRevision = server.syncRevision;
                journal.runs[id] = journal.pending[id].run;
                delete journal.conflicts[id];
              } else if (isDualContinuation(journal.pending[id].run, server)) {
                journal.runs[id] = server;
                delete journal.pending[id];
                delete journal.conflicts[id];
              } else {
                journal.conflicts[id] = { local: journal.pending[id].run, remote: server };
                delete journal.pending[id];
              }
              touch(id);
              persist();
              continue;
            }
            // A deleted server record can still race an old conditional PUT.
            // Rebase once so a valid local snapshot can be created again
            // instead of turning the missing record into an endless warning.
            if (!rebasedMissingRuns.has(id) && journal.pending[id]) {
              rebasedMissingRuns.add(id);
              journal.pending[id].baseRevision = 0;
              delete journal.pending[id].run.syncRevision;
              touch(id);
              persist();
              continue;
            }
          }
          if (error.status >= 400 && error.status < 500 && error.status !== 401) {
            const rejectedRun = journal.pending[id]?.run ?? journal.runs[id];
            delete journal.pending[id];
            journal.rejected[id] = {
              playerId: ownerId,
              outcome: rejectedRun?.outcome,
              status: error.status,
              message: error.message ?? "Cloud save rejected",
              savedAt: new Date().toISOString(),
            };
            touch(id);
            persist();
            notify("rejected");
            continue;
          }
          notify(error.status === 401 ? "auth-required" : "offline");
          return;
        }
      }
      notify(Object.keys(journal.conflicts).length ? "conflict" : Object.keys(journal.pending).length ? "pending" : Object.keys(journal.rejected).length ? "rejected" : "saved");
    } catch { notify("offline"); }
    finally { flushing = false; }
  }
  return {
    ownerId,
    storageKey: key,
    list(query = {}) {
      if (!active || invalidated()) return [];
      reconcileStored();
      return Object.values(journal.runs).filter((run) => Object.entries(query).every(([field, value]) => value === undefined || (field === "puzzleId" ? run.puzzle.id : run[field]) === value))
        .sort((a, b) => (b.updatedAt ?? b.startedAt).localeCompare(a.updatedAt ?? a.startedAt));
    },
    async prepare(gameId) {
      if (invalidated()) return;
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
      if (!active || invalidated()) return;
      reconcileStored();
      const previous = journal.runs[candidate.runId];
      // Completed records are final, including when reopened on another device.
      if (previous?.outcome === "completed") return;
      const run = structuredClone({ ...candidate, playerId: ownerId,
        startedAt: previous?.startedAt ?? candidate.startedAt,
        completedAt: previous?.completedAt ?? candidate.completedAt,
      });
      assertGameRun(run);
      const rejection = journal.rejected[run.runId];
      if (rejection && rejection.outcome === run.outcome) {
        journal.runs[run.runId] = run;
        touch(run.runId);
        persist();
        notify("rejected");
        return;
      }
      if (rejection) delete journal.rejected[run.runId];
      if (runContent(previous) === runContent(run)) {
        // Keep the freshest local checkpoint (especially the elapsed clock),
        // but leave it out of the cloud queue unless a meaningful game field
        // changed as well.
        run.updatedAt = new Date().toISOString();
        journal.runs[run.runId] = run;
        if (journal.pending[run.runId]) journal.pending[run.runId].run = run;
        touch(run.runId);
        persist();
        notify(journal.conflicts[run.runId] ? "conflict" : journal.pending[run.runId] ? "pending" : ownerId ? "saved" : "local");
        return;
      }
      run.updatedAt = new Date().toISOString();
      journal.runs[run.runId] = run;
      if (journal.conflicts[run.runId]) {
        // A conflicted run must stay out of the retry queue until the player
        // explicitly chooses a copy. Keep the newest device snapshot visible
        // in the conflict dialog while the clock or UI continues to update.
        journal.conflicts[run.runId].local = run;
      } else if (ownerId) journal.pending[run.runId] = {
        run, baseRevision: journal.pending[run.runId]?.baseRevision ?? previous?.syncRevision ?? 0,
      };
      touch(run.runId);
      persist();
      notify(journal.conflicts[run.runId] ? "conflict" : ownerId ? "pending" : "local");
    },
    async clearGame(gameId) {
      if (!active || invalidated()) return;
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
          delete journal.rejected[id];
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
      if (invalidated()) return;
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
      delete journal.rejected[runId];
      touch(runId);
      persist();
      notify("pending");
    },
    refresh() {
      if (!active || invalidated()) return;
      reconcileStored();
      notify(Object.keys(journal.conflicts).length ? "conflict" : Object.keys(journal.pending).length ? "pending" : Object.keys(journal.rejected).length ? "rejected" : ownerId ? "saved" : "local");
    },
    flush,
    dispose() { active = false; },
  };
}
