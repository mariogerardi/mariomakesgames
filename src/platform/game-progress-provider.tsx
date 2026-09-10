"use client";

import { Fragment, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../app-shell/auth-provider";
import { createCloudRunRepository } from "./cloud-run-repository";
import { createLocalRunRepository } from "./local-repositories.mjs";
import { createRunSync, scopedProgressStorage, type RunSync, type SyncState } from "./run-sync.mjs";
import { restoreRunCheckpoints } from "./run-checkpoints.mjs";
import { CLOUD_GAME_IDS } from "./runs.mjs";
import type { DeviceStore } from "./storage";

type ProgressContext = { sync: RunSync; storage: DeviceStore; generation: number };
const Context = createContext<ProgressContext | null>(null);
const INITIAL: SyncState = { status: "saved", pending: 0, conflicts: [], savedCount: 0 };
const StateContext = createContext<SyncState>(INITIAL);
type Restoration = { ready: boolean; conflict: boolean; revision: ProgressContext | null };
const RestorationContext = createContext<Restoration>({ ready: true, conflict: false, revision: null });

export function GameProgressProvider({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  const owner = session.kind === "authenticated" ? session.playerId : null;
  // Account changes reset progress, not the surrounding navigation and menu tree.
  return <AccountProgress owner={owner} ready={ready}>{children}</AccountProgress>;
}

function AccountProgress({ owner, ready, children }: { owner: string | null; ready: boolean; children: React.ReactNode }) {
  const [state, setState] = useState(INITIAL);
  const [value, setValue] = useState<ProgressContext | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const storage = scopedProgressStorage(window.localStorage, owner);
    const sync = createRunSync({ storage: window.localStorage, ownerId: owner,
      remote: owner ? createCloudRunRepository(owner) : createLocalRunRepository(window.localStorage),
      onChange: (next) => { if (!cancelled) setState(next); } });
    queueMicrotask(() => { if (!cancelled) { setState(INITIAL); setValue({ sync, storage, generation: 0 }); } });
    const flush = () => { void sync.flush(); };
    const refresh = (event: StorageEvent) => { if (event.key === sync.storageKey || event.key === null) sync.refresh(); };
    const timer = window.setInterval(flush, 3000);
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("storage", refresh);
    return () => { cancelled = true; sync.dispose(); window.clearInterval(timer); window.removeEventListener("online", flush); window.removeEventListener("pagehide", flush); window.removeEventListener("storage", refresh); };
  }, [owner, ready]);

  const activeValue = ready && value?.sync.ownerId === owner ? value : null;
  const activeState = activeValue ? state : INITIAL;
  const conflict = activeState.conflicts[0];
  useEffect(() => {
    if (conflict && !dialogRef.current?.open) dialogRef.current?.showModal();
  }, [conflict]);
  function resolve(choice: "cloud" | "device") {
    if (!activeValue || !conflict) return;
    activeValue.sync.resolve(conflict.local.runId, choice);
    setValue({ ...activeValue, generation: activeValue.generation + 1 });
    void activeValue.sync.flush();
  }
  return <Context.Provider value={activeValue}><StateContext.Provider value={activeState}>
    {children}
    <SaveStatus key={owner ?? "guest"} owner={owner} state={activeState} />
    {conflict && <dialog ref={dialogRef} className="game-sync-conflict" aria-labelledby="sync-conflict-title" onCancel={(event) => event.preventDefault()}>
      <h2 id="sync-conflict-title">Choose your progress</h2>
      <p>{conflict.local.gameId.toUpperCase()} · {conflict.local.puzzle.date ?? conflict.local.mode}</p>
      <p>This device and your account have different saves. The other copy will be kept for recovery on this device.</p>
      <p>Device: {conflict.local.score ?? "—"} points · Cloud: {conflict.remote.score ?? "—"} points</p>
      <button autoFocus type="button" onClick={() => resolve("cloud")}>Use cloud save</button>
      {conflict.remote.outcome !== "completed" && <button type="button" onClick={() => resolve("device")}>Keep this device’s save</button>}
    </dialog>}
  </StateContext.Provider></Context.Provider>;
}

