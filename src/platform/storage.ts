import type { GameId } from "../games/types";

const HUB_STORAGE_PREFIX = "mg-games";

export function gameStorageKey(
  gameId: GameId,
  namespace: string,
  version = 1,
): string {
  const safeNamespace = namespace.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safeNamespace)) {
    throw new Error(`Invalid game storage namespace: ${namespace}`);
  }
  return `${HUB_STORAGE_PREFIX}:v${version}:${gameId}:${safeNamespace}`;
}

export type DeviceStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
