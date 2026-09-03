import rawCatalog from "./data/classic-puzzles.json";
import { loadRarityPuzzleCatalog } from "./puzzle-loader.mjs";
import { catalogDateKey } from "../../platform/daily-calendar.mjs";

export const rarityClassicPuzzles = loadRarityPuzzleCatalog(rawCatalog).map((puzzle, index) => ({
  ...puzzle,
  date: catalogDateKey(index),
}));
