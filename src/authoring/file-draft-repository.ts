import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertPuzzleDraft,
  validatePuzzleDraft,
  type AuthorableGameId,
  type PuzzleDraft,
} from "./contracts.mjs";

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSafeSegment(value: string, label: string) {
  if (!SAFE_ID.test(value)) throw new TypeError(`${label} must be lowercase kebab-case.`);
}

async function fileExists(filePath: string) {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function copyDraft<G extends AuthorableGameId>(draft: PuzzleDraft<G>): PuzzleDraft<G> {
  return structuredClone(draft);
}

export function createFileDraftRepository(rootDirectory: string) {
  const draftsDirectory = path.resolve(rootDirectory, "drafts");
  const backupsDirectory = path.resolve(rootDirectory, "backups");

  function draftPath(gameId: AuthorableGameId, id: string) {
    assertSafeSegment(gameId, "Game ID");
    assertSafeSegment(id, "Draft ID");
    return path.join(draftsDirectory, gameId, `${id}.json`);
  }

  async function backup(filePath: string, draft: PuzzleDraft, reason: "replace" | "delete") {
    if (!(await fileExists(filePath))) return;
    const serialized = await readFile(filePath, "utf8");
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = path.join(backupsDirectory, draft.gameId, `${draft.id}.${stamp}.${reason}.json`);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await writeFile(backupPath, serialized, { encoding: "utf8", flag: "wx" });
  }

  async function writeAtomically(filePath: string, value: string) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, value, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
  }

  async function get(gameId: AuthorableGameId, id: string): Promise<PuzzleDraft | null> {
    const filePath = draftPath(gameId, id);
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
      const result = validatePuzzleDraft(parsed);
      if (!result.valid) throw new TypeError(`Stored draft is invalid: ${result.errors.map((error) => `${error.path} ${error.message}`).join(", ")}`);
      return parsed as PuzzleDraft;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function list(gameId?: AuthorableGameId): Promise<PuzzleDraft[]> {
    const gameDirectories = gameId
      ? [gameId]
      : await readdir(draftsDirectory, { withFileTypes: true })
          .then((entries) => entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name as AuthorableGameId))
          .catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
    const drafts: PuzzleDraft[] = [];
    for (const currentGameId of gameDirectories) {
      if (!SAFE_ID.test(currentGameId)) continue;
      const directory = path.join(draftsDirectory, currentGameId);
      const files = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith(".json")) continue;
        const id = file.name.slice(0, -5);
        const draft = await get(currentGameId, id);
        if (draft) drafts.push(draft);
      }
    }
    return drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function save<G extends AuthorableGameId>(draft: PuzzleDraft<G>, options: { overwrite?: boolean } = {}) {
    assertPuzzleDraft(draft);
    const filePath = draftPath(draft.gameId, draft.id);
    const existing = await get(draft.gameId, draft.id);
    if (existing && !options.overwrite) throw new Error(`A draft named ${draft.id} already exists.`);
    if (existing) await backup(filePath, existing, "replace");
    await writeAtomically(filePath, `${JSON.stringify(draft, null, 2)}\n`);
    return copyDraft(draft);
  }

  async function importDraft(draft: PuzzleDraft) {
    return save(draft, { overwrite: false });
  }

  async function duplicate(gameId: AuthorableGameId, id: string, nextId: string, now = new Date().toISOString()) {
    assertSafeSegment(nextId, "New draft ID");
    const source = await get(gameId, id);
    if (!source) throw new Error(`Draft ${id} was not found.`);
    const next: PuzzleDraft = {
      ...copyDraft(source),
      id: nextId,
      title: source.title ? `Copy of ${source.title}` : "",
      status: "draft",
      baseRevision: null,
      createdAt: now,
      updatedAt: now,
    };
    return save(next, { overwrite: false });
  }

  async function remove(gameId: AuthorableGameId, id: string) {
    const filePath = draftPath(gameId, id);
    const existing = await get(gameId, id);
    if (!existing) return false;
    await backup(filePath, existing, "delete");
    await unlink(filePath);
    return true;
  }

  return { list, get, save, importDraft, duplicate, remove };
}

export type FileDraftRepository = ReturnType<typeof createFileDraftRepository>;
