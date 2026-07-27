import type { GameManifest } from "../types";

export const gridlManifest = {
  id: "gridl",
  symbol: "GR",
  eyebrow: "A word game with a map",
  description:
    "Route fragments from seed to star, threading crossings, blockers, recalls, and portals.",
  mechanics: ["31 authored levels", "Spatial words", "Chase par"],
  stage: "playable",
} as const satisfies GameManifest;
