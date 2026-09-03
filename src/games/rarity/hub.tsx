import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { HubPreviewPhase, HubPreviewProps } from "../../app-shell/hub-presentation";

export function RarityHubMark() {
  return <Image className="rarity-collection-gem" alt="" height={160} src="/hub/rarity-gem.png" width={160} />;
}

export function RarityHubWordmark() {
  return <h3 className="rarity-card-wordmark">rarity</h3>;
}

export const rarityHubPreviewAnswer = "bejeweled";

function useAnimatedScore(phase: HubPreviewPhase, target: number) {
  const [score, setScore] = useState(0);
  useEffect(() => {
    if (phase !== "feedback") {
      const frame = requestAnimationFrame(() => setScore(0));
      return () => cancelAnimationFrame(frame);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const frame = requestAnimationFrame(() => setScore(target));
      return () => cancelAnimationFrame(frame);
    }
    let frame = 0;
    frame = requestAnimationFrame((startedAt) => {
      const step = (now: number) => {
        const elapsed = Math.min(1, (now - startedAt) / 1200);
        setScore(target * (1 - Math.pow(1 - elapsed, 3)));
        if (elapsed < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [phase, target]);
  return score.toFixed(4);
}

export function RarityHubPreview({ instance, phase, registerCard, typedAnswer }: HubPreviewProps) {
  const cardRef = useCallback((card: HTMLDivElement | null) => registerCard("rarity", instance, card), [instance, registerCard]);
  const score = useAnimatedScore(phase, 79.91765);
  return (
    <div className={`preview-card preview-card-rarity is-${phase}`} data-preview-game="rarity" data-preview-phase={phase} ref={cardRef}>
      <div className="preview-rarity-brand"><Image alt="" height={160} src="/hub/rarity-gem.png" width={160} /><span>rarity</span></div>
      <div className="preview-rarity-panel">
        {phase === "feedback" ? (
          <div className="preview-rarity-result">
            <small>your entry</small><strong>beje<mark>wel</mark>ed</strong>
            <p className="preview-rarity-definition"><em>adjective</em><span>decorated or adorned with jewels.</span></p>
            <div className="preview-rarity-result-score"><b data-preview-score>{score}</b><span>points</span></div>
            <div className="preview-rarity-result-tier"><b>rare</b><span>a genuinely rare find</span></div>
            <div className="preview-rarity-tier-track" aria-hidden="true"><i /><i /><i /><i className="is-current" /><i /><i /></div>
          </div>
        ) : <>
          <div className="preview-rarity-string-block"><small>today’s string</small><strong>WEL</strong><p>{phase === "submitted" ? "checking the field…" : "one valid guess. make it count."}</p></div>
          <div className="preview-rarity-entry"><span className="preview-entry-value" data-preview-entry>{typedAnswer || "your word"}</span><b>→</b></div>
        </>}
      </div>
    </div>
  );
}
