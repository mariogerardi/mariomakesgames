import { existsSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source = "public/dual-builder-local";
const hidden = ".dual-builder-local.production-excluded";
const hadSource = existsSync(source);

rmSync(".open-next/assets/dual-builder-local", { recursive: true, force: true });
if (hadSource) renameSync(source, hidden);
try {
  const result = spawnSync("npx", ["--yes", "node@22", "node_modules/sst/bin/sst.mjs", "deploy", "--stage", "production"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  if (hadSource && existsSync(hidden)) renameSync(hidden, source);
}
