import type { HubPresentation } from "../app-shell/hub-presentation";
import { BeforeAfterHubMark, BeforeAfterHubPreview, BeforeAfterHubWordmark, beforeAfterHubPreviewAnswer } from "./before-after/hub";
import { DecodeHubMark, DecodeHubPreview, DecodeHubWordmark, decodeHubPreviewAnswer } from "./decode/hub";
import { DualHubMark, DualHubWordmark } from "./dual/hub";
import { Expl41nHubMark, Expl41nHubWordmark } from "./expl41n/hub";
import { GridlHubMark, GridlHubWordmark } from "./gridl/hub";
import { RarityHubMark, RarityHubPreview, RarityHubWordmark, rarityHubPreviewAnswer } from "./rarity/hub";
import { hubGames, type HubGame } from "./registry";
import { SyllablHubMark, SyllablHubPreview, SyllablHubWordmark, syllablHubPreviewAnswer } from "./syllabl/hub";
import { TokenHubMark, TokenHubWordmark } from "./token/hub";
import type { GameId } from "./types";

const presentations: Record<GameId, HubPresentation> = {
  syllabl: { Mark: SyllablHubMark, Wordmark: SyllablHubWordmark, Preview: SyllablHubPreview, previewAnswer: syllablHubPreviewAnswer },
  rarity: { Mark: RarityHubMark, Wordmark: RarityHubWordmark, Preview: RarityHubPreview, previewAnswer: rarityHubPreviewAnswer },
  gridl: { Mark: GridlHubMark, Wordmark: GridlHubWordmark },
  expl41n: { Mark: Expl41nHubMark, Wordmark: Expl41nHubWordmark },
  "before-after": { Mark: BeforeAfterHubMark, Wordmark: BeforeAfterHubWordmark, Preview: BeforeAfterHubPreview, previewAnswer: beforeAfterHubPreviewAnswer },
  decode: { Mark: DecodeHubMark, Wordmark: DecodeHubWordmark, Preview: DecodeHubPreview, previewAnswer: decodeHubPreviewAnswer },
  token: { Mark: TokenHubMark, Wordmark: TokenHubWordmark },
  dual: { Mark: DualHubMark, Wordmark: DualHubWordmark },
};

export type HubDisplayGame = HubGame & { presentation: HubPresentation };

export const hubDisplayGames: readonly HubDisplayGame[] = hubGames.map((game) => ({
  ...game,
  presentation: presentations[game.id],
}));

const temporarilyHiddenGridGames = new Set<GameId>(["gridl", "expl41n"]);

/** Games currently promoted in the homepage collection grid. */
export const hubGridGames = hubDisplayGames.filter(
  (game) => !temporarilyHiddenGridGames.has(game.id),
);

export const hubPreviewGames = hubDisplayGames.filter(
  (game): game is HubDisplayGame & { presentation: HubPresentation & Required<Pick<HubPresentation, "Preview" | "previewAnswer">> } =>
    Boolean(game.presentation.Preview && game.presentation.previewAnswer),
);
