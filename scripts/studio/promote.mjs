import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validatePublishedPuzzle, validatePuzzleSchedule } from "../../src/authoring/contracts.mjs";

const root = process.cwd();
const studioRoot = path.join(root, ".local", "puzzle-studio");
const output = path.join(root, "src", "authoring", "data", "promoted-puzzles.json");
const schedule = JSON.parse(await readFile(path.join(studioRoot, "schedule.json"), "utf8"));
const scheduleValidation = validatePuzzleSchedule(schedule);
if (!scheduleValidation.valid) throw new Error(`Invalid Studio schedule: ${scheduleValidation.errors.map((error) => `${error.path} ${error.message}`).join(", ")}`);

const puzzles = [];
const publishedRoot = path.join(studioRoot, "published");
for (const game of await readdir(publishedRoot, { withFileTypes: true }).catch(() => [])) {
  if (!game.isDirectory()) continue;
  for (const id of await readdir(path.join(publishedRoot, game.name), { withFileTypes: true })) {
    if (!id.isDirectory()) continue;
    for (const revision of await readdir(path.join(publishedRoot, game.name, id.name), { withFileTypes: true })) {
      if (!revision.isFile() || !/^\d+\.json$/.test(revision.name)) continue;
      const puzzle = JSON.parse(await readFile(path.join(publishedRoot, game.name, id.name, revision.name), "utf8"));
    const validation = validatePublishedPuzzle(puzzle);
      if (!validation.valid) throw new Error(`Invalid published puzzle ${game.name}/${id.name}/${revision.name}.`);
      puzzles.push(puzzle);
    }
  }
}
for (const entry of schedule.entries) for (const reference of entry.puzzles) {
  if (!puzzles.some((puzzle) => puzzle.gameId === entry.gameId && puzzle.id === reference.puzzleId && puzzle.revision === reference.revision)) {
    throw new Error(`Scheduled ${entry.gameId}/${reference.puzzleId}@${reference.revision} is not a local published revision. Create an editable Studio revision before promotion.`);
  }
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, promotedAt: new Date().toISOString(), schedule, puzzles }, null, 2)}\n`);
console.log(`Promoted ${puzzles.length} scheduled puzzle revisions into the shipped artifact.`);
