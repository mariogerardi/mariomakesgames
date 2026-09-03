"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PUZZLE_STUDIO_SCHEMA_VERSION,
  createEmptyPuzzlePayload,
  validatePuzzleDraft,
  type AnyPuzzleDraft,
  type AnyPublishedPuzzle,
  type AuthorableGameId,
  type BeforeAfterPayload,
  type DecodePayload,
  type DraftPayloadByGame,
  type RarityDraftPayload,
  type SyllablDraftPayload,
  type PuzzleSchedule,
} from "./contracts.mjs";
import {
  catalogBaselineEntry,
  createDraftFromCatalogItem,
  studioCatalog,
  studioCatalogForDailyMode,
  type StudioCatalogItem,
} from "./catalog";
import { compilePreview, StudioPreview } from "./studio-preview";
import { STUDIO_GAME_BY_ID } from "./studio-games";
import { StudioTopBar } from "./studio-top-bar";
import { decodeAuthoringType, decodePayloadEntries } from "./decode-payload";
import { findDuplicateIssues } from "./duplicate-index";
import { isMeaningfulPuzzleDraft } from "./draft-content.mjs";
import {
  BEFORE_AFTER_ANSWER_LIMIT,
  bridgePhrases,
  validateCustomBridgePuzzle,
  type BridgePosition,
  type BridgePuzzle,
} from "../games/before-after/engine.mjs";
import { BeforeAfterWordmark } from "../games/before-after/before-after-game";
import { DualBuilder } from "../games/dual/dual-builder";
import { TokenBuilder } from "../games/token/token-game";

const GAME_NAMES: Record<AuthorableGameId, string> = {
  syllabl: "Syllabl",
  rarity: "Rarity",
  "before-after": "Before&After",
  decode: "DECODE",
  token: "TOKEN",
  dual: "DUAL",
};
const RECOVERY_PREFIX = "mg-games:v1:puzzle-studio:recovery:";
const LEGACY_BEFORE_AFTER_CUSTOM_KEY = "mg-games:v1:before-after:custom";
const LEGACY_BEFORE_AFTER_IMPORT_KEY = "mg-games:v1:puzzle-studio:before-after-custom-imported";

type DraftListItem = AnyPuzzleDraft & { recoveryOnly?: boolean };
type WorkspaceView = "create" | "library" | "calendar";

type LegacyBeforeAfterPuzzle = Pick<BridgePuzzle, "id" | "answer" | "clueWords" | "position" | "difficulty">;

function recoveryKey(draft: Pick<AnyPuzzleDraft, "gameId" | "id">) {
  return `${RECOVERY_PREFIX}${draft.gameId}:${draft.id}`;
}

function now() {
  return new Date().toISOString();
}

function newDraft(gameId: AuthorableGameId): AnyPuzzleDraft {
  const timestamp = now();
  return {
    kind: "puzzle-draft",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    gameId,
    id: `${gameId}-${timestamp.slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`,
    title: "",
    tags: [],
    status: "draft",
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    baseRevision: null,
    payload: createEmptyPuzzlePayload(gameId),
  } as AnyPuzzleDraft;
}

function loadRecoveryDrafts() {
  const drafts: AnyPuzzleDraft[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(RECOVERY_PREFIX)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as { draft?: unknown } | null;
      const result = validatePuzzleDraft(parsed?.draft);
      if (result.valid) drafts.push(parsed?.draft as AnyPuzzleDraft);
    }
  } catch {
    return [];
  }
  return drafts;
}

