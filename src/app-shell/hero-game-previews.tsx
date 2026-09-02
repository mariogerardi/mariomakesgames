"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type PreviewPhase = "idle" | "typing" | "submitted" | "feedback";

function useCenteredDemo(answer: string) {
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const activeCardCenterRef = useRef<number | null>(null);
  const galleryVisibleRef = useRef(false);
  const hasRunRef = useRef(false);
  const [runNumber, setRunNumber] = useState(0);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [typedAnswer, setTypedAnswer] = useState("");

  const updatePhase = useCallback((nextPhase: PreviewPhase) => {
    setPhase(nextPhase);
  }, []);

  const resetDemo = useCallback(() => {
    updatePhase("idle");
    setTypedAnswer("");
  }, [updatePhase]);

  const setCardRef = useCallback((instance: number, card: HTMLDivElement | null) => {
    cardRefs.current[instance] = card;
  }, []);

  useEffect(() => {
    const card = cardRefs.current.find(Boolean);
    const gallery = card?.closest(".hero-gallery, .social-card-render__games");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!card || !gallery || prefersReducedMotion) return;

    let animationFrame = 0;
    const checkPosition = () => {
      const galleryBounds = gallery.getBoundingClientRect();
      const galleryIsVisible = galleryBounds.bottom > 0
        && galleryBounds.top < window.innerHeight
        && galleryBounds.right > 0
        && galleryBounds.left < window.innerWidth;

      if (!galleryIsVisible) {
        if (galleryVisibleRef.current) {
          galleryVisibleRef.current = false;
          activeCardCenterRef.current = null;
          hasRunRef.current = false;
          setRunNumber(0);
          resetDemo();
        }
        animationFrame = requestAnimationFrame(checkPosition);
        return;
      }

      galleryVisibleRef.current = true;
      const center = galleryBounds.left + galleryBounds.width / 2;
      const activationRadius = galleryBounds.width * 0.07;
      const candidates = cardRefs.current.flatMap((candidate) => {
        if (!candidate) return [];
        const bounds = candidate.getBoundingClientRect();
        return [{ bounds, center: bounds.left + bounds.width / 2 }];
      });

      if (activeCardCenterRef.current !== null && candidates.length > 0) {
        const previousCenter = activeCardCenterRef.current;
        const activeCard = candidates.reduce((closest, candidate) => (
          Math.abs(candidate.center - previousCenter) < Math.abs(closest.center - previousCenter)
            ? candidate
            : closest
        ));

        activeCardCenterRef.current = activeCard.center;
        const activeCardIsVisible = activeCard.bounds.right > galleryBounds.left
          && activeCard.bounds.left < galleryBounds.right;

        if (!activeCardIsVisible) {
          activeCardCenterRef.current = null;
          hasRunRef.current = false;
          setRunNumber(0);
          resetDemo();
        }

        animationFrame = requestAnimationFrame(checkPosition);
        return;
      }

      const centeredCard = candidates
        .filter((candidate) => candidate.bounds.right > center - activationRadius
          && candidate.bounds.left < center + activationRadius)
        .sort((left, right) => Math.abs(left.center - center) - Math.abs(right.center - center))[0];

      if (centeredCard && !hasRunRef.current) {
        activeCardCenterRef.current = centeredCard.center;
        hasRunRef.current = true;
        setRunNumber((current) => current + 1);
      }

      animationFrame = requestAnimationFrame(checkPosition);
    };

    animationFrame = requestAnimationFrame(checkPosition);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [resetDemo]);

  useEffect(() => {
    if (runNumber === 0) return;

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
  }, [answer, runNumber, updatePhase]);

  return { phase, setCardRef, typedAnswer };
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

type PreviewDemo = ReturnType<typeof useCenteredDemo>;

type PreviewProps = {
  demo: PreviewDemo;
  instance: number;
};

function SyllablPreview({ demo, instance }: PreviewProps) {
  const { phase, setCardRef, typedAnswer } = demo;
  const cardRef = useCallback((card: HTMLDivElement | null) => setCardRef(instance, card), [instance, setCardRef]);

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
        <p>find a word that <b>begins with PRO</b><br aria-hidden="true" /> and has <b>5 syllables</b>.</p>
        <div className="preview-entry-stack">
          <div className="preview-syllabl-entry">
            <span className="preview-entry-value" data-preview-entry>
              {typedAnswer || "enter your word…"}
            </span>
            <b>{phase === "feedback" ? "✓" : "→"}</b>
          </div>
          <small className="preview-live-feedback">
            {phase === "submitted" ? "checking…" : phase === "feedback" ? "valid · 5 syllables" : "enter your word…"}
          </small>
        </div>
      </div>
    </div>
  );
}

