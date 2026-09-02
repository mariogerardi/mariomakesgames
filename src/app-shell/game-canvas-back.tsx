"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { gameStorageKey } from "../platform/storage";
import {
  DEFAULT_DUAL_INTERFACE_LANGUAGE,
  DUAL_INTERFACE_LANGUAGE_EVENT,
  parseDualInterfaceLanguage,
  type DualInterfaceLanguage,
} from "../games/dual/language.mjs";

const DUAL_LANGUAGE_KEY = gameStorageKey("dual", "interface-language");

export function GameCanvasBack({ gameId }: { gameId: string }) {
  const [dualLanguage, setDualLanguage] = useState<DualInterfaceLanguage>(DEFAULT_DUAL_INTERFACE_LANGUAGE);

  useEffect(() => {
    if (gameId !== "dual") return;
    queueMicrotask(() => setDualLanguage(parseDualInterfaceLanguage(localStorage.getItem(DUAL_LANGUAGE_KEY))));
    const syncLanguage = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      setDualLanguage(parseDualInterfaceLanguage(next));
    };
    window.addEventListener(DUAL_INTERFACE_LANGUAGE_EVENT, syncLanguage);
    return () => window.removeEventListener(DUAL_INTERFACE_LANGUAGE_EVENT, syncLanguage);
  }, [gameId]);

  const spanish = gameId === "dual" && dualLanguage === "es";
  return (
    <Link className="game-canvas-back" href="/#games" aria-label={spanish ? "Volver a todos los juegos" : "Back to all games"}>
      <span aria-hidden="true">←</span>
      {spanish ? "Juegos" : "Games"}
    </Link>
  );
}
