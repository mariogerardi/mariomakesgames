"use client";

import { useEffect, useState } from "react";
import { authenticatedApiFetch } from "../platform/authenticated-fetch";
import { useAuth } from "./auth-provider";

type Verification = { playerId: string; result: "allowed" | "denied" } | null;

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { enabled, ready, session, signIn } = useAuth();
  const [verification, setVerification] = useState<Verification>(null);

  useEffect(() => {
    if (!ready || session.kind !== "authenticated" || !session.roles.includes("admin")) return;
    let active = true;
    authenticatedApiFetch("/v1/admin/ping")
      .then((response) => {
        if (active) setVerification({ playerId: session.playerId, result: response.ok ? "allowed" : "denied" });
      })
      .catch(() => {
        if (active) setVerification({ playerId: session.playerId, result: "denied" });
      });
    return () => { active = false; };
  }, [ready, session]);

  if (!enabled) return <AccessPanel title="Accounts aren’t configured." detail="Connect the development auth stack to use Puzzle Studio." />;
  if (!ready) return <AccessPanel title="Checking your account…" detail="One moment." />;
  if (session.kind !== "authenticated") {
    return <AccessPanel title="Sign in to open Puzzle Studio." detail="This workspace is restricted to its administrator." action={() => void signIn()} />;
  }
  if (!session.roles.includes("admin")) return <AccessPanel title="Administrator access required." detail="This account can play games, but it cannot open Puzzle Studio." />;
  if (!verification || verification.playerId !== session.playerId) return <AccessPanel title="Verifying administrator access…" detail="One moment." />;
  if (verification.result === "denied") return <AccessPanel title="Administrator access couldn’t be verified." detail="Sign out and back in, then try again." />;
  return children;
}

function AccessPanel({ title, detail, action }: { title: string; detail: string; action?: () => void }) {
  return (
    <main className="access-panel">
      <section>
        <span className="wordmark-monogram" aria-hidden="true">PS</span>
        <h1>{title}</h1>
        <p>{detail}</p>
        {action ? <button type="button" onClick={action}>Sign in</button> : null}
      </section>
    </main>
  );
}
