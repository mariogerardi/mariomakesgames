import type { GameManifest } from "../types";

export const gridlManifest = {
  id: "gridl",
  symbol: "GR",
  eyebrow: "a word game with a map",
  description:
    "route fragments from seed to star, threading crossings, blockers, recalls, and portals.",
  mechanics: ["31 authored levels", "Spatial words", "Chase par"],
  stage: "playable",
} as const satisfies GameManifest;
