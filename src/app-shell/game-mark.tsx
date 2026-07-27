import type { HubGame } from "../games/registry";

type GameMarkProps = {
  game: HubGame;
  size?: "small" | "large";
};

export function GameMark({ game, size = "small" }: GameMarkProps) {
  return (
    <div
      aria-hidden="true"
      className={`game-mark game-mark-${size}`}
      data-game={game.id}
    >
      {game.symbol}
    </div>
  );
}
