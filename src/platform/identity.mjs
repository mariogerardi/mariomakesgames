export const PLAYER_ROLES = Object.freeze(["player", "admin"]);

export function createGuestAuthSession() {
  return Object.freeze({ kind: "guest" });
}

export function isAuthenticatedSession(session) {
  return Boolean(
    session
      && session.kind === "authenticated"
      && typeof session.playerId === "string"
      && session.playerId.length > 0
      && typeof session.accessToken === "string"
      && session.accessToken.length > 0
      && Number.isFinite(session.expiresAt)
      && Array.isArray(session.roles)
      && session.roles.every((role) => PLAYER_ROLES.includes(role)),
  );
}

export function hasPlayerRole(session, role) {
  return isAuthenticatedSession(session) && session.roles.includes(role);
}
