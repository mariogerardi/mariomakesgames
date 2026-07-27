import type { GameManifest } from "../types";

export const gridlManifest = {
  id: "gridl",
  symbol: "GR",
  eyebrow: "A word game with a map",
  description:
    "Route fragments from seed to star, threading crossings, blockers, recalls, and portals.",
  mechanics: ["Handmade levels", "Spatial words", "Chase par"],
  stage: "queued",
} as const satisfies GameManifest;
