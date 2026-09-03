import { allBridgePuzzles, bridgePacks } from "../games/before-after/catalog";
import { allDecodePuzzles, decodeDailyPuzzles } from "../games/decode/catalog";
import { dualLexiconEntries, dualPuzzles } from "../games/dual/catalog.mjs";
import { canonicalContainsSequence } from "../games/dual/lexicon.mjs";
import { rarityClassicPuzzles } from "../games/rarity/catalog";
import { syllablPuzzles } from "../games/syllabl/catalog";
import { tokenPuzzles, type TokenCatalogPuzzle } from "../games/token/catalog";
import { catalogRunwayItem } from "./catalog-runway.mjs";
import type {
  AnyPuzzleDraft,
  AuthorableGameId,
  DraftPayloadByGame,
  PuzzleSchedule,
  PublishedPayloadByGame,
} from "./contracts.mjs";
import { PUZZLE_STUDIO_SCHEMA_VERSION } from "./contracts.mjs";

type StudioCatalogItemFor<G extends AuthorableGameId> = {
  key: string;
  gameId: G;
  id: string;
  title: string;
  summary: string;
  source: string;
  modes: string[];
  payload: PublishedPayloadByGame[G];
};

export type StudioCatalogItem = {
  [G in AuthorableGameId]: StudioCatalogItemFor<G>
}[AuthorableGameId];

function tokenDraftPayload(puzzle: TokenCatalogPuzzle): DraftPayloadByGame["token"] {
  let cursor = 0;
  const stopByIndex = new Map(puzzle.stops.map((stop) => [stop.index, stop]));
  const rawTokens = puzzle.responseTokens.map((displayToken, index) => {
    const token = puzzle.difficulty === "hard"
      ? displayToken.replaceAll("␠", " ").replaceAll("↵", "\n").replaceAll("⇥", "\t")
      : `${index ? " " : ""}${displayToken}`;
    const start = cursor;
    cursor += token.length;
    const stop = stopByIndex.get(index);
    return {
      alternatives: (stop?.candidates ?? []).map((candidate) => ({
        logprob: Math.log(Math.max(1, Math.min(99, candidate.score)) / 100),
        token: `${puzzle.difficulty === "easy" && index ? " " : ""}${candidate.token}`,
      })),
      end: cursor,
      id: `token-${index}`,
      index,
      logprob: 0,
      start,
      token,
    };
  });
  const responseText = rawTokens.map((token) => token.token).join("").trim();
  const words = puzzle.difficulty === "easy"
    ? puzzle.responseTokens.map((text, index) => ({
        easyStatus: "ready" as const,
        id: `word-${index}`,
        index,
        selectable: true,
        sourceTokenIndexes: [index],
        text,
      }))
    : [];
  return {
    difficulty: puzzle.difficulty,
    summary: puzzle.summary,
    selectedStopIds: puzzle.stops.map((stop) => `${puzzle.difficulty === "easy" ? "word" : "token"}-${stop.index}`),
    generation: {
      authoringNotes: "Imported from the shipped TOKEN catalog.",
      id: puzzle.id.replace(/-(?:easy|hard)-\d+$/, ""),
      model: "catalog-import",
      prompt: puzzle.prompt,
      rawTokens,
      responseText,
      schemaVersion: 1,
      words,
    },
  };
}