function loadLegacyBeforeAfterPuzzles() {
  try {
    if (localStorage.getItem(LEGACY_BEFORE_AFTER_IMPORT_KEY) === "true") return [];
    const parsed = JSON.parse(localStorage.getItem(LEGACY_BEFORE_AFTER_CUSTOM_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((candidate): candidate is LegacyBeforeAfterPuzzle => {
      if (!candidate || typeof candidate !== "object") return false;
      const puzzle = candidate as Partial<LegacyBeforeAfterPuzzle>;
      return typeof puzzle.id === "string"
        && typeof puzzle.answer === "string"
        && Array.isArray(puzzle.clueWords)
        && puzzle.clueWords.length === 2
        && puzzle.clueWords.every((clue) => typeof clue === "string")
        && ["before", "after", "both"].includes(String(puzzle.position));
    });
  } catch {
    return [];
  }
}

function legacyBeforeAfterDraft(puzzle: LegacyBeforeAfterPuzzle, index: number): AnyPuzzleDraft {
  const timestamp = now();
  const sourceId = puzzle.id.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `puzzle-${index + 1}`;
  const id = `before-after-legacy-${sourceId}-${index + 1}`.slice(0, 80).replace(/-+$/g, "");
  const difficulty = Number.isInteger(puzzle.difficulty) && puzzle.difficulty >= 1 && puzzle.difficulty <= 5
    ? puzzle.difficulty as BeforeAfterPayload["difficulty"]
    : 1;
  return {
    kind: "puzzle-draft",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    gameId: "before-after",
    id,
    title: bridgePhrases(puzzle).join(" / ").slice(0, 100),
    tags: ["legacy-custom"],
    status: "draft",
    notes: "Imported from the former player-facing Before&After Custom tool.",
    createdAt: timestamp,
    updatedAt: timestamp,
    baseRevision: null,
    payload: {
      answer: puzzle.answer,
      clueWords: [puzzle.clueWords[0], puzzle.clueWords[1]],
      position: puzzle.position,
      difficulty,
      packId: "legacy-custom",
    },
  };
}

async function studioRequest(body?: Record<string, unknown>, query = "", method = "POST") {
  const response = await fetch(`/api/studio/drafts${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json() as { error?: string; draft?: AnyPuzzleDraft; drafts?: AnyPuzzleDraft[]; removed?: boolean };
  if (!response.ok) throw new Error(payload.error || "Puzzle Studio request failed.");
  return payload;
}

function downloadDraft(draft: AnyPuzzleDraft) {
  downloadJson(`${draft.id}.puzzle-draft.json`, draft);
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function puzzleContentLabel(draft: AnyPuzzleDraft) {
  switch (draft.gameId) {
    case "syllabl": return draft.payload.puzzleLetters.toLocaleUpperCase() || "Empty Syllabl puzzle";
    case "rarity": return draft.payload.puzzleString.toLocaleUpperCase() || "Empty Rarity puzzle";
    case "before-after": return draft.payload.clueWords.filter(Boolean).join(" / ") || "Empty Before&After puzzle";
    case "decode": {
      const entries = decodePayloadEntries(draft.payload);
      return decodeAuthoringType(draft.payload) === "daily-5"
        ? draft.payload.theme?.trim() || `Daily 5 · ${entries.filter((entry) => entry.answer).length}/5 entries`
        : [entries[0]?.clueWord, entries[0]?.answer].filter(Boolean).join(" → ") || "Empty DECODE entry";
    }
    case "token": return draft.payload.generation?.prompt || "Empty TOKEN puzzle";
    case "dual": return draft.payload.sequence.toLocaleUpperCase() || "Empty DUAL puzzle";
  }
}

function clippedLabel(value: string, limit: number) {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

function formatAssignedDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : value;
}

function scheduleReferences(schedule: PuzzleSchedule | null, puzzleId: string) {
  return (schedule?.entries ?? []).flatMap((entry) => entry.puzzles.map((puzzle, slot) => ({ ...entry, puzzle, slot })))
    .filter((entry) => entry.puzzle.puzzleId === puzzleId)
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function PuzzleStudio({ gameId }: { gameId: AuthorableGameId }) {
  const [savedDrafts, setSavedDrafts] = useState<AnyPuzzleDraft[]>([]);
  const [publishedPuzzles, setPublishedPuzzles] = useState<AnyPublishedPuzzle[]>([]);
  const [schedule, setSchedule] = useState<PuzzleSchedule | null>(null);
  const [recoveryDrafts, setRecoveryDrafts] = useState<AnyPuzzleDraft[]>([]);
  const [draft, setDraft] = useState<AnyPuzzleDraft | null>(null);
  const [catalogItem, setCatalogItem] = useState<StudioCatalogItem | null>(null);
  const [libraryView, setLibraryView] = useState<"drafts" | "scheduled" | "catalog">("drafts");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedLibraryItems, setSelectedLibraryItems] = useState<Set<string>>(() => new Set());
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("create");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleMode, setScheduleMode] = useState(STUDIO_GAME_BY_ID[gameId].dailyModes[0]?.id ?? "daily");
  const [scheduleSlot, setScheduleSlot] = useState(0);
  const [authoringMode, setAuthoringMode] = useState<"build" | "test">("build");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [legacyBeforeAfterPuzzles, setLegacyBeforeAfterPuzzles] = useState<LegacyBeforeAfterPuzzle[]>([]);
  const importInput = useRef<HTMLInputElement>(null);

  const list = useMemo<DraftListItem[]>(() => {
    const savedKeys = new Set(savedDrafts.map((item) => `${item.gameId}:${item.id}`));
    return [
      ...savedDrafts,
      ...recoveryDrafts.filter((item) => !savedKeys.has(`${item.gameId}:${item.id}`)).map((item) => ({ ...item, recoveryOnly: true })),
    ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [recoveryDrafts, savedDrafts]);

  const validation = useMemo(() => draft ? validatePuzzleDraft(draft) : null, [draft]);
  const meaningfulDraft = isMeaningfulPuzzleDraft(draft);
  const diskSaved = Boolean(draft && savedDrafts.some((item) => item.gameId === draft.gameId && item.id === draft.id));
  const gameDrafts = useMemo(() => list.filter((item) => item.gameId === gameId && isMeaningfulPuzzleDraft(item)), [gameId, list]);
  const emptyDrafts = useMemo(() => list.filter((item) => item.gameId === gameId
    && !isMeaningfulPuzzleDraft(item)
    && scheduleReferences(schedule, item.id).length === 0), [gameId, list, schedule]);
  const draftCounts = useMemo(() => ({
    drafts: gameDrafts.filter((item) => scheduleReferences(schedule, item.id).length === 0).length,
    scheduled: gameDrafts.filter((item) => scheduleReferences(schedule, item.id).length > 0).length,
  }), [gameDrafts, schedule]);
  const visibleDrafts = useMemo(() => gameDrafts.filter((item) => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    const scheduled = scheduleReferences(schedule, item.id).length > 0;
    return (libraryView === "scheduled" ? scheduled : !scheduled)
      && (!query || `${item.id} ${puzzleContentLabel(item)} ${item.tags.join(" ")}`.toLocaleLowerCase().includes(query));
  }), [gameDrafts, libraryQuery, libraryView, schedule]);
  const visibleCatalog = useMemo(() => studioCatalog.filter((item) => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    return item.gameId === gameId
      && (!query || `${item.id} ${item.title} ${item.summary} ${item.modes.join(" ")}`.toLocaleLowerCase().includes(query));
  }), [gameId, libraryQuery]);
  const visibleLibraryKeys = useMemo(() => libraryView === "catalog"
    ? visibleCatalog.map((item) => `catalog:${item.key}`)
    : visibleDrafts.map((item) => `draft:${item.id}`), [libraryView, visibleCatalog, visibleDrafts]);
  const selectedVisibleKeys = visibleLibraryKeys.filter((key) => selectedLibraryItems.has(key));

  const draftLabels = useMemo(() => {
    const unscheduled = gameDrafts.filter((item) => scheduleReferences(schedule, item.id).length === 0)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return new Map(gameDrafts.map((item) => {
      const assignments = scheduleReferences(schedule, item.id);
      if (assignments.length) {
        const first = assignments[0]!;
        const slot = STUDIO_GAME_BY_ID[gameId].dailyModes.find((mode) => mode.id === first.mode)?.puzzleCount ?? 1;
        const slotLabel = slot > 1 ? ` · Puzzle ${first.slot + 1} of ${slot}` : "";
        const repeats = assignments.length > 1 ? ` · +${assignments.length - 1} more` : "";
        return [item.id, `${formatAssignedDate(first.date)}${slotLabel}${repeats}`];
      }
      return [item.id, `Unscheduled ${unscheduled.findIndex((candidate) => candidate.id === item.id) + 1}`];
    }));
  }, [gameDrafts, gameId, schedule]);

  async function refresh(prefer?: Pick<AnyPuzzleDraft, "gameId" | "id">) {
    const [payload, publishedResponse, scheduleResponse] = await Promise.all([
      studioRequest(undefined, "", "GET"),
      fetch(`/api/studio/published?gameId=${encodeURIComponent(gameId)}`).then((response) => response.json()),
      fetch("/api/studio/schedule").then((response) => response.json()),
    ]);
    const nextSaved = payload.drafts ?? [];
    const nextRecovery = loadRecoveryDrafts();
    setSavedDrafts(nextSaved);
    setRecoveryDrafts(nextRecovery);
    setPublishedPuzzles(publishedResponse.puzzles ?? []);
    setSchedule(scheduleResponse.schedule ?? null);
    if (prefer) {
      const selected = nextSaved.find((item) => item.gameId === prefer.gameId && item.id === prefer.id)
        ?? nextRecovery.find((item) => item.gameId === prefer.gameId && item.id === prefer.id);
      if (selected) {
        setDraft(structuredClone(selected));
        setCatalogItem(null);
        setLibraryView("drafts");
      }
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const query = new URLSearchParams(window.location.search);
      if (query.get("view") === "schedule" || query.get("view") === "calendar") setWorkspaceView("calendar");
      if (query.get("view") === "library") setWorkspaceView("library");
      setScheduleDate(query.get("date") ?? "");
      setLegacyBeforeAfterPuzzles(loadLegacyBeforeAfterPuzzles());
      refresh().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not open Puzzle Studio."))
        .finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
    // The route owns a fixed game ID; reopening data is handled explicitly after writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!draft || !dirty) return;
    if (!isMeaningfulPuzzleDraft(draft)) {
      localStorage.removeItem(recoveryKey(draft));
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(recoveryKey(draft), JSON.stringify({ savedAt: now(), draft }));
        setRecoveryDrafts(loadRecoveryDrafts());
        setMessage("Browser recovery updated. Save to write this draft to disk.");
      } catch {
        setError("Browser recovery is unavailable. Save explicitly to protect this draft.");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [dirty, draft]);

  function edit(next: AnyPuzzleDraft) {
    setDraft({ ...next, updatedAt: now() });
    setDirty(true);
    setMessage("");
    setError("");
  }

  function openWorkspaceView(next: WorkspaceView) {
    if (next !== "create" && draft && !diskSaved && !isMeaningfulPuzzleDraft(draft)) {
      localStorage.removeItem(recoveryKey(draft));
      setDraft(null);
      setDirty(false);
    }
    setWorkspaceView(next);
    const url = new URL(window.location.href);
    if (next !== "create") url.searchParams.set("view", next);
    else {
      url.searchParams.delete("view");
      url.searchParams.delete("date");
    }
    window.history.replaceState(null, "", url);
  }

  function chooseNextOpenDate() {
    if (!schedule) return;
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    for (let offset = 0; offset < 366; offset += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + offset);
      const key = dateKey(candidate);
      const occupied = schedule.entries.some((entry) => entry.gameId === gameId && entry.mode === scheduleMode && entry.date === key)
        || Boolean(catalogBaselineEntry(gameId, scheduleMode, key));
      if (!occupied) { setScheduleDate(key); setMessage(`${formatAssignedDate(key)} is the next open date.`); return; }
    }
    setError("No open date was found in the next year.");
  }

  function selectDraft(next: DraftListItem) {
    if (dirty && draft && !window.confirm("Open another draft? Your current browser recovery will remain available.")) return;
    const recovery = recoveryDrafts.find((item) => item.gameId === next.gameId && item.id === next.id);
    const source = recovery && recovery.updatedAt > next.updatedAt && window.confirm("A newer browser recovery exists. Restore it?") ? recovery : next;
    setDraft(structuredClone(source));
    setCatalogItem(null);
    setDirty(Boolean(next.recoveryOnly || source === recovery));
    setMessage(next.recoveryOnly ? "Recovered from this browser. Save to write it to disk." : "");
    setError("");
    setAuthoringMode("build");
    setWorkspaceView("create");
  }

  function create() {
    const next = newDraft(gameId);
    setDraft(next);
    setCatalogItem(null);
    setLibraryView("drafts");
    setDirty(false);
    setMessage("");
    setError("");
    setAuthoringMode("build");
    setWorkspaceView("create");
  }

  function selectCatalogItem(next: StudioCatalogItem) {
    if (dirty && draft && !window.confirm("Open a catalog puzzle? Your current browser recovery will remain available.")) return;
    setDraft(null);
    setCatalogItem(next);
    setDirty(false);
    setMessage("");
    setError("");
    setAuthoringMode("build");
    setWorkspaceView("create");
  }

  function editCatalogItem() {
    if (!catalogItem) return;
    const next = createDraftFromCatalogItem(catalogItem);
    setDraft(next);
    setCatalogItem(null);
    setLibraryView("drafts");
    setDirty(true);
    setMessage("Editable draft created from the shipped catalog. The original remains unchanged.");
    setError("");
  }

  function duplicateCheck() {
    if (!draft) return false;
    const issues = findDuplicateIssues({ draft, drafts: savedDrafts, catalog: studioCatalog, published: publishedPuzzles, schedule });
    const blocked = issues.find((issue) => issue.severity === "block");
    if (blocked) { setError(blocked.message); return false; }
    const warning = issues.find((issue) => issue.severity === "warn");
    return !warning || window.confirm(`${warning.message}\n\nSave anyway?`);
  }

  async function save(checkDuplicates = true): Promise<AnyPuzzleDraft | null> {
    if (!draft || !isMeaningfulPuzzleDraft(draft) || !validation?.valid) return null;
    if (checkDuplicates && !duplicateCheck()) return null;
    try {
      const payload = await studioRequest({ action: "save", draft });
      localStorage.removeItem(recoveryKey(draft));
      setDirty(false);
      setMessage("Saved to .local/puzzle-studio/drafts.");
      await refresh(payload.draft ?? draft);
      return payload.draft ?? draft;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this draft.");
      return null;
    }
  }

  async function saveAndSchedule() {
    if (!draft || !schedule || !scheduleDate) {
      setError("Choose a date before scheduling this puzzle.");
      return;
    }
    const compiled = compilePreview(draft);
    if (!compiled.preview) {
      setError(compiled.errors.join(" "));
      return;
    }
    if (!duplicateCheck()) return;
    const otherAssignment = scheduleReferences(schedule, draft.id).find((entry) => entry.date !== scheduleDate || entry.mode !== scheduleMode);
    if (otherAssignment) {
      setError(`This puzzle is already scheduled for ${otherAssignment.date}. Move it in Calendar instead of scheduling it twice.`);
      return;
    }
    const mode = STUDIO_GAME_BY_ID[gameId].dailyModes.find((candidate) => candidate.id === scheduleMode);
    if (!mode) {
      setError("Choose a supported Daily mode.");
      return;
    }
    if (draft.gameId === "token" && draft.payload.difficulty !== (scheduleMode === "daily-hard" ? "hard" : "easy")) {
      setError(`This ${draft.payload.difficulty} TOKEN puzzle belongs in the ${draft.payload.difficulty === "hard" ? "Hard" : "Easy"} Daily.`);
      return;
    }
    try {
      const saved = await save(false);
      if (!saved) return;
      const revision = Math.max(0, ...publishedPuzzles.filter((item) => item.id === draft.id).map((item) => item.revision)) + 1;
      const published: AnyPublishedPuzzle = {
        kind: "published-puzzle",
        schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
        gameId,
        id: draft.id,
        title: clippedLabel(puzzleContentLabel(draft), 100),
        tags: [],
        summary: clippedLabel(puzzleContentLabel(draft), 240),
        revision,
        publishedAt: now(),
        payload: compiled.preview.payload,
      } as AnyPublishedPuzzle;
      const publicationResponse = await fetch("/api/studio/published", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", puzzle: published }),
      });
      const publicationPayload = await publicationResponse.json() as { error?: string };
      if (!publicationResponse.ok) throw new Error(publicationPayload.error || "Could not publish this local revision.");

      const otherEntries = schedule.entries.filter((entry) => !(entry.gameId === gameId && entry.mode === scheduleMode && entry.date === scheduleDate));
      const current = schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === scheduleMode && entry.date === scheduleDate);
      const puzzles = [...(current?.puzzles ?? [])];
      if (scheduleSlot > puzzles.length) throw new Error(`Fill puzzle ${puzzles.length + 1} before assigning puzzle ${scheduleSlot + 1}.`);
      puzzles[scheduleSlot] = { puzzleId: draft.id, revision };
      const nextSchedule: PuzzleSchedule = { ...schedule, entries: [...otherEntries, { gameId, mode: scheduleMode, date: scheduleDate, puzzles }] };
      const scheduleResponse = await fetch("/api/studio/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: nextSchedule }),
      });
      const schedulePayload = await scheduleResponse.json() as { error?: string; schedule?: PuzzleSchedule };
      if (!scheduleResponse.ok) throw new Error(schedulePayload.error || "Could not assign this puzzle.");
      setSchedule(schedulePayload.schedule ?? nextSchedule);
      setPublishedPuzzles((currentPuzzles) => [published, ...currentPuzzles]);
      setMessage(`${formatAssignedDate(scheduleDate)} assigned${mode.puzzleCount > 1 ? ` · puzzle ${scheduleSlot + 1} of ${mode.puzzleCount}` : ""}.`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save and schedule this puzzle.");
    }
  }

  async function publishToBanks() {
    if (!draft || draft.gameId !== "decode" || decodeAuthoringType(draft.payload) !== "bank") return;
    const compiled = compilePreview(draft);
    if (!compiled.preview) { setError(compiled.errors.join(" ")); return; }
    if (!duplicateCheck()) return;
    try {
      const saved = await save(false);
      if (!saved) return;
      const revision = Math.max(0, ...publishedPuzzles.filter((item) => item.id === draft.id).map((item) => item.revision)) + 1;
      const published: AnyPublishedPuzzle = {
        kind: "published-puzzle", schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION, gameId: "decode", id: draft.id,
        title: clippedLabel(puzzleContentLabel(draft), 100), tags: [], summary: clippedLabel(puzzleContentLabel(draft), 240),
        revision, publishedAt: now(), payload: compiled.preview.payload,
      } as AnyPublishedPuzzle;
      const response = await fetch("/api/studio/published", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", puzzle: published }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not publish this bank entry.");
      setPublishedPuzzles((current) => [published, ...current]);
      setMessage(`Published to ${draft.payload.modes.filter((mode) => mode !== "daily-5").map((mode) => mode === "timed" ? "Timed" : "Zen").join(" + ")}.`);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish this bank entry."); }
  }

  async function duplicate() {
    if (!draft) return;
    if (dirty && !window.confirm("Duplicate the last disk-saved version? Save this draft first to include current edits.")) return;
    const nextId = window.prompt("ID for the duplicate", `${draft.id}-copy`);
    if (!nextId) return;
    try {
      const payload = await studioRequest({ action: "duplicate", gameId: draft.gameId, id: draft.id, nextId });
      setDirty(false);
      setMessage("Duplicate created as a new draft.");
      await refresh(payload.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not duplicate this draft.");
    }
  }

  async function remove() {
    if (!draft) return;
    if (!diskSaved) {
      localStorage.removeItem(recoveryKey(draft));
      setDraft(null);
      setDirty(false);
      setMessage("Blank canvas discarded.");
      setRecoveryDrafts(loadRecoveryDrafts());
      return;
    }
    if (!window.confirm(`Delete ${draft.id} from disk? A timestamped backup will be retained.`)) return;
    try {
      await studioRequest(undefined, `?gameId=${encodeURIComponent(draft.gameId)}&id=${encodeURIComponent(draft.id)}`, "DELETE");
      localStorage.removeItem(recoveryKey(draft));
      setDraft(null);
      setDirty(false);
      setMessage("Draft removed. A backup remains in .local/puzzle-studio/backups.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove this draft.");
    }
  }

  async function removeEmptyDrafts() {
    if (!emptyDrafts.length || !window.confirm(`Remove ${emptyDrafts.length} empty draft${emptyDrafts.length === 1 ? "" : "s"}? Disk-saved drafts will keep timestamped backups.`)) return;
    try {
      for (const item of emptyDrafts) {
        localStorage.removeItem(recoveryKey(item));
        if (!item.recoveryOnly) await studioRequest(undefined, `?gameId=${encodeURIComponent(item.gameId)}&id=${encodeURIComponent(item.id)}`, "DELETE");
      }
      if (draft && emptyDrafts.some((item) => item.id === draft.id)) {
        setDraft(null);
        setDirty(false);
      }
      setMessage(`${emptyDrafts.length} empty draft${emptyDrafts.length === 1 ? "" : "s"} removed.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the empty drafts.");
    }
  }

  function switchLibraryView(next: "drafts" | "scheduled" | "catalog") {
    setLibraryView(next);
    setSelectedLibraryItems(new Set());
  }

  function toggleLibraryItem(key: string, checked: boolean) {
    setSelectedLibraryItems((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function toggleAllVisible() {
    const allSelected = visibleLibraryKeys.length > 0 && visibleLibraryKeys.every((key) => selectedLibraryItems.has(key));
    setSelectedLibraryItems((current) => {
      const next = new Set(current);
      for (const key of visibleLibraryKeys) {
        if (allSelected) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  function exportSelectedLibraryItems() {
    if (!selectedVisibleKeys.length) return;
    const selectedIds = new Set(selectedVisibleKeys);
    const items = libraryView === "catalog"
      ? visibleCatalog.filter((item) => selectedIds.has(`catalog:${item.key}`))
      : visibleDrafts.filter((item) => selectedIds.has(`draft:${item.id}`));
    downloadJson(`${gameId}-${libraryView}-${dateKey(new Date())}.json`, items);
  }

  async function createSelectedCatalogDrafts() {
    const selectedKeys = new Set(selectedVisibleKeys);
    const items = visibleCatalog.filter((item) => selectedKeys.has(`catalog:${item.key}`));
    if (!items.length) return;
    try {
      for (const item of items) await studioRequest({ action: "import", draft: createDraftFromCatalogItem(item) });
      setSelectedLibraryItems(new Set());
      setMessage(`${items.length} editable draft${items.length === 1 ? "" : "s"} created.`);
      switchLibraryView("drafts");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the selected drafts.");
    }
  }

  async function deleteSelectedDrafts() {
    const selectedIds = new Set(selectedVisibleKeys.map((key) => key.replace(/^draft:/, "")));
    const items = visibleDrafts.filter((item) => selectedIds.has(item.id));
    if (!items.length || !window.confirm(`Delete ${items.length} selected draft${items.length === 1 ? "" : "s"}? Disk copies will keep timestamped backups.`)) return;
    try {
      let nextSchedule = schedule;
      if (schedule) {
        const entries = schedule.entries.map((entry) => ({ ...entry, puzzles: entry.puzzles.filter((puzzle) => !selectedIds.has(puzzle.puzzleId)) }))
          .filter((entry) => entry.puzzles.length > 0);
        if (entries.length !== schedule.entries.length || entries.some((entry, index) => entry.puzzles.length !== schedule.entries[index]?.puzzles.length)) {
          const response = await fetch("/api/studio/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: { ...schedule, entries } }) });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Could not update the schedule.");
          nextSchedule = payload.schedule;
        }
      }
      for (const item of items) {
        localStorage.removeItem(recoveryKey(item));
        if (!item.recoveryOnly) await studioRequest(undefined, `?gameId=${encodeURIComponent(item.gameId)}&id=${encodeURIComponent(item.id)}`, "DELETE");
      }
      if (draft && selectedIds.has(draft.id)) { setDraft(null); setDirty(false); }
      setSchedule(nextSchedule);
      setSelectedLibraryItems(new Set());
      setMessage(`${items.length} draft${items.length === 1 ? "" : "s"} removed.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the selected drafts.");
    }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const candidate = JSON.parse(await file.text()) as unknown;
      const result = validatePuzzleDraft(candidate);
      if (!result.valid) throw new Error(result.errors.map((item) => `${item.path}: ${item.message}`).join("; "));
      if ((candidate as AnyPuzzleDraft).gameId !== gameId) throw new Error(`This is the ${GAME_NAMES[gameId]} workspace. Import that puzzle from its own game workspace.`);
      const payload = await studioRequest({ action: "import", draft: candidate });
      setDirty(false);
      setMessage("Imported and saved to disk.");
      await refresh(payload.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import this file.");
    }
  }

  async function importLegacyBeforeAfter() {
    const validPuzzles = legacyBeforeAfterPuzzles.filter((puzzle) => (
      puzzle.clueWords.every((clue) => clue.length <= 100)
      && validateCustomBridgePuzzle({
        answer: puzzle.answer,
        clueOne: puzzle.clueWords[0],
        clueTwo: puzzle.clueWords[1],
        position: puzzle.position,
      }).valid
    ));
    if (!validPuzzles.length) {
      setError("The old Before&After creations could not be converted into valid Studio drafts.");
      return;
    }
    try {
      const existingIds = new Set(savedDrafts.filter((item) => item.gameId === "before-after").map((item) => item.id));
      let imported = 0;
      for (const [index, puzzle] of validPuzzles.entries()) {
        const next = legacyBeforeAfterDraft(puzzle, index);
        if (existingIds.has(next.id)) continue;
        await studioRequest({ action: "import", draft: next });
        imported += 1;
      }
      localStorage.setItem(LEGACY_BEFORE_AFTER_IMPORT_KEY, "true");
      setLegacyBeforeAfterPuzzles([]);
      setLibraryView("drafts");
      setMessage(imported ? `${imported} Before&After creation${imported === 1 ? "" : "s"} moved into Studio drafts.` : "Those Before&After creations are already in Studio.");
      setError("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not import the old Before&After creations.");
    }
  }

  const currentMode = STUDIO_GAME_BY_ID[gameId].dailyModes.find((mode) => mode.id === scheduleMode) ?? STUDIO_GAME_BY_ID[gameId].dailyModes[0]!;
  const currentLabel = draft ? diskSaved || recoveryDrafts.some((item) => item.id === draft.id)
    ? draftLabels.get(draft.id) ?? "Unscheduled"
    : "New puzzle" : "";

  return (
    <>
      <StudioTopBar currentGameId={gameId} />
      <main className="puzzle-studio" data-studio-game={gameId} style={{ "--studio-game-accent": STUDIO_GAME_BY_ID[gameId].accent, "--studio-game-tint": STUDIO_GAME_BY_ID[gameId].tint } as React.CSSProperties}>
        <header className="studio-workspace-heading">
          <div><span>{STUDIO_GAME_BY_ID[gameId].shortName}</span><div><p>Game workspace</p><h1>{STUDIO_GAME_BY_ID[gameId].name}</h1><small>{STUDIO_GAME_BY_ID[gameId].description}</small></div></div>
          <div className="studio-workspace-tabs" role="tablist" aria-label={`${STUDIO_GAME_BY_ID[gameId].name} workspace`}>
            <button aria-selected={workspaceView === "create"} onClick={() => openWorkspaceView("create")} role="tab" type="button">Create</button>
            <button aria-selected={workspaceView === "library"} onClick={() => openWorkspaceView("library")} role="tab" type="button">Library</button>
            <button aria-selected={workspaceView === "calendar"} onClick={() => openWorkspaceView("calendar")} role="tab" type="button">Calendar</button>
          </div>
        </header>

        {workspaceView === "calendar" ? <StudioSchedule gameId={gameId} initialDate={scheduleDate} /> : workspaceView === "library" ? (
          <section className="studio-library-view" aria-label={`${GAME_NAMES[gameId]} puzzle library`}>
            <header>
              <div><p>Puzzle library</p><h2>{GAME_NAMES[gameId]} puzzles</h2></div>
              <div className="studio-library-actions">
                <button className="studio-control-button" onClick={create} type="button">New puzzle</button>
                <details className="studio-overflow-menu"><summary className="studio-control-button">More</summary><div><button onClick={() => importInput.current?.click()} type="button">Import JSON</button></div></details>
              </div>
            </header>
            <input accept="application/json,.json" hidden onChange={importFile} ref={importInput} type="file" />
            {legacyBeforeAfterPuzzles.length > 0 && <section className="studio-legacy-import"><small>Before&amp;After migration</small><strong>{legacyBeforeAfterPuzzles.length} saved creation{legacyBeforeAfterPuzzles.length === 1 ? "" : "s"} found</strong><button onClick={importLegacyBeforeAfter} type="button">Import into Studio</button></section>}
            {emptyDrafts.length > 0 && <section className="studio-empty-draft-cleanup"><span><strong>{emptyDrafts.length} empty draft{emptyDrafts.length === 1 ? "" : "s"} hidden</strong><small>These were created before blank canvases stopped saving automatically.</small></span><button onClick={removeEmptyDrafts} type="button">Remove empties</button></section>}
            <div className="studio-library-controls">
              <div className="studio-library-tabs" role="tablist" aria-label="Puzzle library source">
                <button aria-selected={libraryView === "drafts"} className={libraryView === "drafts" ? "is-active" : ""} onClick={() => switchLibraryView("drafts")} role="tab" type="button">Drafts <span>{draftCounts.drafts}</span></button>
                <button aria-selected={libraryView === "scheduled"} className={libraryView === "scheduled" ? "is-active" : ""} onClick={() => switchLibraryView("scheduled")} role="tab" type="button">Scheduled <span>{draftCounts.scheduled}</span></button>
                <button aria-selected={libraryView === "catalog"} className={libraryView === "catalog" ? "is-active" : ""} onClick={() => switchLibraryView("catalog")} role="tab" type="button">Shipped <span>{studioCatalog.filter((item) => item.gameId === gameId).length}</span></button>
              </div>
              <input aria-label="Search puzzle library" onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search puzzle content" type="search" value={libraryQuery} />
            </div>
            {visibleLibraryKeys.length > 0 && <div className="studio-bulk-bar">
              <label><input checked={visibleLibraryKeys.every((key) => selectedLibraryItems.has(key))} onChange={toggleAllVisible} type="checkbox" /> Select all</label>
              <span>{selectedVisibleKeys.length ? `${selectedVisibleKeys.length} selected` : "Select puzzles for bulk actions"}</span>
              <div><button disabled={!selectedVisibleKeys.length} onClick={exportSelectedLibraryItems} type="button">Export</button>{libraryView === "catalog" ? <button disabled={!selectedVisibleKeys.length} onClick={createSelectedCatalogDrafts} type="button">Create drafts</button> : <button className="is-danger" disabled={!selectedVisibleKeys.length} onClick={deleteSelectedDrafts} type="button">Delete</button>}</div>
            </div>}
            <div className="studio-library-grid">
              {libraryView !== "catalog" ? (loading ? <p>Loading puzzles…</p> : visibleDrafts.length ? visibleDrafts.map((item) => (
                <article className={`${draft?.id === item.id ? "is-active " : ""}${selectedLibraryItems.has(`draft:${item.id}`) ? "is-selected" : ""}`} key={item.id}>
                  <label><input aria-label={`Select ${draftLabels.get(item.id) ?? item.id}`} checked={selectedLibraryItems.has(`draft:${item.id}`)} onChange={(event) => toggleLibraryItem(`draft:${item.id}`, event.target.checked)} type="checkbox" /></label>
                  <button onClick={() => selectDraft(item)} type="button"><small>{item.recoveryOnly ? "Browser recovery" : scheduleReferences(schedule, item.id).length ? "Scheduled" : "Unscheduled"}</small><strong>{draftLabels.get(item.id) ?? "Unscheduled"}</strong><span>{puzzleContentLabel(item)}</span></button>
                </article>
              )) : <p>{libraryQuery ? "No matching puzzles." : libraryView === "scheduled" ? "Nothing scheduled yet." : "No working drafts yet."}</p>) : visibleCatalog.length ? visibleCatalog.map((item) => (
                <article className={`${catalogItem?.key === item.key ? "is-active " : ""}${selectedLibraryItems.has(`catalog:${item.key}`) ? "is-selected" : ""}`} key={item.key}>
                  <label><input aria-label={`Select ${item.title}`} checked={selectedLibraryItems.has(`catalog:${item.key}`)} onChange={(event) => toggleLibraryItem(`catalog:${item.key}`, event.target.checked)} type="checkbox" /></label>
                  <button onClick={() => selectCatalogItem(item)} type="button"><small>Shipped · {item.modes.join(" · ")}</small><strong>{item.title}</strong><span>{item.summary}</span></button>
                </article>
              )) : <p>No matching catalog puzzles.</p>}
            </div>
          </section>
        ) : (
          <section className="studio-create-view">
            {catalogItem ? <CatalogPuzzle item={catalogItem} onEdit={editCatalogItem} /> : !draft ? <StudioWelcome onCreate={create} /> : (
              <>
                <header className="studio-editor-commandbar">
                  <div className="studio-editor-identity"><small>{scheduleReferences(schedule, draft.id).length ? "Scheduled" : diskSaved ? "Draft" : "New puzzle"}</small><strong>{currentLabel}</strong><span>{dirty ? "Unsaved changes" : diskSaved ? "Saved locally" : "Start typing to create a recoverable draft"}</span></div>
                  <div className="studio-editor-actions">
                    <button className="studio-control-button" disabled={!meaningfulDraft || !validation?.valid} onClick={() => void save()} type="button">Save draft</button>
                    {draft.gameId === "decode" && decodeAuthoringType(draft.payload) === "bank" ? <button className="studio-control-button" disabled={!meaningfulDraft || !validation?.valid} onClick={publishToBanks} type="button">Publish to banks</button> : <details className="studio-schedule-menu"><summary className="studio-control-button">Schedule</summary><div>
                      <label>Date<input onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} /></label>
                      <button className="is-secondary" onClick={chooseNextOpenDate} type="button">Use next open date</button>
                      {STUDIO_GAME_BY_ID[gameId].dailyModes.length > 1 && <label>Daily mode<select onChange={(event) => { setScheduleMode(event.target.value); setScheduleSlot(0); }} value={scheduleMode}>{STUDIO_GAME_BY_ID[gameId].dailyModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}</select></label>}
                      {currentMode.puzzleCount > 1 && <label>Position<select onChange={(event) => setScheduleSlot(Number(event.target.value))} value={scheduleSlot}>{Array.from({ length: currentMode.puzzleCount }, (_, index) => <option key={index} value={index}>Puzzle {index + 1} of {currentMode.puzzleCount}</option>)}</select></label>}
                      <button disabled={!scheduleDate || !meaningfulDraft || !validation?.valid} onClick={saveAndSchedule} type="button">Save &amp; schedule</button>
                    </div></details>}
                    <details className="studio-overflow-menu"><summary aria-label="More puzzle actions" className="studio-control-button">More</summary><div><button disabled={!diskSaved || dirty} onClick={duplicate} type="button">Duplicate</button><button onClick={() => downloadDraft(draft)} type="button">Export JSON</button><button className="is-danger" onClick={remove} type="button">{diskSaved ? "Delete draft" : "Discard canvas"}</button></div></details>
                  </div>
                </header>
                <section className={`studio-native-creator is-${gameId}`} data-authoring-mode={authoringMode}>
                  <div className="studio-creator-modebar"><div className="studio-authoring-toggle" role="group" aria-label="Creator mode"><button aria-pressed={authoringMode === "build"} onClick={() => setAuthoringMode("build")} type="button">Build</button><button aria-pressed={authoringMode === "test"} onClick={() => setAuthoringMode("test")} type="button">Test puzzle</button></div></div>
                  {authoringMode === "build" ? <GameEditor draft={draft} key={`${draft.gameId}:${draft.id}`} onPayload={(payload) => edit({ ...draft, payload } as AnyPuzzleDraft)} /> : <StudioPreview document={draft} />}
                </section>

                <details className="studio-puzzle-details">
                  <summary><span>Notes and file details</span><small>Optional author notes and internal record</small></summary>
                  <section className="studio-common-fields"><label className="is-wide">Private notes<textarea maxLength={10000} onChange={(event) => edit({ ...draft, notes: event.target.value } as AnyPuzzleDraft)} value={draft.notes} /></label><p className="studio-record-line is-wide"><span>ID: {draft.id}</span><span>Revisions: {publishedPuzzles.filter((item) => item.id === draft.id).length}</span></p></section>
                </details>
                <footer className="studio-status" aria-live="polite">{error ? <p className="is-error">{error}</p> : message ? <p>{message}</p> : null}{validation && !validation.valid && isMeaningfulPuzzleDraft(draft) ? <details><summary>{validation.errors.length} issue{validation.errors.length === 1 ? "" : "s"} to fix before saving</summary><ul>{validation.errors.map((item, index) => <li key={`${item.path}:${index}`}><code>{item.path}</code> {item.message}</li>)}</ul></details> : null}</footer>
              </>
            )}
          </section>
        )}
      </main>
    </>
  );
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function calendarDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { key: dateKey(date), date, inMonth: date.getMonth() === first.getMonth() };
  });
}

function monthKeyFor(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function StudioSchedule({ gameId, initialDate }: { gameId: AuthorableGameId; initialDate: string }) {
  const [schedule, setSchedule] = useState<PuzzleSchedule | null>(null);
  const [publishedPuzzles, setPublishedPuzzles] = useState<AnyPublishedPuzzle[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const game = STUDIO_GAME_BY_ID[gameId];
  const days = monthKey ? calendarDays(monthKey) : [];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const today = new Date();
      const requested = /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? new Date(`${initialDate}T12:00:00`) : today;
      const start = Number.isFinite(requested.getTime()) ? requested : today;
      setMonthKey(monthKeyFor(start));
      setSelectedDate(dateKey(start));
      Promise.all([
        fetch("/api/studio/schedule").then((response) => response.json()),
        fetch(`/api/studio/published?gameId=${encodeURIComponent(gameId)}`).then((response) => response.json()),
      ]).then(([schedulePayload, publishedPayload]) => {
        setSchedule(schedulePayload.schedule);
        setPublishedPuzzles(publishedPayload.puzzles ?? []);
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load the schedule."));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gameId, initialDate]);

  function compatibleOptions(mode: string) {
    const catalog = studioCatalogForDailyMode(gameId, mode)
      .map((item) => ({ id: item.id, key: item.key, label: item.title, revision: 1 }));
    const latestById = new Map<string, AnyPublishedPuzzle>();
    for (const item of publishedPuzzles) {
      if ((latestById.get(item.id)?.revision ?? 0) < item.revision) latestById.set(item.id, item);
    }
    const authored = [...latestById.values()].filter((item) => {
      if (item.gameId !== gameId) return false;
      if (item.gameId === "token") return item.payload.difficulty === (mode === "daily-hard" ? "hard" : "easy");
      if (item.gameId === "decode") return item.payload.modes.includes("daily-5");
      return true;
    }).map((item) => ({ id: item.id, key: `${item.gameId}:${item.id}:${item.revision}`, label: item.title, revision: item.revision }));
    return [...authored, ...catalog];
  }

  async function assign(date: string, mode: string, slot: number, puzzleValue: string) {
    if (!schedule) return;
    const otherEntries = schedule.entries.filter((entry) => !(entry.gameId === gameId && entry.mode === mode && entry.date === date));
    const current = schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === date);
    const puzzles = [...(current?.puzzles ?? [])];
    const [puzzleId, revisionValue] = puzzleValue.split("@");
    const existingDate = puzzleId ? schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date !== date && entry.puzzles.some((reference) => reference.puzzleId === puzzleId))?.date : null;
    if (existingDate) { setError(`That puzzle is already scheduled for ${existingDate}. Move or swap it instead.`); return; }
    if (puzzleId) puzzles[slot] = { puzzleId, revision: Number(revisionValue) || 1 };
    else puzzles.splice(slot);
    const next: PuzzleSchedule = { ...schedule, entries: puzzles.length ? [...otherEntries, { gameId, mode, date, puzzles }] : otherEntries };
    try {
      const response = await fetch("/api/studio/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: next }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the schedule.");
      setSchedule(payload.schedule);
      setMessage(`${game.name} · ${date} saved.`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the schedule.");
    }
  }

  async function writeSchedule(next: PuzzleSchedule, success: string) {
    try {
      const response = await fetch("/api/studio/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schedule: next }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save the schedule.");
      setSchedule(payload.schedule);
      setMessage(success);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the schedule."); }
  }

  function moveOrSwap(date: string, mode: string, offset: -1 | 1) {
    if (!schedule) return;
    const targetDay = new Date(`${date}T12:00:00`);
    targetDay.setDate(targetDay.getDate() + offset);
    const targetDate = dateKey(targetDay);
    const source = schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === date);
    if (!source) return;
    const targetEntry = schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === targetDate);
    const remaining = schedule.entries.filter((entry) => !(entry.gameId === gameId && entry.mode === mode && (entry.date === date || entry.date === targetDate)));
    const moved = { ...source, date: targetDate };
    const swapped = targetEntry ? { ...targetEntry, date } : null;
    void writeSchedule({ ...schedule, entries: [...remaining, moved, ...(swapped ? [swapped] : [])] }, targetEntry ? `${date} and ${targetDate} swapped.` : `Moved to ${targetDate}.`);
  }

  function unschedule(date: string, mode: string) {
    if (!schedule) return;
    const entries = schedule.entries.filter((entry) => !(entry.gameId === gameId && entry.mode === mode && entry.date === date));
    void writeSchedule({ ...schedule, entries }, `${date} cleared.`);
  }

  function moveToNextOpen(date: string, mode: string) {
    if (!schedule) return;
    const source = schedule.entries.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === date);
    const start = new Date(`${date}T12:00:00`);
    let target: { key: string } | null = null;
    for (let offset = 1; offset <= 366; offset += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + offset);
      const key = dateKey(candidate);
      const occupied = schedule.entries.some((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === key)
        || Boolean(catalogBaselineEntry(gameId, mode, key));
      if (!occupied) { target = { key }; break; }
    }
    if (!source || !target) { setError("No later open date was found in the next year."); return; }
    const entries = schedule.entries.filter((entry) => entry !== source);
    void writeSchedule({ ...schedule, entries: [...entries, { ...source, date: target.key }] }, `Moved to next open date: ${target.key}.`);
  }

  function changeMonth(offset: -1 | 1) {
    const [year, month] = monthKey.split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1, 12);
    setMonthKey(monthKeyFor(next));
    setSelectedDate(dateKey(next));
  }

  const selectedDay = selectedDate ? new Date(`${selectedDate}T12:00:00`) : null;

  return (
    <section className="studio-schedule-shell">
      <header className="studio-schedule-heading">
        <div><p>Daily schedule</p><h2>{monthKey ? new Date(`${monthKey}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Calendar"}</h2></div>
        <div className="studio-calendar-nav"><button aria-label="Previous month" disabled={!monthKey} onClick={() => changeMonth(-1)} type="button">←</button><button onClick={() => { const today = new Date(); setMonthKey(monthKeyFor(today)); setSelectedDate(dateKey(today)); }} type="button">Today</button><button aria-label="Next month" disabled={!monthKey} onClick={() => changeMonth(1)} type="button">→</button></div>
      </header>
      {error && <p className="studio-schedule-message is-error">{error}</p>}
      {message && !error && <p className="studio-schedule-message">{message}</p>}
      <div className="studio-calendar" role="grid">
        <div className="studio-calendar-weekdays" role="row">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} role="columnheader">{day}</span>)}</div>
        <div className="studio-calendar-grid">
          {days.map(({ key, date, inMonth }) => {
            const modesReady = game.dailyModes.filter((mode) => {
              const entry = schedule?.entries.find((candidate) => candidate.gameId === gameId && candidate.mode === mode.id && candidate.date === key)
                ?? catalogBaselineEntry(gameId, mode.id, key);
              return Boolean(entry && entry.puzzles.length >= mode.puzzleCount);
            }).length;
            const complete = modesReady === game.dailyModes.length;
            const today = key === dateKey(new Date());
            return <button aria-label={`${date.toLocaleDateString()}: ${complete ? "ready" : `${modesReady} of ${game.dailyModes.length} modes ready`}`} aria-selected={selectedDate === key} className={`${inMonth ? "" : "is-outside "}${complete ? "is-ready " : "is-open "}${today ? "is-today " : ""}`} key={key} onClick={() => setSelectedDate(key)} role="gridcell" type="button"><time dateTime={key}>{date.getDate()}</time><span>{complete ? "Ready" : game.dailyModes.length > 1 ? `${modesReady}/${game.dailyModes.length} ready` : "Needs puzzle"}</span><i aria-hidden="true">{game.dailyModes.map((mode) => { const entry = schedule?.entries.find((candidate) => candidate.gameId === gameId && candidate.mode === mode.id && candidate.date === key) ?? catalogBaselineEntry(gameId, mode.id, key); return <b className={entry && entry.puzzles.length >= mode.puzzleCount ? "is-filled" : ""} key={mode.id} />; })}</i></button>;
          })}
        </div>
      </div>
      {selectedDate && <section className="studio-calendar-day-panel">
        <header><div><small>{selectedDay?.toLocaleDateString(undefined, { weekday: "long" })}</small><h3>{selectedDay?.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</h3></div><span>Assign or adjust this day.</span></header>
        <div className="studio-schedule-modes">
          {game.dailyModes.map((mode) => {
            const scheduledEntry = schedule?.entries.find((candidate) => candidate.gameId === gameId && candidate.mode === mode.id && candidate.date === selectedDate);
            const entry = scheduledEntry ?? catalogBaselineEntry(gameId, mode.id, selectedDate);
            const options = compatibleOptions(mode.id);
            return <section key={mode.id}><header><strong>{mode.label}</strong><small>{entry ? scheduledEntry ? "Studio scheduled" : "Catalog baseline" : "Needs new puzzle"}</small>{scheduledEntry && <span className="studio-calendar-actions"><button onClick={() => moveOrSwap(selectedDate, mode.id, -1)} title="Move or swap one day earlier" type="button">←</button><button onClick={() => moveOrSwap(selectedDate, mode.id, 1)} title="Move or swap one day later" type="button">→</button><button onClick={() => moveToNextOpen(selectedDate, mode.id)} type="button">Next open</button><button onClick={() => unschedule(selectedDate, mode.id)} type="button">Clear</button></span>}</header><div>{Array.from({ length: mode.puzzleCount }, (_, slot) => <label key={slot}><span>{mode.puzzleCount > 1 ? `Puzzle ${slot + 1}` : "Puzzle"}</span><select disabled={!schedule || (slot > 0 && !entry?.puzzles[slot - 1])} onChange={(event) => assign(selectedDate, mode.id, slot, event.target.value)} value={entry?.puzzles[slot] ? `${entry.puzzles[slot].puzzleId}@${entry.puzzles[slot].revision}` : ""}><option value="">Needs new puzzle</option>{options.map((item) => <option disabled={entry?.puzzles.some((reference, index) => index !== slot && reference.puzzleId === item.id)} key={item.key} value={`${item.id}@${item.revision}`}>{item.label}</option>)}</select></label>)}</div></section>;
          })}
        </div>
      </section>}
    </section>
  );
}

function StudioWelcome({ onCreate }: { onCreate: () => void }) {
  return <div className="studio-welcome"><p>New puzzle</p><h2>Start when you’re ready.</h2><span>Your blank canvas stays temporary until you add puzzle content.</span><button onClick={onCreate} type="button">Create puzzle</button></div>;
}

function CatalogPuzzle({ item, onEdit }: { item: StudioCatalogItem; onEdit: () => void }) {
  return <>
    <header className="studio-document-bar studio-catalog-bar">
      <div><small>{GAME_NAMES[item.gameId]} · shipped catalog</small><strong>{item.title}</strong><span>{item.id} · {item.source}</span></div>
      <div className="studio-actions"><button onClick={onEdit} type="button">Create editable draft</button></div>
    </header>
    <section className="studio-catalog-summary">
      <div><small>Modes and collections</small><p>{item.modes.join(" · ")}</p></div>
      <div><small>Summary</small><p>{item.summary}</p></div>
      <details><summary>Published payload</summary><pre>{JSON.stringify(item.payload, null, 2)}</pre></details>
    </section>
    <StudioPreview document={item} />
  </>;
}

function GameEditor({ draft, onPayload }: { draft: AnyPuzzleDraft; onPayload: (payload: DraftPayloadByGame[AuthorableGameId]) => void }) {
  switch (draft.gameId) {
    case "syllabl": return <SyllablEditor payload={draft.payload} onChange={onPayload} />;
    case "rarity": return <RarityEditor payload={draft.payload} onChange={onPayload} />;
    case "before-after": return <BeforeAfterEditor payload={draft.payload} onChange={onPayload} />;
    case "decode": return <DecodeEditor payload={draft.payload} onChange={onPayload} />;
    case "token": return <TokenBuilder onStudioPayload={onPayload} />;
    case "dual": return <DualBuilder onStudioPayload={onPayload} />;
  }
}

function EditorSection({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <section className="studio-game-editor"><header><p>Puzzle builder</p><h2>{title}</h2><span>{intro}</span></header><div className="studio-field-grid">{children}</div></section>;
}

function SyllablEditor({ payload, onChange }: { payload: SyllablDraftPayload; onChange: (payload: SyllablDraftPayload) => void }) {
  function stage(index: number, next: Partial<SyllablDraftPayload["stages"][number]>) {
    onChange({ ...payload, stages: payload.stages.map((value, current) => current === index ? { ...value, ...next } : value) });
  }
  return <EditorSection title="Build a Syllabl run" intro="The six-stage structure and proof-word workflow come from the original Syllabl creator.">
    <label className="studio-primary-field is-wide">Puzzle string<input maxLength={3} onChange={(event) => onChange({ ...payload, puzzleLetters: event.target.value.toLocaleLowerCase().replace(/[^a-z]/g, "") })} placeholder="PRO" value={payload.puzzleLetters.toLocaleUpperCase()} /></label>
    <div className="studio-stage-list is-wide">{payload.stages.map((value, index) => <div className="studio-stage" key={index}><strong>Level {index + 1}</strong><label>Placement<select onChange={(event) => stage(index, { placementCode: Number(event.target.value) as 1|2|3|4 })} value={value.placementCode}><option value="1">Ends with</option><option value="2">Begins with</option><option value="3">Fully contains</option><option value="4">Begins and ends with</option></select></label><label>Syllables<select onChange={(event) => stage(index, { syllablesRequired: Number(event.target.value) as 1|2|3|4|5|6 })} value={value.syllablesRequired}>{[1,2,3,4,5,6].map((count) => <option key={count}>{count}</option>)}</select></label><label>Proof word<input onChange={(event) => stage(index, { proofWord: event.target.value })} placeholder="Example answer for this level" value={value.proofWord} /></label></div>)}</div>
    <details className="studio-editor-options is-wide"><summary>Optional difficulty</summary><label>Difficulty<select onChange={(event) => onChange({ ...payload, difficulty: event.target.value ? Number(event.target.value) as SyllablDraftPayload["difficulty"] : null })} value={payload.difficulty ?? ""}><option value="">Unrated</option>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label></details>
  </EditorSection>;
}

function RarityEditor({ payload, onChange }: { payload: RarityDraftPayload; onChange: (payload: RarityDraftPayload) => void }) {
  return <EditorSection title="Choose the string" intro="That’s the puzzle. Add private reference words only if they help you evaluate it later.">
    <label className="studio-primary-field is-wide">Three-letter string<input maxLength={3} onChange={(event) => onChange({ ...payload, puzzleString: event.target.value.toLocaleLowerCase().replace(/[^a-z]/g, "") })} placeholder="WEL" value={payload.puzzleString.toLocaleUpperCase()} /></label>
    <details className="studio-editor-options is-wide"><summary>Reference words <span>optional</span></summary><label>Author notes for possible solves<textarea onChange={(event) => onChange({ ...payload, referenceWords: event.target.value.split(/[,\n]/).map((word) => word.trim()).filter(Boolean) })} placeholder="One per line" value={payload.referenceWords.join("\n")} /></label></details>
  </EditorSection>;
}

function BeforeAfterEditor({ payload, onChange }: { payload: BeforeAfterPayload; onChange: (payload: BeforeAfterPayload) => void }) {
  const validation = validateCustomBridgePuzzle({
    answer: payload.answer,
    clueOne: payload.clueWords[0],
    clueTwo: payload.clueWords[1],
    position: payload.position as BridgePosition,
  });
  const validationMessages: Record<string, string> = {
    "answer-required": "Add the bridge answer.",
    "answer-too-long": `Keep the answer to ${BEFORE_AFTER_ANSWER_LIMIT} characters.`,
    "two-clues-required": "Add two clue words.",
    "clues-unique": "Use two different clues.",
    "position-invalid": "Choose a bridge direction.",
  };
  const answerField = (key: string) => <input aria-label="Bridge answer" className="studio-ba-answer" key={key} maxLength={BEFORE_AFTER_ANSWER_LIMIT} onChange={(event) => onChange({ ...payload, answer: event.target.value })} placeholder="answer" value={payload.answer} />;
  const clueField = (index: 0 | 1) => <input aria-label={`${index === 0 ? "First" : "Second"} clue`} className="studio-ba-clue" maxLength={100} onChange={(event) => onChange({ ...payload, clueWords: index === 0 ? [event.target.value, payload.clueWords[1]] : [payload.clueWords[0], event.target.value] })} placeholder={index === 0 ? "first clue" : "second clue"} value={payload.clueWords[index]} />;
  return <section className="studio-game-editor studio-ba-editor before-after-game-card" data-theme="signature" data-view="play">
    <header><BeforeAfterWordmark compact /><h2>Build a bridge</h2><span>Write directly in the same phrase layout the player will solve.</span></header>
    <div className="studio-ba-direction" role="group" aria-label="Bridge direction"><button aria-pressed={payload.position === "before"} onClick={() => onChange({ ...payload, position: "before" })} type="button">Before both</button><button aria-pressed={payload.position === "after"} onClick={() => onChange({ ...payload, position: "after" })} type="button">After both</button><button aria-pressed={payload.position === "both"} onClick={() => onChange({ ...payload, position: "both" })} type="button">Before + after</button></div>
    <div className="ba-play"><div className="ba-puzzle-card studio-ba-play-card">
      <p className="ba-instruction">word {payload.position === "before" ? "before both clues" : payload.position === "after" ? "after both clues" : "before one clue and after the other"}</p>
      <div className="ba-phrase-stack studio-ba-editable-phrases">
        <div className={`ba-phrase ${payload.position === "after" ? "is-answer-last" : "is-answer-first"}`}>{payload.position === "after" ? <>{clueField(0)}{answerField("answer-one")}</> : <>{answerField("answer-one")}{clueField(0)}</>}</div>
        <div className={`ba-phrase ${payload.position === "before" ? "is-answer-first" : "is-answer-last"}`}>{payload.position === "before" ? <>{answerField("answer-two")}{clueField(1)}</> : <>{clueField(1)}{answerField("answer-two")}</>}</div>
      </div>
      <p className={`ba-feedback ${validation.valid ? "is-success" : "is-error"}`}>{validation.valid ? "Bridge ready to test." : validationMessages[validation.reason] || "Complete the bridge."}</p>
    </div></div>
    <details className="studio-editor-options"><summary>Collection details <span>optional</span></summary><div className="studio-option-grid"><label>Difficulty<select onChange={(event) => onChange({ ...payload, difficulty: Number(event.target.value) as BeforeAfterPayload["difficulty"] })} value={payload.difficulty}>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label><label>Pack<input maxLength={80} onChange={(event) => onChange({ ...payload, packId: event.target.value })} placeholder="daily" value={payload.packId} /></label></div></details>
  </section>;
}

function DecodeEditor({ payload, onChange }: { payload: DecodePayload; onChange: (payload: DecodePayload) => void }) {
  const authoringType = decodeAuthoringType(payload);
  const entries = decodePayloadEntries(payload);
  const setType = (next: "daily-5" | "bank") => onChange({
    ...payload,
    authoringType: next,
    entries: next === "daily-5"
      ? Array.from({ length: 5 }, (_, index) => entries[index] ?? { answer: "", clueWord: "", clue: "" })
      : [entries[0] ?? { answer: "", clueWord: "", clue: "" }],
    modes: next === "daily-5" ? ["daily-5", "timed", "zen"] : ["timed", "zen"],
  });
  const updateEntry = (index: number, next: Partial<(typeof entries)[number]>) => onChange({ ...payload, entries: entries.map((entry, current) => current === index ? { ...entry, ...next } : entry) });
  function toggle(mode: DecodePayload["modes"][number]) {
    onChange({ ...payload, modes: payload.modes.includes(mode) ? payload.modes.filter((item) => item !== mode) : [...payload.modes, mode] });
  }
  return <section className="studio-game-editor studio-decode-editor"><header><p>Puzzle builder</p><h2>{authoringType === "daily-5" ? "Curate a Daily 5" : "Add a bank entry"}</h2><span>{authoringType === "daily-5" ? "Name the theme and build all five ordered signals in one place." : "Create one signal for Timed, Zen, or both."}</span></header>
    <div className="studio-decode-type" role="group" aria-label="DECODE puzzle type"><button aria-pressed={authoringType === "daily-5"} onClick={() => setType("daily-5")} type="button">Daily 5</button><button aria-pressed={authoringType === "bank"} onClick={() => setType("bank")} type="button">Timed / Zen entry</button></div>
    {authoringType === "daily-5" && <label className="studio-primary-field">Theme name<input maxLength={80} onChange={(event) => onChange({ ...payload, theme: event.target.value })} placeholder="Sea Creatures" value={payload.theme ?? ""} /></label>}
    <div className="studio-decode-entry-list">{entries.map((entry, index) => <fieldset key={index}><legend>{authoringType === "daily-5" ? `Signal ${index + 1}` : "Signal"}<span>{entry.answer.length ? `${entry.answer.length} letters` : "4–7 letters"}</span></legend><label>Clue word<input maxLength={7} onChange={(event) => updateEntry(index, { clueWord: event.target.value.toLocaleUpperCase().replace(/[^A-Z]/g, "") })} placeholder="BAKE" value={entry.clueWord} /></label><label>Answer<input maxLength={7} onChange={(event) => updateEntry(index, { answer: event.target.value.toLocaleUpperCase().replace(/[^A-Z]/g, "") })} placeholder="BARE" value={entry.answer} /></label><label className="is-wide">Definition clue<input maxLength={240} onChange={(event) => updateEntry(index, { clue: event.target.value })} placeholder="uncovered" value={entry.clue} /></label></fieldset>)}</div>
    <fieldset className="studio-decode-pools"><legend>Also include {authoringType === "daily-5" ? "these signals" : "this signal"} in</legend>{(["timed", "zen"] as const).map((mode) => <label className="studio-check" key={mode}><input checked={payload.modes.includes(mode)} onChange={() => toggle(mode)} type="checkbox" />{mode === "timed" ? "Timed bank" : "Zen bank"}</label>)}</fieldset>
  </section>;
}
