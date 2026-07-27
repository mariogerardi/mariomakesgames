import fs from "node:fs";
import path from "node:path";
import { repositoryRoot } from "../../src/support/paths.mjs";

export function readFixture(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "fixtures", relativePath), "utf8"),
  );
}
