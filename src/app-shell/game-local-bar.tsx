import type { ReactNode } from "react";

export type GameLocalBarItem = {
  current?: boolean;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
};

export function GameLocalBar({
  ariaLabel,
  brand,
  className,
  items,
  onHome,
}: {
  ariaLabel: string;
  brand: ReactNode;
  className: string;
  items: GameLocalBarItem[];
  onHome: () => void;
}) {
  return (
    <header className={`game-local-bar ${className}`}>
      <button
        aria-label={`Open ${ariaLabel} menu`}
        className="game-local-bar__brand"
        onClick={onHome}
        type="button"
      >
        {brand}
      </button>
      <nav aria-label={`${ariaLabel} navigation`}>
        {items.map((item) => (
          <button
            aria-current={item.current ? "page" : undefined}
            className={item.current ? "is-current" : ""}
            disabled={item.disabled}
            key={item.label}
            onClick={item.onSelect}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
