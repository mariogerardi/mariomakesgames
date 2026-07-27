import fs from "node:fs";
import vm from "node:vm";

const [, , sourcePath, outputPath] = process.argv;
if (!sourcePath || !outputPath) {
  throw new Error(
    "Usage: node scripts/extract-decode-catalog.mjs LEGACY_DATA_JS OUTPUT_JSON",
  );
}

const source = fs.readFileSync(sourcePath, "utf8");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  `${source}
globalThis.__decodeCatalog = {
  fourLetterWords,
  fiveLetterWords,
  sixLetterWords,
  sevenLetterWords,
  daily,
};`,
  sandbox,
);

function normalize(entry, index, group) {
  return {
    id: `${group}-${String(index + 1).padStart(3, "0")}`,
    answer: entry.answer,
    clueWord: entry.clue1,
    clue: entry.clue2,
    ...(entry.theme ? { theme: entry.theme } : {}),
  };
}

const timedGroups = {
  4: sandbox.__decodeCatalog.fourLetterWords,
  5: sandbox.__decodeCatalog.fiveLetterWords,
  6: sandbox.__decodeCatalog.sixLetterWords,
  7: sandbox.__decodeCatalog.sevenLetterWords,
};

const seen = new Set();
const timed = Object.fromEntries(
  Object.entries(timedGroups).map(([length, entries]) => [
    length,
    entries
      .filter((entry) => {
        const key = `${entry.answer}\u0000${entry.clue1}\u0000${entry.clue2}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((entry, index) => normalize(entry, index, `timed-${length}`)),
  ]),
);

const daily = sandbox.__decodeCatalog.daily.map((entry, index) =>
  normalize(entry, index, "daily"),
);

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      sourceRevision: "db2e50e16b04ef317f116583a37a19a72a0b8fc9",
      timed,
      daily,
    },
    null,
    2,
  )}\n`,
);
