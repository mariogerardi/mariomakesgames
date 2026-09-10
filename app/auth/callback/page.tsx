"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserAuthClient } from "../../../src/platform/auth-client";

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    browserAuthClient.handleRedirect()
      .then(({ returnTo }) => window.location.replace(returnTo))
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Sign-in could not be completed.");
      });
    return () => { active = false; };
  }, []);

  return (
    <main className="auth-callback">
      <section aria-live="polite">
        <span className="wordmark-monogram" aria-hidden="true">m!</span>
        <h1>{error ? "Sign-in hit a snag." : "Signing you in…"}</h1>
        <p>{error ?? "One moment while we finish securely connecting your account."}</p>
        {error ? <Link href="/">Back to the Hub</Link> : null}
      </section>
    </main>
  );
}
