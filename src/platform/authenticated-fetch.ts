import { browserAuthConfig } from "./auth-config";
import { browserAuthClient } from "./auth-client";

export async function authenticatedApiFetch(path: string, init: RequestInit = {}, expectedPlayerId?: string) {
  const session = await browserAuthClient.getValidSession();
  if (session.kind !== "authenticated" || (expectedPlayerId && session.playerId !== expectedPlayerId)) {
    throw Object.assign(new Error("Sign in to the original account to sync this save."), { status: 401 });
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${session.idToken ?? session.accessToken}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${browserAuthConfig.apiBaseUrl}${normalizeApiPath(path)}`, { ...init, signal: init.signal ?? AbortSignal.timeout(10_000), headers });
}

function normalizeApiPath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
