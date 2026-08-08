import type { Expl41nSession } from "./engine.mjs";

export type Expl41nMascotState =
  | "idle"
  | "thinking"
  | "frustrated"
  | "confused"
  | "suspicious"
  | "skeptical"
  | "confident"
  | "surprised"
  | "sleepy"
  | "victory"
  | "defeat";

export const EXPL41N_MASCOT_STATES: Expl41nMascotState[];

export function expl41nMascotState(input?: {
  confidence?: number;
  hasAttempt?: boolean;
  isSleepy?: boolean;
  isThinking?: boolean;
  status?: Expl41nSession["status"];
}): Expl41nMascotState;
