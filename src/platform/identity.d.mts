export type PlayerRole = "player" | "admin";

export type GuestAuthSession = {
  kind: "guest";
};

export type AuthenticatedAuthSession = {
  kind: "authenticated";
  playerId: string;
  accessToken: string;
  idToken?: string;
  expiresAt: number;
  email?: string;
  roles: PlayerRole[];
};

export type AuthSession = GuestAuthSession | AuthenticatedAuthSession;

export type CurrentPlayer = {
  id: string;
  email: string;
  displayName: string | null;
  handle: string | null;
  roles: PlayerRole[];
  createdAt: string;
  updatedAt: string;
};

export interface PlayerRepository {
  getCurrent(): Promise<CurrentPlayer | null>;
  saveCurrent(player: CurrentPlayer): Promise<CurrentPlayer>;
}

export const PLAYER_ROLES: readonly PlayerRole[];
export function createGuestAuthSession(): GuestAuthSession;
export function isAuthenticatedSession(session: AuthSession | null | undefined): session is AuthenticatedAuthSession;
export function hasPlayerRole(session: AuthSession | null | undefined, role: PlayerRole): boolean;
