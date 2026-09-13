import { useCallback } from "react";
import type { HubPreviewProps } from "../../app-shell/hub-presentation";

export function DualHubMark() {
  return <span className="dual-collection-mark"><i>EN</i><b>ES</b></span>;
}

export function DualHubWordmark() {
  return <h3 className="dual-card-wordmark" aria-label="DUAL"><span>DU</span><b>AL</b></h3>;
}

export const dualHubPreviewAnswer = "once";

function PreviewDualWord({ word }: { word: string }) {
  const matchAt = word.toLowerCase().indexOf("onc");
  if (matchAt < 0) return <>{word}</>;
  return <>{word.slice(0, matchAt)}<mark>{word.slice(matchAt, matchAt + 3)}</mark>{word.slice(matchAt + 3)}</>;
}

export function DualHubPreview({ instance, phase, registerCard, typedAnswer }: HubPreviewProps) {
  const cardRef = useCallback(
    (card: HTMLDivElement | null) => registerCard("dual", instance, card),
    [instance, registerCard],
  );

  return (
    <div
      className={`preview-card preview-card-dual is-${phase}`}
      data-preview-game="dual"
      data-preview-phase={phase}
      ref={cardRef}
    >
      <div className="preview-dual-brand" aria-label="DUAL"><span>DU</span><b>AL</b></div>
      <div className="preview-dual-prompt">
        <small>Find words containing</small>
        <strong>ONC</strong>
        <small lang="es">en inglés y español</small>
      </div>
      <div className="preview-dual-scoreboard">
        <span><small>EN FAMILIES</small><b>{phase === "feedback" ? "5" : "4"}</b><i>/ 6</i><em style={{ width: phase === "feedback" ? "83%" : "67%" }} /></span>
        <span><small>SCORE</small><b>{phase === "feedback" ? "12" : "10"}</b><i>/ 16</i><em style={{ width: phase === "feedback" ? "75%" : "63%" }} /></span>
        <span><small>ES FAMILIES</small><b>{phase === "feedback" ? "5" : "4"}</b><i>/ 6</i><em style={{ width: phase === "feedback" ? "83%" : "67%" }} /></span>
      </div>
      <div className="preview-dual-progress">
        <span>DUALS <b>{phase === "feedback" ? "2 / 4" : "1 / 4"}</b></span>
        <div><i className="is-found" /><i className={phase === "feedback" ? "is-found" : ""} /><i /><i /></div>
      </div>
      <div className="preview-dual-finds">
        <section className="preview-dual-family is-en">
          <span className="preview-dual-word"><span className="preview-dual-word-text">c<mark>onc</mark>ert</span><small>+1</small></span>
          <div className="preview-dual-family-forms"><span className="preview-dual-word"><span className="preview-dual-word-text">c<mark>onc</mark>erts</span><small>+.25</small></span></div>
        </section>
        <strong><span className="preview-dual-word-text"><mark>onc</mark>e</span><small>+2</small></strong>
        <section className="preview-dual-family is-es">
          <span className="preview-dual-word"><span className="preview-dual-word-text">c<mark>onc</mark>eder</span><small>+1</small></span>
          <div className="preview-dual-family-forms">
            <span className="preview-dual-word"><span className="preview-dual-word-text">c<mark>onc</mark>edo</span><small>+.25</small></span>
            <span className="preview-dual-word"><span className="preview-dual-word-text">c<mark>onc</mark>edes</span><small>+.25</small></span>
          </div>
        </section>
      </div>
      <div className="preview-dual-entry">
        <span className="preview-entry-value" data-preview-entry>{typedAnswer ? <PreviewDualWord word={typedAnswer} /> : "\u00a0"}</span>
      </div>
      <p className="preview-dual-feedback">
        {phase === "submitted" ? "Checking both sides…" : phase === "feedback" ? "Dual found" : "\u00a0"}
      </p>
    </div>
  );
}
