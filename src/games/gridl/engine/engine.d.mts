export type GridlTile = { id: string; text: string };
export type GridlCell = {
  text: string | null;
  tileId: string | null;
  seed: boolean;
  special?: "blocked" | "portal" | null;
};
export type GridlPlacement =
  | {
      type: "place";
      tile: GridlTile;
      r: number;
      c: number;
      origin: "hand" | "reserve";
    }
  | {
      type: "recall";
      tileSnapshot: GridlTile & { r: number; c: number };
    };
export type GridlState = {
  rows: number;
  cols: number;
  par: number;
  goal: { r: number; c: number };
  turn: number;
  mode: "play" | "recall";
  dir: "H" | "V";
  grid: GridlCell[][];
  placed: Map<string, GridlTile & { r: number; c: number }>;
  turnPlacements: GridlPlacement[];
  deck: GridlTile[];
  hand: GridlTile[];
  reserve: GridlTile[];
  selectedTileId: string | null;
  allow: Set<string>;
  portalAt: (string | null)[][];
  portalGroups: Map<string, Array<{ r: number; c: number }>>;
};
export type GridlLevel = {
  id: string;
  name: string;
  rows: number;
  cols: number;
  size?: number;
  par: number;
  goal: { r: number; c: number };
  seeds: Array<{ text: string; r: number; c: number; dir: "H" | "V" }>;
  deck: string[];
  startingHand: string[] | null;
  allowedWords: string[];
  notes: string;
  intro: string;
  board: {
    specials: Array<{
      r: number;
      c: number;
      type: "blocked" | "portal";
      group?: string;
    }>;
  };
};
export type GridlResult =
  | { ok: true; win?: boolean }
  | { ok: false; reason: string };
