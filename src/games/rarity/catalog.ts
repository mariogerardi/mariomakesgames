import rawCatalog from "./data/classic-puzzles.json";
import { loadRarityPuzzleCatalog } from "./puzzle-loader.mjs";

export const rarityClassicPuzzles = loadRarityPuzzleCatalog(rawCatalog);
