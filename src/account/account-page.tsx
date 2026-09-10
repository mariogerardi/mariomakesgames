"use client";

import { FormEvent, useEffect, useState } from "react";
import type { CurrentPlayer } from "../platform/identity.mjs";
import { authenticatedApiFetch } from "../platform/authenticated-fetch";
import { useAuth } from "../app-shell/auth-provider";

export function AccountPage() {
  const { enabled, ready, session, player: currentPlayer, updatePlayer, signIn, signOut } = useAuth();
  const [player, setPlayer] = useState<CurrentPlayer | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("Loading your account…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || session.kind !== "authenticated") return;
    if (currentPlayer) {
      const sync = window.setTimeout(() => {
        setPlayer(currentPlayer);
        setDisplayName(currentPlayer.displayName ?? "");
        setStatus((current) => current === "Loading your account…" ? "" : current);
      }, 0);
      return () => window.clearTimeout(sync);
    }
    let active = true;
    authenticatedApiFetch("/v1/me")
      .then(async (response) => {
        if (!response.ok) throw new Error("Your account could not be loaded.");
        const current = await response.json() as CurrentPlayer;
        if (!active) return;
        setPlayer(current);
        setDisplayName(current.displayName ?? "");
        setStatus("");
      })
      .catch((error: unknown) => {
        if (active) setStatus(error instanceof Error ? error.message : "Your account could not be loaded.");
      });
    return () => { active = false; };
  }, [currentPlayer, ready, session]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      const response = await authenticatedApiFetch("/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      const payload = await response.json() as CurrentPlayer | { error?: string };
      if (!response.ok) throw new Error("error" in payload && payload.error ? payload.error : "Profile could not be saved.");
      const updated = payload as CurrentPlayer;
      setPlayer(updated);
      updatePlayer(updated);
      setDisplayName(updated.displayName ?? "");
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!enabled) return <AccountState title="Accounts aren’t configured." />;
  if (!ready) return <AccountState title="Loading your account…" />;
  if (session.kind !== "authenticated") return <AccountState title="Sign in to see your account." action={() => void signIn()} />;

  return (
    <main className="account-page page-width">
      <header>
        <p className="eyebrow">Your account</p>
        <h1>{player?.displayName || "Make it yours."}</h1>
        <p>Your games and identity will meet here as the collection grows.</p>
      </header>
      <section className="account-card">
        <form onSubmit={saveProfile}>
          <label htmlFor="display-name">Display name</label>
          <div className="account-field-row">
            <input
              id="display-name"
              maxLength={50}
              placeholder="What should we call you?"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <button type="submit" disabled={!player || saving}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
        <dl>
          <div><dt>Email</dt><dd>{player?.email || session.email || "—"}</dd></div>
          <div><dt>Access</dt><dd>{player?.roles.includes("admin") ? "Administrator" : "Player"}</dd></div>
          <div><dt>Member since</dt><dd>{player ? new Date(player.createdAt).toLocaleDateString() : "—"}</dd></div>
        </dl>
        {status ? <p className="account-status" aria-live="polite">{status}</p> : null}
        <button className="account-signout" type="button" onClick={signOut}>Sign out</button>
      </section>
    </main>
  );
}

function AccountState({ title, action }: { title: string; action?: () => void }) {
  return (
    <main className="account-page account-page--state page-width">
      <h1>{title}</h1>
      {action ? <button type="button" onClick={action}>Sign in</button> : null}
    </main>
  );
}
