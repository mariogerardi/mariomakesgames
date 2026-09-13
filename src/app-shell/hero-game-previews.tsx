"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hubPreviewGames } from "../games/hub-registry";
import type { GameId } from "../games/types";
import type { HubPreviewState } from "./hub-presentation";

const idlePreview: HubPreviewState = { phase: "idle", typedAnswer: "" };

function previewKey(gameId: GameId, instance: number) {
  return `${gameId}:${instance}`;
}

function useCarouselPreviewController() {
  const cards = useRef(new Map<string, HTMLDivElement>());
  const timers = useRef(new Map<GameId, ReturnType<typeof setTimeout>[]>());
  const hasRun = useRef(new Set<GameId>());
  const animationFrame = useRef(0);
  const [states, setStates] = useState<Record<string, HubPreviewState>>({});
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduceMotion(query.matches);
    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  const clearPreviewTimers = useCallback((gameId: GameId) => {
    for (const timer of timers.current.get(gameId) ?? []) clearTimeout(timer);
    timers.current.delete(gameId);
  }, []);

  const resetPreview = useCallback((gameId: GameId) => {
    clearPreviewTimers(gameId);
    hasRun.current.delete(gameId);
    setStates((current) => {
      if (!(gameId in current)) return current;
      const next = { ...current };
      delete next[gameId];
      return next;
    });
  }, [clearPreviewTimers]);

  const startPreview = useCallback((gameId: GameId, answer: string) => {
    if (hasRun.current.has(gameId)) return;
    hasRun.current.add(gameId);
    clearPreviewTimers(gameId);

    const scheduled: ReturnType<typeof setTimeout>[] = [];
    // Let the card settle near the center before beginning its playthrough.
    // The completed state intentionally has no timer: it remains until this
    // physical carousel card has left the gallery.
    const startDelay = 1400;
    const characterDelay = 110;

    for (let index = 1; index <= answer.length; index += 1) {
      scheduled.push(setTimeout(() => {
        setStates((current) => ({
          ...current,
          [gameId]: { phase: "typing", typedAnswer: answer.slice(0, index) },
        }));
      }, startDelay + index * characterDelay));
    }

    const submittedAt = startDelay + answer.length * characterDelay + 420;
    scheduled.push(setTimeout(() => {
      setStates((current) => ({ ...current, [gameId]: { phase: "submitted", typedAnswer: answer } }));
    }, submittedAt));
    scheduled.push(setTimeout(() => {
      setStates((current) => ({ ...current, [gameId]: { phase: "feedback", typedAnswer: answer } }));
    }, submittedAt + 650));
    timers.current.set(gameId, scheduled);
  }, [clearPreviewTimers]);

  const registerCard = useCallback((gameId: GameId, instance: number, card: HTMLDivElement | null) => {
    const key = previewKey(gameId, instance);
    if (card) cards.current.set(key, card);
    else cards.current.delete(key);
  }, []);

  useEffect(() => {
    const firstCard = cards.current.values().next().value as HTMLDivElement | undefined;
    const gallery = firstCard?.closest(".hero-gallery, .social-card-render__games");
    if (!gallery || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const previewTimers = timers.current;
    let galleryVisible = false;
    const answers = new Map(hubPreviewGames.map((game) => [game.id, game.presentation.previewAnswer]));

    const checkPosition = () => {
      if (!galleryVisible) return;
      const galleryBounds = gallery.getBoundingClientRect();
      const center = galleryBounds.left + galleryBounds.width / 2;
      const activationRadius = galleryBounds.width * 0.07;
      const visibleGames = new Set<GameId>();
      const centeredCandidates: Array<{ gameId: GameId; distance: number; answer: string }> = [];

      for (const [key, card] of cards.current) {
        const bounds = card.getBoundingClientRect();
        const visible = bounds.right > galleryBounds.left && bounds.left < galleryBounds.right;
        if (!visible) continue;

        const gameId = key.slice(0, key.lastIndexOf(":")) as GameId;
        visibleGames.add(gameId);
        const cardCenter = bounds.left + bounds.width / 2;
        if (bounds.right > center - activationRadius && bounds.left < center + activationRadius) {
          const answer = answers.get(gameId);
          if (answer) centeredCandidates.push({ gameId, distance: Math.abs(cardCenter - center), answer });
        }
      }

      // Both marquee groups represent one logical cameo. Keep its completed
      // state across the seamless group handoff and reset only when neither
      // physical copy is visible in the gallery.
      for (const gameId of hasRun.current) {
        if (!visibleGames.has(gameId)) resetPreview(gameId);
      }
      centeredCandidates.sort((left, right) => left.distance - right.distance);
      const centered = centeredCandidates[0];
      if (centered) startPreview(centered.gameId, centered.answer);
      animationFrame.current = requestAnimationFrame(checkPosition);
    };

    const observer = new IntersectionObserver(([entry]) => {
      galleryVisible = entry.isIntersecting;
      cancelAnimationFrame(animationFrame.current);
      if (galleryVisible) animationFrame.current = requestAnimationFrame(checkPosition);
      else for (const gameId of [...hasRun.current]) resetPreview(gameId);
    }, { threshold: 0.01 });

    observer.observe(gallery);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame.current);
      for (const key of previewTimers.keys()) clearPreviewTimers(key);
    };
  }, [clearPreviewTimers, resetPreview, startPreview]);

  const stateFor = useCallback((gameId: GameId, instance: number) => {
    void instance;
    if (reduceMotion) {
      const game = hubPreviewGames.find((candidate) => candidate.id === gameId);
      return game ? { phase: "feedback" as const, typedAnswer: game.presentation.previewAnswer } : idlePreview;
    }
    return states[gameId] ?? idlePreview;
  }, [reduceMotion, states]);

  return { registerCard, stateFor };
}

type PreviewController = ReturnType<typeof useCarouselPreviewController>;

function PreviewSet({ controller, includeDecode, instance }: {
  controller: PreviewController;
  includeDecode: boolean;
  instance: number;
}) {
  const games = useMemo(
    () => hubPreviewGames.filter((game) => includeDecode || game.id !== "decode"),
    [includeDecode],
  );

  return <>{games.map((game) => {
    const Preview = game.presentation.Preview;
    const state = controller.stateFor(game.id, instance);
    return <Preview {...state} instance={instance} key={game.id} registerCard={controller.registerCard} />;
  })}</>;
}

export function HeroGamePreviews({ duplicated = false, includeDecode = false }: {
  duplicated?: boolean;
  includeDecode?: boolean;
}) {
  const controller = useCarouselPreviewController();
  if (!duplicated) return <PreviewSet controller={controller} includeDecode={includeDecode} instance={0} />;

  return <>
    <div className="hero-marquee-group"><PreviewSet controller={controller} includeDecode={includeDecode} instance={0} /></div>
    <div className="hero-marquee-group"><PreviewSet controller={controller} includeDecode={includeDecode} instance={1} /></div>
  </>;
}
