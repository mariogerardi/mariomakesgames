import type { ComponentType } from "react";
import type { GameId } from "../games/types";

export type HubPreviewPhase = "idle" | "typing" | "submitted" | "feedback";

export type HubPreviewState = {
  phase: HubPreviewPhase;
  typedAnswer: string;
};

export type HubPreviewProps = HubPreviewState & {
  instance: number;
  registerCard: (
    gameId: GameId,
    instance: number,
    card: HTMLDivElement | null,
  ) => void;
};

export type HubPresentation = {
  Mark: ComponentType;
  Wordmark: ComponentType;
  Preview?: ComponentType<HubPreviewProps>;
  previewAnswer?: string;
};
