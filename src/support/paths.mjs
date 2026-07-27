import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repositoryRoot = path.resolve(moduleDirectory, "../..");
export const developerRoot =
  process.env.GAMES_DEVELOPER_ROOT || path.resolve(repositoryRoot, "..");

export function resolveDeveloperPath(relativePath) {
  return path.resolve(developerRoot, relativePath);
}
