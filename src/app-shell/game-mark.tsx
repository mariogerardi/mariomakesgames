import type { HubDisplayGame } from "../games/hub-registry";

type GameMarkProps = {
  game: HubDisplayGame;
  size?: "small" | "large";
};

export function GameMark({ game, size = "small" }: GameMarkProps) {
  const Mark = game.presentation.Mark;
  return (
    <div
      aria-hidden="true"
      className={`game-mark game-mark-${size}`}
      data-game={game.id}
    >
      <Mark />
    </div>
  );
}
