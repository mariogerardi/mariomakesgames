import type { AnyPublishedPuzzle, AnyPuzzleDraft, AuthorableGameId, PublishedPayloadByGame, PuzzleSchedule } from "./contracts.mjs";
import type { StudioCatalogItem } from "./catalog";
import { decodePayloadEntries } from "./decode-payload.ts";

const clean = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

export function puzzleIdentityKeys(gameId: AuthorableGameId, payload: PublishedPayloadByGame[AuthorableGameId] | AnyPuzzleDraft["payload"]) {
  switch (gameId) {
    case "syllabl": { const value = clean((payload as PublishedPayloadByGame["syllabl"]).puzzleLetters); return value ? [`string:${value}`] : []; }
    case "rarity": { const value = clean((payload as PublishedPayloadByGame["rarity"]).puzzleString); return value ? [`string:${value}`] : []; }
    case "dual": { const value = clean((payload as PublishedPayloadByGame["dual"]).sequence); return value ? [`sequence:${value}`] : []; }
    case "before-after": {
      const value = payload as PublishedPayloadByGame["before-after"];
      return value.answer && value.clueWords.every(Boolean) ? [`bridge:${clean(value.answer)}:${value.position}:${value.clueWords.map(clean).join(":")}`] : [];
    }
    case "decode": return decodePayloadEntries(payload as PublishedPayloadByGame["decode"]).map((entry) => `signal:${clean(entry.answer)}:${clean(entry.clueWord)}`);
    case "token": {
      const value = payload as PublishedPayloadByGame["token"] & { generation?: { prompt?: string } | null };
      const prompt = clean(value.prompt ?? value.generation?.prompt ?? "");
      return prompt ? [`prompt:${prompt}`] : [];
    }
  }
}

export type DuplicateIssue = { severity: "block" | "warn"; message: string };

export function findDuplicateIssues({
  draft,
  drafts,
  catalog,
  published,
  schedule,
}: {
  draft: AnyPuzzleDraft;
  drafts: AnyPuzzleDraft[];
  catalog: StudioCatalogItem[];
  published: AnyPublishedPuzzle[];
  schedule: PuzzleSchedule | null;
}): DuplicateIssue[] {
  const keys = puzzleIdentityKeys(draft.gameId, draft.payload).filter((key) => !key.endsWith(":"));
  const repeatedWithinDraft = keys.find((key, index) => keys.indexOf(key) !== index);
  if (repeatedWithinDraft) return [{ severity: "block", message: "This puzzle repeats the same content within the current document." }];
  const sources = [
    ...drafts.filter((item) => item.gameId === draft.gameId && item.id !== draft.id).map((item) => ({ id: item.id, label: "another draft", keys: puzzleIdentityKeys(item.gameId, item.payload) })),
    ...catalog.filter((item) => item.gameId === draft.gameId && item.id !== draft.id).map((item) => ({ id: item.id, label: "the shipped archive", keys: puzzleIdentityKeys(item.gameId, item.payload) })),
    ...published.filter((item) => item.gameId === draft.gameId && item.id !== draft.id).map((item) => ({ id: item.id, label: "a published Studio revision", keys: puzzleIdentityKeys(item.gameId, item.payload) })),
  ];
  for (const source of sources) {
    if (!keys.some((key) => source.keys.includes(key))) continue;
    const dates = (schedule?.entries ?? []).filter((entry) => entry.gameId === draft.gameId && entry.puzzles.some((reference) => reference.puzzleId === source.id)).map((entry) => entry.date).sort();
    return [{ severity: "block", message: `This puzzle already exists in ${source.label}${dates.length ? ` and is scheduled for ${dates.join(", ")}` : ""}.` }];
  }
  if (draft.gameId === "decode") {
    const answers = new Set(decodePayloadEntries(draft.payload).map((entry) => clean(entry.answer)).filter(Boolean));
    const overlap = sources.find((source) => source.keys.some((key) => [...answers].some((answer) => key.startsWith(`signal:${answer}:`))));
    if (overlap) return [{ severity: "warn", message: `A DECODE answer already appears in ${overlap.label}, but with a different clue word.` }];
  }
  return [];
}