export function SaveStatus({ owner, state }: { owner: string | null; state: SyncState }) {
  const warning = useMemo(() => ({ status: state.status }), [state.status]);
  const [settledStatus, setSettledStatus] = useState<typeof warning | null>(null);
  const [dismissedStatus, setDismissedStatus] = useState<string | null>(null);
  const critical = state.status === "storage-error" || state.status === "rejected";
  useEffect(() => {
    // Brief reconnects and routine writes are not player-facing events.
    if (warning.status !== "offline" && warning.status !== "auth-required") return;
    const timer = window.setTimeout(() => setSettledStatus(warning), 8000);
    return () => window.clearTimeout(timer);
  }, [warning]);
  const labels: Record<string, string> = { offline: "Offline · saved on this device", "auth-required": "Saved on this device · sign in to sync", "storage-error": "Device save failed · keep this tab open", rejected: "Cloud save rejected · device copy retained" };
  if ((!owner && state.status !== "storage-error") || !labels[state.status]) return null;
  if (!critical && (settledStatus !== warning || dismissedStatus === state.status)) return null;
  return <aside className="game-save-status" aria-label="Progress sync" role={critical ? "alert" : "status"}>
    <span>{labels[state.status]}</span>
    {!critical && <button type="button" aria-label="Dismiss sync notice" onClick={() => setDismissedStatus(state.status)}>×</button>}
  </aside>;
}

export function GameProgressBoundary({ gameId, eagerShell = false, children }: { gameId: string; eagerShell?: boolean; children: React.ReactNode }) {
  const auth = useAuth();
  const context = useContext(Context);
  const state = useContext(StateContext);
  const [loaded, setLoaded] = useState<{ context: ProgressContext; gameId: string } | null>(null);
  const supported = CLOUD_GAME_IDS.includes(gameId as never);
  useEffect(() => {
    if (!context || !supported) return;
    let cancelled = false;
    void context.sync.prepare(gameId).then(() => {
      if (cancelled) return;
      try { restoreRunCheckpoints(context.storage, context.sync.list({ gameId: gameId as typeof CLOUD_GAME_IDS[number] })); }
      catch { /* Native reads still work if storage is unavailable. */ }
      setLoaded({ context, gameId });
    });
    return () => { cancelled = true; };
  }, [context, gameId, supported]);
  const conflict = state.conflicts.some((item) => item.local.gameId === gameId);
  const ready = Boolean(auth.ready && context && loaded?.context === context && loaded.gameId === gameId && !conflict);
  const restoration = useMemo(() => ({ ready, conflict, revision: context }), [ready, conflict, context]);
  if (!supported) return children;
  // Opt-in only: these games separate their immediately available shell from saved gameplay.
  if (eagerShell) return <RestorationContext.Provider value={restoration}>{children}</RestorationContext.Provider>;
  if (!auth.ready || !context || loaded?.context !== context || loaded.gameId !== gameId) return <div className="game-resume-loading" role="status">Loading your progress…</div>;
  if (state.conflicts.some((item) => item.local.gameId === gameId)) return <div className="game-resume-loading" role="status">Choose which save to continue.</div>;
  // Keep each game's root a direct canvas child so shared flat-shell/theme rules apply.
  return <Fragment key={`${context.sync.ownerId}:${context.generation}`}>{children}</Fragment>;
}

export function useGameProgress() { return useContext(Context); }
export function useGameRestoration() { return useContext(RestorationContext); }
export function useProgressStorage() {
  const context = useContext(Context);
  // Studio playtests don't use the live game boundary; their engine previews remain isolated.
  return useMemo<DeviceStore>(() => context?.storage ?? {
    getItem: (key) => typeof window === "undefined" ? null : window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  }, [context?.storage]);
}
