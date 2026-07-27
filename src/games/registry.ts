import catalog from "../../catalog.json";
import { beforeAfterManifest } from "./before-after/manifest";
import { decodeManifest } from "./decode/manifest";
import { expl41nManifest } from "./expl41n/manifest";
import { gridlManifest } from "./gridl/manifest";
import { rarityManifest } from "./rarity/manifest";
import { syllablManifest } from "./syllabl/manifest";
import type { GameId, GameManifest } from "./types";

const detailsById: Record<GameId, GameManifest> = {
  syllabl: syllablManifest,
  rarity: rarityManifest,
  gridl: gridlManifest,
  expl41n: expl41nManifest,
  "before-after": beforeAfterManifest,
  decode: decodeManifest,
};

export type HubGame = GameManifest & {
  name: string;
  priority: number;
  session: string;
  role: string;
};

export const hubGames: readonly HubGame[] = catalog.launch.map((entry) => {
  const details = detailsById[entry.id as GameId];
  if (!details) {
    throw new Error(`Missing game manifest for catalog entry: ${entry.id}`);
  }
  return {
    ...details,
    name: entry.name,
    priority: entry.priority,
    session: entry.session,
    role: entry.role,
  };
});

export function getHubGame(id: string): HubGame | undefined {
  return hubGames.find((game) => game.id === id);
}
