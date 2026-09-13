import type { GameId } from "./types";

export type GameRouteState = {
  view?: string;
  date?: string;
  pack?: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const routedViews: Partial<Record<GameId, readonly string[]>> = {
  syllabl: ["menu", "daily", "archive", "how-to", "themes", "about"],
  rarity: ["home", "daily", "how-to", "themes", "settings", "about", "insights"],
  "before-after": ["menu", "daily", "packs", "archive", "themes", "how-to", "settings"],
  decode: ["home", "daily-5", "timed", "zen", "themes", "how-to"],
  dual: ["menu", "daily", "archive", "themes", "how-to", "settings"],
};

const defaultViews: Partial<Record<GameId, string>> = {
  syllabl: "menu",
  rarity: "home",
  "before-after": "menu",
  decode: "home",
  dual: "menu",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Resolve deep-linkable game UI before the first server paint. */
export function resolveGameRouteState(gameId: GameId, searchParams: RawSearchParams): GameRouteState {
  const allowed = routedViews[gameId];
  if (!allowed) return {};

  const requested = first(searchParams.view);
  const view = requested && allowed.includes(requested)
    ? requested
    : defaultViews[gameId];
  const requestedDate = first(searchParams.date);
  const requestedPack = first(searchParams.pack);

  return {
    view,
    ...(((gameId === "dual" && view === "archive") || (gameId === "syllabl" && view === "daily") || (gameId === "before-after" && view === "archive")) && requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? { date: requestedDate }
      : {}),
    ...(gameId === "before-after" && view === "packs" && requestedPack && /^[a-z0-9-]+$/.test(requestedPack)
      ? { pack: requestedPack }
      : {}),
  };
}
