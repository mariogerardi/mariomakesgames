import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createFilePublishedRepository } from "../../src/authoring/file-published-repository.ts";

function puzzle(revision = 1) {
  return {
    kind: "published-puzzle",
    schemaVersion: 1,
    gameId: "rarity",
    id: "rarity-local-one",
    title: "WEL",
    tags: [],
    summary: "Rarity string WEL",
    revision,
    publishedAt: new Date(2026, 8, revision).toISOString(),
    payload: { puzzleString: "wel", difficulty: null, curatorName: "" },
  };
}

test("published Studio revisions are immutable and listable", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "puzzle-studio-published-"));
  try {
    const repository = createFilePublishedRepository(directory);
    await repository.publish(puzzle());
    await repository.publish(puzzle(2));
    assert.equal((await repository.list("rarity")).length, 2);
    assert.equal((await repository.get("rarity", "rarity-local-one", 1))?.payload.puzzleString, "wel");
    await assert.rejects(() => repository.publish(puzzle()), /cannot be replaced/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
