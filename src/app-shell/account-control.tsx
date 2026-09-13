"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";

export function AccountControl() {
  const { enabled, ready, session, player, presentation, signIn, signUp, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!enabled) return null;
  if (!ready) {
    if (presentation) {
      return (
        <div className="account-control account-control--authenticated account-control--pending">
          {presentation.isAdmin ? <Link className="account-studio-link" href="/studio">Puzzle Studio</Link> : null}
          <button aria-label={`${presentation.label}, loading account`} className="account-button account-button--signed-in" disabled type="button">
            <span className="account-avatar" aria-hidden="true">{presentation.label.slice(0, 1).toUpperCase()}</span>
            <span>{presentation.label}</span>
          </button>
        </div>
      );
    }
    return (
      <div className="account-control account-control--guest account-control--loading" aria-label="Loading account">
        <span className="account-link">Sign in</span>
        <span className="account-button">Create account</span>
      </div>
    );
  }

  if (session.kind !== "authenticated") {
    return (
      <div className="account-control account-control--guest">
        <button type="button" className="account-link" onClick={() => void signIn()}>Sign in</button>
        <button type="button" className="account-button" onClick={() => void signUp()}>Create account</button>
      </div>
    );
  }

  const label = player?.displayName || presentation?.label || session.email?.split("@")[0] || "Account";
  return (
    <div className="account-control account-control--authenticated" ref={rootRef}>
      {session.roles.includes("admin") ? (
        <Link className="account-studio-link" href="/studio">Puzzle Studio</Link>
      ) : null}
      <button
        type="button"
        className="account-button account-button--signed-in"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
        <span>{label}</span>
      </button>
      {open ? (
        <div className="account-menu" role="menu">
          <p>{label}</p>
          {session.email ? <small>{session.email}</small> : null}
          {session.roles.includes("admin") ? <span>Admin</span> : null}
          {session.roles.includes("admin") ? (
            <Link href="/studio" role="menuitem">Open Puzzle Studio</Link>
          ) : null}
          <Link href="/account" role="menuitem">Account settings</Link>
          <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
        </div>
      ) : null}
    </div>
  );
}