function RarityPreview({ demo, instance }: PreviewProps) {
  const { phase, setCardRef, typedAnswer } = demo;
  const cardRef = useCallback((card: HTMLDivElement | null) => setCardRef(instance, card), [instance, setCardRef]);
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
        {phase === "feedback" ? (
          <div className="preview-rarity-result">
            <small>your entry</small>
            <strong>beje<mark>wel</mark>ed</strong>
            <p className="preview-rarity-definition">
              <em>adjective</em>
              <span>decorated or adorned with jewels.</span>
            </p>
            <div className="preview-rarity-result-score">
              <b data-preview-score>{displayScore}</b><span>points</span>
            </div>
            <div className="preview-rarity-result-tier">
              <b>rare</b><span>a genuinely rare find</span>
            </div>
            <div className="preview-rarity-tier-track" aria-hidden="true">
              <i /><i /><i /><i className="is-current" /><i /><i />
            </div>
          </div>
        ) : (
          <>
            <div className="preview-rarity-string-block">
              <small>today’s string</small>
              <strong>WEL</strong>
              <p>{phase === "submitted" ? "checking the field…" : "one valid guess. make it count."}</p>
            </div>
            <div className="preview-rarity-entry">
              <span className="preview-entry-value" data-preview-entry>
                {typedAnswer || "your word"}
              </span>
              <b>→</b>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function BeforeAfterPreview({ demo, instance }: PreviewProps) {
  const { phase, setCardRef, typedAnswer } = demo;
  const cardRef = useCallback((card: HTMLDivElement | null) => setCardRef(instance, card), [instance, setCardRef]);
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

function DecodePreview({ demo, instance }: PreviewProps) {
  const { phase, setCardRef, typedAnswer } = demo;
  const cardRef = useCallback((card: HTMLDivElement | null) => setCardRef(instance, card), [instance, setCardRef]);
  const clueStates: PreviewPhase[] = ["typing", "typing", "typing", "idle"];
  const logoStates = ["correct", "present", "correct", "present", "absent", "correct"];

  return (
    <div
      className={`preview-card preview-card-decode ${phaseClass(phase)}`}
      data-preview-game="decode"
      data-preview-phase={phase}
      ref={cardRef}
    >
      <div className="preview-decode-topline" aria-label="DECODE">
        {"DECODE".split("").map((letter, index) => <i className={`is-${logoStates[index]}`} key={`${letter}-${index}`}>{letter}</i>)}
      </div>
      <small className="preview-decode-label">Clue word</small>
      <div className="preview-decode-clue">
        {"KNIT".split("").map((letter, index) => (
          <span className={`is-${clueStates[index] === "idle" ? "absent" : "present"}`} key={`${letter}-${index}`}><b>{letter}</b><i>{clueStates[index] === "idle" ? "×" : "↔"}</i></span>
        ))}
      </div>
      <div className="preview-decode-definition"><small>Definition</small><p>“flirtatious gesture, or signal of a kind”</p></div>
      <div className="preview-decode-answer">
        <small>Answer</small>
        <div>{Array.from({ length: 4 }, (_, index) => <span key={index}>{typedAnswer[index] || ""}</span>)}</div>
      </div>
      <p className="preview-decode-feedback">{phase === "submitted" ? "decoding…" : phase === "feedback" ? "signal decoded" : "\u00a0"}</p>
    </div>
  );
}

function PreviewSet({ demos, includeDecode, instance }: { demos: PreviewDemo[]; includeDecode: boolean; instance: number }) {
  return (
    <>
      <SyllablPreview demo={demos[0]} instance={instance} />
      <RarityPreview demo={demos[1]} instance={instance} />
      <BeforeAfterPreview demo={demos[2]} instance={instance} />
      {includeDecode && <DecodePreview demo={demos[3]} instance={instance} />}
    </>
  );
}

export function HeroGamePreviews({ duplicated = false, includeDecode = false }: { duplicated?: boolean; includeDecode?: boolean }) {
  const demos = [
    useCenteredDemo("procrastinator"),
    useCenteredDemo("bejeweled"),
    useCenteredDemo("body"),
    useCenteredDemo("WINK"),
  ];

  if (!duplicated) return <PreviewSet demos={demos} includeDecode={includeDecode} instance={0} />;

  return (
    <>
      <div className="hero-marquee-group">
        <PreviewSet demos={demos} includeDecode={includeDecode} instance={0} />
      </div>
      <div className="hero-marquee-group">
        <PreviewSet demos={demos} includeDecode={includeDecode} instance={1} />
      </div>
    </>
  );
}
