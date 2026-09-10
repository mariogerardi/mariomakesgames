import type { AuthenticatedAuthSession, AuthSession, PlayerRole } from "./identity.mjs";
import { createGuestAuthSession } from "./identity.mjs";
import { browserAuthConfig, browserAuthEnabled } from "./auth-config";
import { writeAuthPresentation } from "./auth-presentation";

const SESSION_KEY = "mariomakesgames.auth.session.v1";
const PKCE_KEY = "mariomakesgames.auth.pkce.v1";
const CLOCK_SKEW_MS = 60_000;
let refreshing: Promise<AuthSession> | null = null;

type StoredAuthSession = AuthenticatedAuthSession & {
  idToken: string;
  refreshToken?: string;
};

type PkceState = {
  verifier: string;
  state: string;
  returnTo: string;
};

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export type AuthRedirectResult = {
  session: AuthenticatedAuthSession;
  returnTo: string;
};

export const browserAuthClient = {
  enabled: browserAuthEnabled,

  getSession(): AuthSession {
    return readStoredSession() ?? createGuestAuthSession();
  },

  async getValidSession(): Promise<AuthSession> {
    const stored = readStoredSession();
    if (!stored) return createGuestAuthSession();
    if (stored.expiresAt > Date.now()) return stored;
    if (!stored.refreshToken || !browserAuthEnabled) {
      clearSession();
      return createGuestAuthSession();
    }

    if (refreshing) {
      await refreshing;
      const current = readStoredSession();
      if (!current) return createGuestAuthSession();
      if (current.playerId !== stored.playerId) return this.getValidSession();
      return current;
    }
    const refreshToken = stored.refreshToken;
    refreshing = (async () => { try {
      const payload = await requestTokens({
        grant_type: "refresh_token",
        client_id: browserAuthConfig.cognitoUserPoolClientId,
        refresh_token: refreshToken,
      });
      const refreshed = sessionFromTokens(payload, stored.refreshToken);
      if (readStoredSession()?.refreshToken !== stored.refreshToken) return createGuestAuthSession();
      writeSession(refreshed);
      return refreshed;
    } catch (error) {
      // A network outage must not turn an account's pending saves into guest saves.
      if (error instanceof Error && "status" in error && error.status === 400) {
        if (readStoredSession()?.refreshToken === stored.refreshToken) clearSession();
        return createGuestAuthSession();
      }
      return readStoredSession()?.playerId === stored.playerId ? stored : createGuestAuthSession();
    } finally { refreshing = null; } })();
    return refreshing;
  },

  async signIn(returnTo = currentPath()) {
    await beginHostedAuth("login", returnTo);
  },

  async signUp(returnTo = currentPath()) {
    await beginHostedAuth("signup", returnTo);
  },

  async handleRedirect(): Promise<AuthRedirectResult> {
    if (!browserAuthEnabled) throw new Error("Account sign-in is not configured.");
    const url = new URL(window.location.href);
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (error) throw new Error(error);

    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const pkce = readPkceState();
    if (!code || !returnedState || !pkce || returnedState !== pkce.state) {
      clearPkceState();
      throw new Error("Sign-in could not be verified. Please try again.");
    }

    try {
      const payload = await requestTokens({
        grant_type: "authorization_code",
        client_id: browserAuthConfig.cognitoUserPoolClientId,
        code,
        redirect_uri: callbackUrl(),
        code_verifier: pkce.verifier,
      });
      const session = sessionFromTokens(payload);
      writeSession(session);
      return { session, returnTo: safeReturnPath(pkce.returnTo) };
    } finally {
      clearPkceState();
    }
  },

  signOut() {
    clearSession();
    if (!browserAuthEnabled) return;
    const params = new URLSearchParams({
      client_id: browserAuthConfig.cognitoUserPoolClientId,
      logout_uri: window.location.origin,
    });
    // Cognito is an external OAuth endpoint, despite the rule's relative-URL inference.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`${browserAuthConfig.cognitoDomain}/logout?${params.toString()}`);
  },
};

async function beginHostedAuth(mode: "login" | "signup", returnTo: string) {
  if (!browserAuthEnabled) throw new Error("Account sign-in is not configured.");
  const verifier = randomString(64);
  const state = randomString(32);
  const challenge = await pkceChallenge(verifier);
  writePkceState({ verifier, state, returnTo: safeReturnPath(returnTo) });

  const params = new URLSearchParams({
    client_id: browserAuthConfig.cognitoUserPoolClientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: callbackUrl(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });
  // Cognito is an external OAuth endpoint, despite the rule's relative-URL inference.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`${browserAuthConfig.cognitoDomain}/${mode}?${params.toString()}`);
}

async function requestTokens(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${browserAuthConfig.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => null) as TokenResponse | null;
  if (!response.ok || !payload) throw Object.assign(new Error("Cognito could not complete sign-in."), { status: response.status });
  return payload;
}

function sessionFromTokens(payload: TokenResponse, fallbackRefreshToken?: string): StoredAuthSession {
  const accessToken = payload.access_token;
  const idToken = payload.id_token;
  if (!accessToken || !idToken) throw new Error("The sign-in response was incomplete.");

  const claims = readJwtClaims(idToken);
  const playerId = stringClaim(claims, "sub");
  if (!playerId) throw new Error("The sign-in response did not identify a player.");

  return {
    kind: "authenticated",
    playerId,
    accessToken,
    idToken,
    refreshToken: payload.refresh_token ?? fallbackRefreshToken,
    expiresAt: Date.now() + Math.max(0, Number(payload.expires_in ?? 3600) * 1000 - CLOCK_SKEW_MS),
    email: stringClaim(claims, "email") ?? undefined,
    roles: playerRoles(claims),
  };
}

function readStoredSession(): StoredAuthSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredAuthSession;
    return value.kind === "authenticated" && value.playerId && value.accessToken && value.idToken
      ? value
      : null;
  } catch {
    clearSession();
    return null;
  }
}

function writeSession(session: StoredAuthSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("mariomakesgames:auth-change"));
}

function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  writeAuthPresentation(null);
  window.dispatchEvent(new Event("mariomakesgames:auth-change"));
}

function writePkceState(value: PkceState) {
  window.sessionStorage.setItem(PKCE_KEY, JSON.stringify(value));
}

function readPkceState(): PkceState | null {
  try {
    const raw = window.sessionStorage.getItem(PKCE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PkceState>;
    return value.verifier && value.state && value.returnTo
      ? value as PkceState
      : null;
  } catch {
    return null;
  }
}

function clearPkceState() {
  window.sessionStorage.removeItem(PKCE_KEY);
}

function readJwtClaims(token: string): Record<string, unknown> {
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return {};
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function playerRoles(claims: Record<string, unknown>): PlayerRole[] {
  const groups = claims["cognito:groups"];
  const values = Array.isArray(groups) ? groups : typeof groups === "string" ? groups.split(",") : [];
  return values.includes("admin") ? ["player", "admin"] : ["player"];
}

function stringClaim(claims: Record<string, unknown>, name: string) {
  return typeof claims[name] === "string" ? claims[name] : null;
}

function callbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

function currentPath() {
  return typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
}

function safeReturnPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function randomString(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function pkceChallenge(verifier: string) {
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
