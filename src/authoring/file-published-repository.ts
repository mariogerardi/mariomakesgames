import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertPublishedPuzzle,
  validatePublishedPuzzle,
  type AnyPublishedPuzzle,
  type AuthorableGameId,
} from "./contracts.mjs";

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSafeSegment(value: string, label: string) {
  if (!SAFE_ID.test(value)) throw new TypeError(`${label} must be lowercase kebab-case.`);
}

export function createFilePublishedRepository(rootDirectory: string) {
  const publishedDirectory = path.resolve(rootDirectory, "published");

  function revisionPath(gameId: AuthorableGameId, id: string, revision: number) {
    assertSafeSegment(gameId, "Game ID");
    assertSafeSegment(id, "Puzzle ID");
    if (!Number.isInteger(revision) || revision < 1) throw new TypeError("Revision must be a positive integer.");
    return path.join(publishedDirectory, gameId, id, `${revision}.json`);
  }

  async function get(gameId: AuthorableGameId, id: string, revision: number): Promise<AnyPublishedPuzzle | null> {
    try {
      const parsed: unknown = JSON.parse(await readFile(revisionPath(gameId, id, revision), "utf8"));
      const result = validatePublishedPuzzle(parsed);
      if (!result.valid) throw new TypeError(`Stored published puzzle is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join(", ")}`);
      return parsed as AnyPublishedPuzzle;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function list(gameId?: AuthorableGameId): Promise<AnyPublishedPuzzle[]> {
    const gameDirectories = gameId
      ? [gameId]
      : await readdir(publishedDirectory, { withFileTypes: true })
          .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name as AuthorableGameId))
          .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
    const puzzles: AnyPublishedPuzzle[] = [];
    for (const currentGameId of gameDirectories) {
      if (!SAFE_ID.test(currentGameId)) continue;
      const ids = await readdir(path.join(publishedDirectory, currentGameId), { withFileTypes: true })
        .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
      for (const idEntry of ids) {
        if (!idEntry.isDirectory() || !SAFE_ID.test(idEntry.name)) continue;
        const revisions = await readdir(path.join(publishedDirectory, currentGameId, idEntry.name), { withFileTypes: true });
        for (const revisionEntry of revisions) {
          const match = revisionEntry.isFile() ? /^(\d+)\.json$/.exec(revisionEntry.name) : null;
          if (!match) continue;
          const puzzle = await get(currentGameId, idEntry.name, Number(match[1]));
          if (puzzle) puzzles.push(puzzle);
        }
      }
    }
    return puzzles.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async function publish(document: AnyPublishedPuzzle) {
    assertPublishedPuzzle(document);
    const filePath = revisionPath(document.gameId, document.id, document.revision);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") throw new Error(`Revision ${document.revision} of ${document.id} already exists and cannot be replaced.`);
        throw error;
      });
    return structuredClone(document);
  }

  return { get, list, publish };
}

export type FilePublishedRepository = ReturnType<typeof createFilePublishedRepository>;
