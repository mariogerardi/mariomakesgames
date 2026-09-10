import type { AuthenticatedAuthSession, CurrentPlayer } from "./identity.mjs";

export const AUTH_PRESENTATION_COOKIE = "mg-auth-presentation";

export type AuthPresentation = {
  playerId: string;
  label: string;
  isAdmin: boolean;
};

export function authPresentation(
  session: AuthenticatedAuthSession,
  player: CurrentPlayer | null,
): AuthPresentation {
  const displayName = player?.displayName?.trim();
  return {
    playerId: session.playerId,
    label: displayName || session.email?.split("@")[0] || "Account",
    isAdmin: session.roles.includes("admin"),
  };
}

export function parseAuthPresentation(value: string | null | undefined): AuthPresentation | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<AuthPresentation>;
    const label = typeof parsed.label === "string" ? parsed.label.trim().slice(0, 80) : "";
    if (typeof parsed.playerId !== "string" || !parsed.playerId || !label || typeof parsed.isAdmin !== "boolean") return null;
    return { playerId: parsed.playerId, label, isAdmin: parsed.isAdmin };
  } catch {
    return null;
  }
}

export function writeAuthPresentation(value: AuthPresentation | null) {
  if (typeof document === "undefined") return;
  if (!value) {
    document.cookie = `${AUTH_PRESENTATION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  const encoded = encodeURIComponent(JSON.stringify(value));
  document.cookie = `${AUTH_PRESENTATION_COOKIE}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
