"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type PreviewPhase = "idle" | "typing" | "submitted" | "feedback";

function useCenteredDemo(answer: string) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isCentered, setIsCentered] = useState(false);
  const [phase, setPhase] = useState<PreviewPhase>("idle");
  const [typedAnswer, setTypedAnswer] = useState("");

  useEffect(() => {
    const card = cardRef.current;
    const gallery = card?.closest(".hero-gallery");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!card || !gallery || prefersReducedMotion || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsCentered(entry.isIntersecting);
        if (!entry.isIntersecting) {
          setPhase("idle");
          setTypedAnswer("");
        }
      },
      {
        root: gallery,
        rootMargin: "0px -48% 0px -48%",
        threshold: 0.01,
      },
    );

    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isCentered) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const startDelay = 5200;
    const characterDelay = 110;

    for (let index = 1; index <= answer.length; index += 1) {
      timers.push(
        setTimeout(() => {
          setPhase("typing");
          setTypedAnswer(answer.slice(0, index));
        }, startDelay + index * characterDelay),
      );
    }

    const submittedAt = startDelay + answer.length * characterDelay + 300;
    timers.push(setTimeout(() => setPhase("submitted"), submittedAt));
    timers.push(setTimeout(() => setPhase("feedback"), submittedAt + 450));

    return () => timers.forEach(clearTimeout);
  }, [answer, isCentered]);

  return { cardRef, phase, typedAnswer };
}

function phaseClass(phase: PreviewPhase) {
  return `is-${phase}`;
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
        <div className="preview-syllabl-meta">
          <span>daily #497</span><b>level 4 of 6</b>
        </div>
        <div className="preview-syllabl-token">
          <small>today’s letters</small><strong>PRO</strong>
        </div>
        <p>find a word that <b>contains PRO</b> and has <b>5 syllables</b>.</p>
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
        <small>today’s string</small>
        <strong>WEL</strong>
        <p>
          {phase === "submitted"
            ? "checking the field…"
            : phase === "feedback"
              ? "accepted. your one word is locked."
              : "one valid word. make it count."}
        </p>
        <div className="preview-rarity-entry">
          <span className="preview-entry-value" data-preview-entry>
            {typedAnswer || "your word"}
          </span>
          <b>{phase === "feedback" ? "✓" : "→"}</b>
        </div>
        <div className="preview-rarity-score">
          <span>rarity score</span><b>{phase === "feedback" ? "27.3905" : "0.0000"}</b>
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
        <small>{typedAnswer.length}/18</small>
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
