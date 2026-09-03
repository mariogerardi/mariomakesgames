import { useCallback } from "react";
import type { HubPreviewProps } from "../../app-shell/hub-presentation";

export function SyllablHubMark() {
  return <span className="syllabl-collection-monogram"><span>sy</span><i>·</i></span>;
}

export function SyllablHubWordmark() {
  return <h3 className="syllabl-card-wordmark" aria-label="syllabl"><span>sy</span><i aria-hidden="true">·</i><b>lla</b><i aria-hidden="true">·</i><span>bl</span></h3>;
}

export const syllablHubPreviewAnswer = "procrastinator";

export function SyllablHubPreview({ instance, phase, registerCard, typedAnswer }: HubPreviewProps) {
  const cardRef = useCallback((card: HTMLDivElement | null) => registerCard("syllabl", instance, card), [instance, registerCard]);
  return (
    <div className={`preview-card preview-card-syllabl is-${phase}`} data-preview-game="syllabl" data-preview-phase={phase} ref={cardRef}>
      <div className="preview-syllabl-wordmark"><span>sy</span><i>·</i><b>lla</b><i>·</i><span>bl</span></div>
      <div className="preview-syllabl-progress"><i /><i /><i /><i className="is-current" /><i /><i /></div>
      <div className="preview-syllabl-panel">
        <div className="preview-syllabl-token"><small>today’s letters</small><strong>PRO</strong></div>
        <p>find a word that <b>begins with PRO</b><br aria-hidden="true" /> and has <b>5 syllables</b>.</p>
        <div className="preview-entry-stack">
          <div className="preview-syllabl-entry"><span className="preview-entry-value" data-preview-entry>{typedAnswer || "enter your word…"}</span><b>{phase === "feedback" ? "✓" : "→"}</b></div>
          <small className="preview-live-feedback">{phase === "submitted" ? "checking…" : phase === "feedback" ? "valid · 5 syllables" : "enter your word…"}</small>
        </div>
      </div>
    </div>
  );
}
