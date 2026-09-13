"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AuthSession, CurrentPlayer } from "../platform/identity.mjs";
import { createGuestAuthSession } from "../platform/identity.mjs";
import { browserAuthClient } from "../platform/auth-client";
import { authenticatedApiFetch } from "../platform/authenticated-fetch";
import { authPresentation, writeAuthPresentation, type AuthPresentation } from "../platform/auth-presentation";

type AuthContextValue = {
  enabled: boolean;
  ready: boolean;
  session: AuthSession;
  player: CurrentPlayer | null;
  presentation: AuthPresentation | null;
  updatePlayer: (player: CurrentPlayer) => void;
  signIn: () => Promise<void>;
  signUp: () => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children, initialPresentation = null }: { children: React.ReactNode; initialPresentation?: AuthPresentation | null }) {
  const [session, setSession] = useState<AuthSession>(() => createGuestAuthSession());
  const [player, setPlayer] = useState<CurrentPlayer | null>(null);
  const [presentation, setPresentation] = useState<AuthPresentation | null>(initialPresentation);
  const [ready, setReady] = useState(!browserAuthClient.enabled);
  const refreshId = useRef(0);
  const presentationRef = useRef(initialPresentation);

  const refresh = useCallback(async () => {
    const requestId = ++refreshId.current;
    const nextSession = await browserAuthClient.getValidSession();
    if (requestId !== refreshId.current) return;
    if (nextSession.kind === "authenticated") {
      let profile: CurrentPlayer | null = null;
      let profileLoaded = false;
      try {
        const response = await authenticatedApiFetch("/v1/me", {}, nextSession.playerId);
        if (response.ok) {
          profile = await response.json() as CurrentPlayer;
          profileLoaded = true;
        }
      } catch { /* Keep the last stable presentation during a transient profile failure. */ }
      if (requestId !== refreshId.current) return;
      const previous = presentationRef.current?.playerId === nextSession.playerId ? presentationRef.current : null;
      const nextPresentation = profileLoaded
        ? authPresentation(nextSession, profile)
        : previous ?? authPresentation(nextSession, null);
      setSession(nextSession);
      setPlayer(profile);
      setPresentation(nextPresentation);
      presentationRef.current = nextPresentation;
      writeAuthPresentation(nextPresentation);
    } else {
      setSession(nextSession);
      setPlayer(null);
      setPresentation(null);
      presentationRef.current = null;
      writeAuthPresentation(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    window.addEventListener("mariomakesgames:auth-change", refresh);
    const storageChanged = (event: StorageEvent) => { if (event.key === "mariomakesgames.auth.session.v1" || event.key === null) void refresh(); };
    window.addEventListener("storage", storageChanged);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("mariomakesgames:auth-change", refresh);
      window.removeEventListener("storage", storageChanged);
      refreshId.current += 1;
    };
  }, [refresh]);

  const updatePlayer = useCallback((nextPlayer: CurrentPlayer) => {
    setPlayer(nextPlayer);
    if (session.kind === "authenticated") {
      const nextPresentation = authPresentation(session, nextPlayer);
      setPresentation(nextPresentation);
      presentationRef.current = nextPresentation;
      writeAuthPresentation(nextPresentation);
    }
  }, [session]);

  const value = useMemo<AuthContextValue>(() => ({
    enabled: browserAuthClient.enabled,
    ready,
    session,
    player,
    presentation,
    updatePlayer,
    signIn: () => browserAuthClient.signIn(),
    signUp: () => browserAuthClient.signUp(),
    signOut: () => browserAuthClient.signOut(),
  }), [player, presentation, ready, session, updatePlayer]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
