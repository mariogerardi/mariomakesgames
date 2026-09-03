import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PUZZLE_STUDIO_SCHEMA_VERSION,
  PUZZLE_STUDIO_TIME_ZONE,
  validatePuzzleSchedule,
  type PuzzleSchedule,
} from "./contracts.mjs";

function emptySchedule(): PuzzleSchedule {
  return {
    kind: "puzzle-schedule",
    schemaVersion: PUZZLE_STUDIO_SCHEMA_VERSION,
    timeZone: PUZZLE_STUDIO_TIME_ZONE,
    entries: [],
  };
}

export function createFileScheduleRepository(rootDirectory: string) {
  const filePath = path.resolve(rootDirectory, "schedule.json");
  const backupDirectory = path.resolve(rootDirectory, "backups", "schedule");

  async function get() {
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
      const result = validatePuzzleSchedule(parsed);
      if (!result.valid) throw new TypeError(`Stored schedule is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join(", ")}`);
      return structuredClone(parsed as PuzzleSchedule);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptySchedule();
      throw error;
    }
  }

  async function save(schedule: PuzzleSchedule) {
    const result = validatePuzzleSchedule(schedule);
    if (!result.valid) throw new TypeError(result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
    await mkdir(path.dirname(filePath), { recursive: true });
    try {
      const existing = await readFile(filePath, "utf8");
      await mkdir(backupDirectory, { recursive: true });
      const stamp = new Date().toISOString().replaceAll(":", "-");
      await writeFile(path.join(backupDirectory, `schedule.${stamp}.json`), existing, { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(schedule, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
    return structuredClone(schedule);
  }

  return { get, save };
}
