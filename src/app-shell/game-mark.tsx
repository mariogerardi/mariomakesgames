import Image from "next/image";
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
      {game.id === "syllabl" ? (
        <span className="syllabl-collection-monogram">
          <span>sy</span><i>·</i>
        </span>
      ) : game.id === "rarity" ? (
        <Image
          className="rarity-collection-gem"
          alt=""
          height={600}
          src="/rarity/logo.png"
          width={600}
        />
      ) : game.id === "gridl" ? (
        <span className="gridl-collection-grid">
          <i className="is-fragment">gr</i>
          <i />
          <i className="is-blocked" />
          <i className="is-goal">★</i>
        </span>
      ) : game.id === "expl41n" ? (
        <Image
          alt=""
          className="expl41n-collection-mascot"
          height={512}
          src="/expl41n/mascot/idle.png"
          width={512}
        />
      ) : game.id === "before-after" ? (
        <span className="before-after-collection-mark">
          <i>b</i><b>&amp;</b><i>a</i>
        </span>
      ) : game.id === "decode" ? (
        <span className="decode-collection-mark">
          <i>D</i>
        </span>
      ) : game.id === "token" ? (
        <span className="token-collection-mark">T<i /></span>
      ) : game.id === "dual" ? (
        <span className="dual-collection-mark"><i>EN</i><b>ES</b></span>
      ) : game.symbol}
    </div>
  );
}
