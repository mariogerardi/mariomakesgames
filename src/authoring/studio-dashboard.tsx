"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnyPuzzleDraft, PuzzleSchedule } from "./contracts.mjs";
import { catalogBaselineEntry, studioCatalogCounts } from "./catalog";
import { STUDIO_GAMES } from "./studio-games";
import { StudioTopBar } from "./studio-top-bar";
import { isMeaningfulPuzzleDraft } from "./draft-content.mjs";

const DAY_COUNT = 14;

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function upcomingDays() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: DAY_COUNT }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return { key: dateKey(date), label: offset === 0 ? "Today" : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) };
  });
}

export function StudioDashboard() {
  const [drafts, setDrafts] = useState<AnyPuzzleDraft[]>([]);
  const [schedule, setSchedule] = useState<PuzzleSchedule | null>(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState<ReturnType<typeof upcomingDays>>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDays(upcomingDays());
      Promise.all([
        fetch("/api/studio/drafts").then((response) => response.json()),
        fetch("/api/studio/schedule").then((response) => response.json()),
      ]).then(([draftPayload, schedulePayload]) => {
        setDrafts(draftPayload.drafts ?? []);
        setSchedule(schedulePayload.schedule ?? null);
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load Studio data."));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function coveredMode(game: (typeof STUDIO_GAMES)[number], mode: (typeof STUDIO_GAMES)[number]["dailyModes"][number], date: string) {
    const scheduled = schedule?.entries.find((entry) => entry.gameId === game.id && entry.mode === mode.id && entry.date === date);
    return Boolean((scheduled && scheduled.puzzles.length >= mode.puzzleCount) || catalogBaselineEntry(game.id, mode.id, date));
  }

  function scheduledCount(game: (typeof STUDIO_GAMES)[number]) {
    return days.reduce((count, day) => count + (game.dailyModes.every((mode) => coveredMode(game, mode, day.key)) ? 1 : 0), 0);
  }

  return (
    <>
    <StudioTopBar />
    <main className="studio-dashboard">
      {error && <p className="studio-dashboard-error">{error}</p>}

      <section className="studio-dashboard-section">
        <header><div><p>Games</p><h2>Choose a workspace</h2></div><span>Build, inspect, playtest, and schedule without mixing games together.</span></header>
        <div className="studio-game-grid">
          {STUDIO_GAMES.map((game) => {
            const gameDrafts = drafts.filter((draft) => draft.gameId === game.id && isMeaningfulPuzzleDraft(draft)).length;
            const coverage = scheduledCount(game);
            return (
              <Link className="studio-game-card" href={`/studio/${game.id}`} key={game.id} style={{ "--studio-game-accent": game.accent, "--studio-game-tint": game.tint } as React.CSSProperties}>
                <span className="studio-game-card-mark">{game.shortName}</span>
                <div><small>{game.description}</small><h3>{game.name}</h3></div>
                <dl><div><dt>Drafts</dt><dd>{gameDrafts}</dd></div><div><dt>Catalog</dt><dd>{studioCatalogCounts[game.id]}</dd></div><div><dt>Next 14</dt><dd>{coverage}/{DAY_COUNT}</dd></div></dl>
                <b>Open workspace <span aria-hidden="true">→</span></b>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="studio-dashboard-section studio-coverage-section">
        <header><div><p>Daily coverage</p><h2>What needs a puzzle?</h2></div><span>Catalog-backed dates count as ready until each game’s unique historical run ends.</span></header>
        <div className="studio-coverage-table">
          <div className="studio-coverage-head"><span>Date</span>{STUDIO_GAMES.map((game) => <span key={game.id}>{game.name}</span>)}</div>
          {days.map((day) => (
            <div className="studio-coverage-row" key={day.key}>
              <time dateTime={day.key}><strong>{day.label}</strong><small>{day.key}</small></time>
              {STUDIO_GAMES.map((game) => {
                const filled = game.dailyModes.filter((mode) => coveredMode(game, mode, day.key)).length;
                const complete = filled === game.dailyModes.length;
                return <Link className={complete ? "is-filled" : "is-empty"} href={`/studio/${game.id}?view=schedule&date=${day.key}`} key={game.id}><i aria-hidden="true" />{complete ? "Ready" : game.dailyModes.length > 1 ? `${filled}/${game.dailyModes.length} modes` : "Needs new puzzle"}</Link>;
              })}
            </div>
          ))}
        </div>
      </section>
    </main>
    </>
  );
}
