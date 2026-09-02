import { access, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const localRoot = resolve(repositoryRoot, ".local/dual-kaikki");
const environment = resolve(localRoot, "wordfreq-venv");
const python = resolve(environment, "bin/python");
const exporter = resolve(repositoryRoot, "scripts/dual/export-wordfreq.py");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repositoryRoot, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

await mkdir(localRoot, { recursive: true });
try {
  await access(python);
} catch {
  run("python3", ["-m", "venv", environment]);
}
run(python, ["-m", "pip", "install", "--disable-pip-version-check", "wordfreq==3.1.1"]);
run(python, [exporter, localRoot]);
