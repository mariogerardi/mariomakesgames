import { useCallback } from "react";
import type { HubPreviewProps } from "../../app-shell/hub-presentation";

export function BeforeAfterHubMark() {
  return <span className="before-after-collection-mark"><i>b</i><b>&amp;</b><i>a</i></span>;
}

export function BeforeAfterHubWordmark() {
  return <h3 className="before-after-card-wordmark"><span>before</span><i>&amp;</i><b>after</b></h3>;
}

export const beforeAfterHubPreviewAnswer = "body";

export function BeforeAfterHubPreview({ instance, phase, registerCard, typedAnswer }: HubPreviewProps) {
  const cardRef = useCallback((card: HTMLDivElement | null) => registerCard("before-after", instance, card), [instance, registerCard]);
  const shownAnswer = typedAnswer || "\u00a0";
  return (
    <div className={`preview-card preview-card-before-after is-${phase}`} data-preview-game="before-after" data-preview-phase={phase} ref={cardRef}>
      <div className="preview-before-after-confetti" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div>
      <div className="preview-before-after-wordmark"><span>before</span><i>&amp;</i><b>after</b></div>
      <div className="preview-before-after-puzzle">
        <p className="preview-before-after-prompt">find the word that fits before <b>double</b> and <br></br> after <b>heavenly</b>.</p>
        <div className="preview-before-after-phrases">
          <span className="is-answer-first"><b><em className="preview-entry-value">{shownAnswer}</em></b><i>double</i></span>
          <span className="is-answer-last"><i>heavenly</i><b><em className="preview-entry-value">{shownAnswer}</em></b></span>
        </div>
      </div>
      <small className="preview-live-feedback">{phase === "submitted" ? "checking both phrases…" : phase === "feedback" ? "bridge found" : "\u00a0"}</small>
    </div>
  );
}
