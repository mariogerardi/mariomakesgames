import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  repositoryRoot,
  resolveDeveloperPath,
} from "../src/support/paths.mjs";

const lock = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "sources.lock.json"), "utf8"),
);

for (const source of lock.sources) {
  assert.match(source.revision, /^[0-9a-f]{40}$/);
  if (!source.localPathFromDeveloperRoot) continue;

  const sourcePath = resolveDeveloperPath(source.localPathFromDeveloperRoot);
  if (!fs.existsSync(sourcePath)) {
    console.log(
      `${source.gameId}: legacy checkout not present at ${sourcePath}; skipping lock verification.`,
    );
    continue;
  }

  if (!fs.existsSync(path.join(sourcePath, ".git"))) {
    console.log(
      `${source.gameId}: path exists but is not a Git repository at ${sourcePath}; skipping lock verification.`,
    );
    continue;
  }

  const actualRevision = execFileSync(
    "git",
    ["-C", sourcePath, "rev-parse", "HEAD"],
    { encoding: "utf8" },
  ).trim();

  assert.equal(
    actualRevision,
    source.revision,
    `${source.gameId}: source revision changed; audit and update the lock intentionally`,
  );
}

console.log("Source lock check passed for all available legacy repositories.");
