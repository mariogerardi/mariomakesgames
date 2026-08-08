import { expl41nAvatarMood } from "./engine.mjs";

export const EXPL41N_MASCOT_STATES = [
  "idle",
  "thinking",
  "frustrated",
  "confused",
  "suspicious",
  "skeptical",
  "confident",
  "surprised",
  "sleepy",
  "victory",
  "defeat",
];

const MOOD_TO_MASCOT = {
  angry: "frustrated",
  confused: "confused",
  suspicious: "suspicious",
  "side-eye": "skeptical",
  happy: "confident",
  surprised: "surprised",
  victory: "victory",
  sad: "defeat",
};

export function expl41nMascotState({
  confidence = 0,
  hasAttempt = false,
  isSleepy = false,
  isThinking = false,
  status = "active",
} = {}) {
  if (isThinking) return "thinking";
  if (status === "won") return "victory";
  if (status === "lost") return "defeat";
  if (isSleepy) return "sleepy";
  if (!hasAttempt) return "idle";
  const mood = expl41nAvatarMood(confidence, status);
  return MOOD_TO_MASCOT[mood] || "idle";
}
