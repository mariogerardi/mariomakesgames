"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { themeCookieName, validGameTheme, type ThemedGame } from "./game-theme";
import { gameStorageKey } from "./storage";

const InitialTheme = createContext<string | null>(null);
export function GameThemeProvider({ theme, children }: { theme: string | null; children: ReactNode }) {
  return <InitialTheme.Provider value={theme}>{children}</InitialTheme.Provider>;
}

export function useGameTheme<T extends string>(game: ThemedGame, fallback: T) {
  const initial = useContext(InitialTheme);
  const [theme, setTheme] = useState<T>(() => (validGameTheme(game, initial) as T | null) ?? fallback);
  const [restored, setRestored] = useState<false | "settling" | true>(false);
  useLayoutEffect(() => {
    const cookie = document.cookie.split('; ').find(item => item.startsWith(`${themeCookieName(game)}=`))?.split('=')[1];
    let saved = validGameTheme(game, cookie);
    if (!saved) {
      try { saved = validGameTheme(game, localStorage.getItem(gameStorageKey(game, "theme"))); } catch { /* Optional device storage. */ }
    }
    if (saved) {
      // This synchronous layout update intentionally prevents painting a stale
      // prefetched theme or a legacy localStorage preference during hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(saved as T);
      document.cookie = `${themeCookieName(game)}=${saved}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }
    // Paint the restored palette without transitions, then enable normal UI motion.
    setRestored("settling");
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setRestored(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [game]);

  function selectTheme(next: T) {
    if (!validGameTheme(game, next)) return;
    setTheme(next);
    document.cookie = `${themeCookieName(game)}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    try { localStorage.setItem(gameStorageKey(game, "theme"), next); } catch { /* Cookie still preserves the preference. */ }
  }
  return [theme, selectTheme, restored] as const;
}