export const studioCatalog: StudioCatalogItem[] = [
  ...syllablPuzzles.map((puzzle, index) => ({
    key: `syllabl:${index + 1}`,
    gameId: "syllabl" as const,
    id: `syllabl-${String(index + 1).padStart(3, "0")}`,
    title: puzzle.puzzleLetters.toLocaleUpperCase(),
    summary: `Six-stage Syllabl puzzle · difficulty ${puzzle.difficulty ?? "unrated"}`,
    source: "125-puzzle Syllabl catalog",
    modes: ["daily"],
    payload: puzzle,
  })),
  ...rarityClassicPuzzles.map((puzzle, index) => ({
    key: `rarity:${puzzle.date ?? index + 1}`,
    gameId: "rarity" as const,
    id: `rarity-${puzzle.date ?? String(index + 1).padStart(3, "0")}`,
    title: puzzle.puzzleString.toLocaleUpperCase(),
    summary: puzzle.date ? `Classic fallback · ${puzzle.date}` : "Classic fallback puzzle",
    source: "35-puzzle classic Rarity fallback",
    modes: ["daily"],
    payload: {
      puzzleString: puzzle.puzzleString,
      difficulty: puzzle.difficulty as 0 | 1 | 2 | 3 | 4 | 5,
      curatorName: puzzle.curatorName,
    },
  })),
  ...allBridgePuzzles.map((puzzle) => {
    const pack = bridgePacks.find((candidate) => candidate.puzzles.some((item) => item.id === puzzle.id));
    return {
      key: `before-after:${puzzle.id}`,
      gameId: "before-after" as const,
      id: puzzle.id,
      title: `${puzzle.clueWords[0]} / ${puzzle.clueWords[1]}`,
      summary: `Answer: ${puzzle.answer}`,
      source: "204-puzzle Before&After catalog",
      modes: ["daily", `pack:${pack?.id ?? "unknown"}`],
      payload: {
        answer: puzzle.answer,
        clueWords: [puzzle.clueWords[0] ?? "", puzzle.clueWords[1] ?? ""] as [string, string],
        position: puzzle.position,
        difficulty: puzzle.difficulty as 1 | 2 | 3 | 4 | 5,
        packId: pack?.id ?? "",
      },
    };
  }),
  {
    key: "decode:daily-sea-creatures",
    gameId: "decode" as const,
    id: "decode-daily-sea-creatures",
    title: "Sea Creatures",
    summary: "The original fixed five-signal Daily 5.",
    source: "DECODE Daily 5 catalog",
    modes: ["daily-5", "timed", "zen"],
    payload: {
      authoringType: "daily-5" as const,
      entries: decodeDailyPuzzles.map(({ answer, clueWord, clue }) => ({ answer, clueWord, clue })),
      theme: "Sea Creatures",
      modes: ["daily-5", "timed", "zen"] as Array<"timed" | "daily-5" | "zen">,
    },
  },
  ...[...new Map(allDecodePuzzles.map((puzzle) => [puzzle.id, puzzle])).values()].map((puzzle) => ({
    key: `decode:${puzzle.id}`,
    gameId: "decode" as const,
    id: puzzle.id,
    title: `${puzzle.clueWord} → ${puzzle.answer}`,
    summary: puzzle.clue,
    source: "118-puzzle DECODE catalog",
    modes: ["timed", "zen"],
    payload: {
      authoringType: "bank" as const,
      entries: [{ answer: puzzle.answer, clueWord: puzzle.clueWord, clue: puzzle.clue }],
      answer: puzzle.answer,
      clueWord: puzzle.clueWord,
      clue: puzzle.clue,
      theme: puzzle.theme ?? null,
      modes: ["timed", "zen"] as Array<"timed" | "daily-5" | "zen">,
    },
  })),
  ...tokenPuzzles.map((puzzle) => ({
    key: `token:${puzzle.id}`,
    gameId: "token" as const,
    id: puzzle.id,
    title: puzzle.title,
    summary: puzzle.summary,
    source: "TOKEN fixture catalog",
    modes: [puzzle.difficulty, "daily", "archive"],
    payload: {
      difficulty: puzzle.difficulty,
      summary: puzzle.summary,
      prompt: puzzle.prompt,
      responseTokens: [...puzzle.responseTokens],
      stops: puzzle.stops.map((stop) => ({ ...stop, candidates: stop.candidates.map((candidate) => ({ ...candidate })) })),
      tokenizer: { ...puzzle.tokenizer },
    },
  })),
  ...dualPuzzles.map((puzzle) => ({
    key: `dual:${puzzle.id}`,
    gameId: "dual" as const,
    id: puzzle.id,
    title: puzzle.sequence,
    summary: `${puzzle.minimumEnglish} EN families · ${puzzle.minimumSpanish} ES families · ${puzzle.dualCount} Duals`,
    source: "DUAL fixture catalog",
    modes: ["daily", "archive"],
    payload: {
      sequence: puzzle.sequence,
      targetScore: puzzle.targetScore,
      minimumEnglish: puzzle.minimumEnglish,
      minimumSpanish: puzzle.minimumSpanish,
      dualCount: puzzle.dualCount,
      lexicon: dualLexiconEntries.filter((entry) => canonicalContainsSequence(entry.surface, puzzle.sequence)),
    },
  })),
] as StudioCatalogItem[];

export const studioCatalogCounts = Object.freeze(Object.fromEntries(
  (["syllabl", "rarity", "before-after", "decode", "token", "dual"] as const)
    .map((gameId) => [gameId, studioCatalog.filter((item) => item.gameId === gameId).length]),
) as Record<AuthorableGameId, number>);

export function studioCatalogForDailyMode(gameId: AuthorableGameId, mode: string) {
  return studioCatalog.filter((item) => {
    if (item.gameId !== gameId) return false;
    if (gameId === "decode") return item.modes.includes("daily-5");
    if (gameId === "token") return item.modes.includes(mode === "daily-hard" ? "hard" : "easy");
    return item.modes.includes("daily");
  });
}

export function catalogBaselineEntry(
  gameId: AuthorableGameId,
  mode: string,
  date: string,
): PuzzleSchedule["entries"][number] | null {
  const item = catalogRunwayItem(studioCatalogForDailyMode(gameId, mode), date);
  if (!item) return null;
  return { gameId, mode, date, puzzles: [{ puzzleId: item.id, revision: 1 }] };
}

export function createDraftFromCatalogItem(item: StudioCatalogItem, timestamp = new Date().toISOString()): AnyPuzzleDraft {
  let payload: DraftPayloadByGame[AuthorableGameId];
  switch (item.gameId) {
    case "syllabl": payload = {
      puzzleLetters: item.payload.puzzleLetters,
      difficulty: item.payload.difficulty,
      stages: item.payload.inputsEnabled.map((placementCode, index) => ({
        placementCode,
        syllablesRequired: item.payload.syllablesRequired[index]!,
        proofWord: "",
      })),
    }; break;
    case "rarity": payload = { ...item.payload, referenceWords: [] }; break;
    case "before-after": payload = structuredClone(item.payload); break;
    case "decode": payload = structuredClone(item.payload); break;
    case "token": payload = tokenDraftPayload(tokenPuzzles.find((puzzle) => puzzle.id === item.id)!); break;
    case "dual": payload = {
      sequence: item.payload.sequence,
      corpusRevision: "curated-fixture-v1",
      settings: {
        targetScore: item.payload.targetScore,
        minimumEnglish: item.payload.minimumEnglish,
        minimumSpanish: item.payload.minimumSpanish,
      },
      overrides: {},
      familyOverrides: {},
    }; break;
  }
  return {
    kind: "puzzle-draft",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    gameId: item.gameId,
    id: `${item.id}-draft-${crypto.randomUUID().slice(0, 6)}`,
    title: item.title,
    tags: ["catalog-import", ...item.modes],
    status: "draft",
    notes: `Created from ${item.source}: ${item.id}.`,
    createdAt: timestamp,
    updatedAt: timestamp,
    baseRevision: 1,
    payload,
  } as AnyPuzzleDraft;
}
