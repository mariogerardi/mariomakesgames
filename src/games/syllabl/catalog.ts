import rawPuzzleCatalog from "./data/puzzles.json";
import { loadSyllablPuzzleCatalog } from "./puzzle-loader.mjs";

export const syllablPuzzles = loadSyllablPuzzleCatalog(rawPuzzleCatalog);
