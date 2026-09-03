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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());
  const hasRun = useRef(new Set<string>());
  const animationFrame = useRef(0);
  const [states, setStates] = useState<Record<string, HubPreviewState>>({});

  const clearPreviewTimers = useCallback((key: string) => {
    for (const timer of timers.current.get(key) ?? []) clearTimeout(timer);
    timers.current.delete(key);
  }, []);

  const resetPreview = useCallback((key: string) => {
    clearPreviewTimers(key);
    hasRun.current.delete(key);
    setStates((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, [clearPreviewTimers]);

  const startPreview = useCallback((key: string, answer: string) => {
    if (hasRun.current.has(key)) return;
    hasRun.current.add(key);
    clearPreviewTimers(key);

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
          [key]: { phase: "typing", typedAnswer: answer.slice(0, index) },
        }));
      }, startDelay + index * characterDelay));
    }

    const submittedAt = startDelay + answer.length * characterDelay + 420;
    scheduled.push(setTimeout(() => {
      setStates((current) => ({ ...current, [key]: { phase: "submitted", typedAnswer: answer } }));
    }, submittedAt));
    scheduled.push(setTimeout(() => {
      setStates((current) => ({ ...current, [key]: { phase: "feedback", typedAnswer: answer } }));
    }, submittedAt + 650));
    timers.current.set(key, scheduled);
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
      const centeredCandidates: Array<{ key: string; distance: number; answer: string }> = [];

      for (const [key, card] of cards.current) {
        const bounds = card.getBoundingClientRect();
        const visible = bounds.right > galleryBounds.left && bounds.left < galleryBounds.right;
        if (!visible) {
          if (hasRun.current.has(key)) resetPreview(key);
          continue;
        }

        const cardCenter = bounds.left + bounds.width / 2;
        if (bounds.right > center - activationRadius && bounds.left < center + activationRadius) {
          const gameId = key.split(":")[0] as GameId;
          const answer = answers.get(gameId);
          if (answer) centeredCandidates.push({ key, distance: Math.abs(cardCenter - center), answer });
        }
      }

      centeredCandidates.sort((left, right) => left.distance - right.distance);
      const centered = centeredCandidates[0];
      if (centered) startPreview(centered.key, centered.answer);
      animationFrame.current = requestAnimationFrame(checkPosition);
    };

    const observer = new IntersectionObserver(([entry]) => {
      galleryVisible = entry.isIntersecting;
      cancelAnimationFrame(animationFrame.current);
      if (galleryVisible) animationFrame.current = requestAnimationFrame(checkPosition);
      else for (const key of [...hasRun.current]) resetPreview(key);
    }, { threshold: 0.01 });

    observer.observe(gallery);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame.current);
      for (const key of previewTimers.keys()) clearPreviewTimers(key);
    };
  }, [clearPreviewTimers, resetPreview, startPreview]);

  const stateFor = useCallback((gameId: GameId, instance: number) => (
    states[previewKey(gameId, instance)] ?? idlePreview
  ), [states]);

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
