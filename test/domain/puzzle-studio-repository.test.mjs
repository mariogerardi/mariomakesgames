import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEmptyPuzzlePayload } from "../../src/authoring/contracts.mjs";
import { createFileDraftRepository } from "../../src/authoring/file-draft-repository.ts";
import { createFileScheduleRepository } from "../../src/authoring/file-schedule-repository.ts";
import { isLocalStudioHost } from "../../src/authoring/studio-access.ts";

function fixture(id = "syllabl-first") {
  return {
    kind: "puzzle-draft",
    schemaVersion: 1,
    gameId: "syllabl",
    id,
    title: "First Syllabl draft",
    tags: [],
    status: "draft",
    notes: "",
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
    baseRevision: null,
    payload: createEmptyPuzzlePayload("syllabl"),
  };
}

test("the local Studio repository saves, replaces, duplicates, imports, and removes drafts safely", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "puzzle-studio-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repository = createFileDraftRepository(root);
  const first = fixture();

  await repository.save(first);
  assert.deepEqual(await repository.get("syllabl", first.id), first);
  assert.equal((await repository.list()).length, 1);

  const replaced = { ...first, title: "Revised", updatedAt: "2026-09-02T13:00:00.000Z" };
  await repository.save(replaced, { overwrite: true });
  assert.equal((await repository.get("syllabl", first.id)).title, "Revised");
  assert.equal((await readdir(path.join(root, "backups", "syllabl"))).some((name) => name.endsWith(".replace.json")), true);

  const duplicate = await repository.duplicate("syllabl", first.id, "syllabl-second", "2026-09-02T14:00:00.000Z");
  assert.equal(duplicate.id, "syllabl-second");
  assert.equal(duplicate.title, "Copy of Revised");
  assert.equal(duplicate.status, "draft");
  assert.equal(duplicate.baseRevision, null);

  await assert.rejects(repository.importDraft(duplicate), /already exists/);
  await repository.importDraft(fixture("syllabl-imported"));
  assert.equal((await repository.list("syllabl")).length, 3);

  assert.equal(await repository.remove("syllabl", "syllabl-imported"), true);
  assert.equal(await repository.get("syllabl", "syllabl-imported"), null);
  assert.equal((await readdir(path.join(root, "backups", "syllabl"))).some((name) => name.includes("syllabl-imported") && name.endsWith(".delete.json")), true);
});

test("the file repository rejects malformed drafts before touching disk", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "puzzle-studio-invalid-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repository = createFileDraftRepository(root);
  await assert.rejects(repository.save({ ...fixture(), id: "../../escape" }), /kebab-case/);
  assert.deepEqual(await repository.list(), []);
});

test("the local Studio schedule starts empty and saves validated assignments with backups", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "puzzle-studio-schedule-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const repository = createFileScheduleRepository(root);
  const empty = await repository.get();
  assert.deepEqual(empty.entries, []);

  const first = {
    ...empty,
    entries: [{ gameId: "before-after", mode: "daily", date: "2026-09-03", puzzles: [{ puzzleId: "bridge-001", revision: 1 }] }],
  };
  await repository.save(first);
  assert.deepEqual(await repository.get(), first);

  const second = { ...first, entries: [{ ...first.entries[0], date: "2026-09-04" }] };
  await repository.save(second);
  assert.equal((await readdir(path.join(root, "backups", "schedule"))).length, 1);
  await assert.rejects(repository.save({ ...second, entries: [{ ...second.entries[0], date: "not-a-date" }] }), /real YYYY-MM-DD date/);
});

test("Puzzle Studio is restricted to loopback hosts", () => {
  assert.equal(isLocalStudioHost("localhost:3000"), true);
  assert.equal(isLocalStudioHost("127.0.0.1:3000"), true);
  assert.equal(isLocalStudioHost("[::1]:3000"), true);
  assert.equal(isLocalStudioHost("games.example.com"), false);
});
