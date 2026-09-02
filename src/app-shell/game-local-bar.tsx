"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  homeAriaLabel,
  items,
  navigationAriaLabel,
  onHome,
}: {
  ariaLabel: string;
  brand: ReactNode;
  className: string;
  homeAriaLabel?: string;
  items: GameLocalBarItem[];
  navigationAriaLabel?: string;
  onHome: () => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const currentLabel = items.find((item) => item.current)?.label;

  useEffect(() => {
    const currentItem = navRef.current?.querySelector<HTMLElement>("[aria-current='page']");
    const nav = navRef.current;
    if (!currentItem || !nav) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nav.scrollTo({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      left: currentItem.offsetLeft - (nav.clientWidth - currentItem.offsetWidth) / 2,
    });
  }, [currentLabel]);

  return (
    <header className={`game-local-bar ${className}`}>
      <button
        aria-label={homeAriaLabel ?? `Open ${ariaLabel} menu`}
        className="game-local-bar__brand"
        onClick={onHome}
        type="button"
      >
        {brand}
      </button>
      <nav aria-label={navigationAriaLabel ?? `${ariaLabel} navigation`} ref={navRef}>
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
