"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type PreviewPhase = "idle" | "typing" | "submitted" | "feedback";

function useCenteredDemo(answer: string) {
  const cardRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<PreviewPhase>("idle");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centeredRef = useRef(false);
  const [isCentered, setIsCentered] = useState(false);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [typedAnswer, setTypedAnswer] = useState("");

  const updatePhase = useCallback((nextPhase: PreviewPhase) => {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }, []);

  const resetDemo = useCallback(() => {
    updatePhase("idle");
    setTypedAnswer("");
    resetTimerRef.current = null;
  }, [updatePhase]);

  useEffect(() => {
    const card = cardRef.current;
    const gallery = card?.closest(".hero-gallery");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!card || !gallery || prefersReducedMotion) return;

    let animationFrame = 0;
    const checkPosition = () => {
      const cardBounds = card.getBoundingClientRect();
      const galleryBounds = gallery.getBoundingClientRect();
      const center = galleryBounds.left + galleryBounds.width / 2;
      const activationRadius = galleryBounds.width * 0.07;
      const isInCenter = cardBounds.right > center - activationRadius
        && cardBounds.left < center + activationRadius;

      if (isInCenter !== centeredRef.current) {
        centeredRef.current = isInCenter;
        if (isInCenter) {
          if (resetTimerRef.current) {
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = null;
          }
          setIsCentered(true);
        } else {
          setIsCentered(false);
          const hasFinished = phaseRef.current === "feedback";
          if (hasFinished) {
            resetTimerRef.current = setTimeout(resetDemo, 2800);
          } else {
            resetDemo();
          }
        }
      }

      animationFrame = requestAnimationFrame(checkPosition);
    };

    animationFrame = requestAnimationFrame(checkPosition);
    return () => {
      cancelAnimationFrame(animationFrame);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, [resetDemo]);

  useEffect(() => {
    if (!isCentered) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const startDelay = 5200;
    const characterDelay = 110;

    for (let index = 1; index <= answer.length; index += 1) {
      timers.push(
        setTimeout(() => {
          updatePhase("typing");
          setTypedAnswer(answer.slice(0, index));
        }, startDelay + index * characterDelay),
      );
    }

    const submittedAt = startDelay + answer.length * characterDelay + 300;
    timers.push(setTimeout(() => updatePhase("submitted"), submittedAt));
    timers.push(setTimeout(() => updatePhase("feedback"), submittedAt + 450));

    return () => timers.forEach(clearTimeout);
  }, [answer, isCentered, updatePhase]);

  return { cardRef, phase, typedAnswer };
}

function phaseClass(phase: PreviewPhase) {
  return `is-${phase}`;
}

function useAnimatedPreviewScore(phase: PreviewPhase, target: number) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    if (phase !== "feedback") {
      const resetFrame = requestAnimationFrame(() => setDisplayScore(0));
      return () => cancelAnimationFrame(resetFrame);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const reducedMotionFrame = requestAnimationFrame(() => setDisplayScore(target));
      return () => cancelAnimationFrame(reducedMotionFrame);
    }

    const duration = 1200;
    let animationFrame = 0;
    animationFrame = requestAnimationFrame((startedAt) => {
      const step = (now: number) => {
        const elapsed = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        setDisplayScore(target * eased);
        if (elapsed < 1) animationFrame = requestAnimationFrame(step);
      };
      animationFrame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [phase, target]);

  return displayScore.toFixed(4);
}

function SyllablPreview() {
  const { cardRef, phase, typedAnswer } = useCenteredDemo("procrastinator");

  return (
    <div
      className={`preview-card preview-card-syllabl ${phaseClass(phase)}`}
      data-preview-game="syllabl"
      data-preview-phase={phase}
      ref={cardRef}
    >
      <div className="preview-syllabl-wordmark">
        <span>sy</span><i>·</i><b>lla</b><i>·</i><span>bl</span>
      </div>
      <div className="preview-syllabl-progress">
        <i /><i /><i /><i className="is-current" /><i /><i />
      </div>
      <div className="preview-syllabl-panel">
        <div className="preview-syllabl-token">
          <small>today’s letters</small><strong>PRO</strong>
        </div>
        <p>find a word that <b>fully contains PRO</b> and has <b>5 syllables</b>.</p>
        <div className="preview-entry-stack">
          <div className="preview-syllabl-entry">
            <span className="preview-entry-value" data-preview-entry>
              {typedAnswer || "enter your word…"}
            </span>
            <b>{phase === "feedback" ? "✓" : "→"}</b>
          </div>
          <small className="preview-live-feedback">
            {phase === "submitted" ? "checking…" : phase === "feedback" ? "valid · 5 syllables" : "\u00a0"}
          </small>
        </div>
      </div>
    </div>
  );
}

function RarityPreview() {
  const { cardRef, phase, typedAnswer } = useCenteredDemo("bejeweled");
  const displayScore = useAnimatedPreviewScore(phase, 79.91765);

  return (
    <div
      className={`preview-card preview-card-rarity ${phaseClass(phase)}`}
      data-preview-game="rarity"
      data-preview-phase={phase}
      ref={cardRef}
    >
      <div className="preview-rarity-brand">
        <Image alt="" height={600} src="/rarity/logo.png" width={600} />
        <span>rarity</span>
      </div>
      <div className="preview-rarity-panel">
        <div className="preview-rarity-string-block">
          <small>today’s string</small>
          <strong>WEL</strong>
          <p>
            {phase === "submitted"
              ? "checking the field…"
              : phase === "feedback"
                ? "accepted. your one guess is locked."
                : "one valid guess. make it count."}
          </p>
        </div>
        <div className="preview-rarity-entry">
          <span className="preview-entry-value" data-preview-entry>
            {typedAnswer || "your word"}
          </span>
          <b>{phase === "feedback" ? "✓" : "→"}</b>
        </div>
        <div className="preview-rarity-score">
          <span>rarity score</span><b data-preview-score>{displayScore}</b>
        </div>
      </div>
    </div>
  );
}

function BeforeAfterPreview() {
  const { cardRef, phase, typedAnswer } = useCenteredDemo("body");
  const shownAnswer = typedAnswer || "\u00a0";

  return (
    <div
      className={`preview-card preview-card-before-after ${phaseClass(phase)}`}
      data-preview-game="before-after"
      data-preview-phase={phase}
      ref={cardRef}
    >
      <div className="preview-before-after-wordmark">
        <span>before</span><i>&amp;</i><b>after</b>
      </div>
      <div className="preview-before-after-puzzle">
        <p className="preview-before-after-prompt">
          word before <b>double</b> or after <b>heavenly</b>.
        </p>
        <div className="preview-before-after-phrases">
          <span className="is-answer-first"><b><em className="preview-entry-value">{shownAnswer}</em></b><i>double</i></span>
          <span className="is-answer-last"><i>heavenly</i><b><em className="preview-entry-value">{shownAnswer}</em></b></span>
        </div>
      </div>
      <div className="preview-before-after-input">
        <span>your answer</span>
        <strong className="preview-entry-value" data-preview-entry>{typedAnswer || "type or tap"}</strong>
        <b aria-hidden="true">{phase === "feedback" ? "✓" : "→"}</b>
      </div>
      <small className="preview-live-feedback">
        {phase === "submitted" ? "checking both phrases…" : phase === "feedback" ? "bridge found" : "\u00a0"}
      </small>
    </div>
  );
}

export function HeroGamePreviews() {
  return (
    <>
      <SyllablPreview />
      <RarityPreview />
      <BeforeAfterPreview />
    </>
  );
}
