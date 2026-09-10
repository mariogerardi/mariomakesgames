import { useCallback } from "react";
import type { HubPreviewProps } from "../../app-shell/hub-presentation";

const logoStates = ["correct", "present", "correct", "present", "absent", "correct"];

export function DecodeHubMark() {
  return <span className="decode-collection-mark"><i>D</i></span>;
}

export function DecodeHubWordmark() {
  return <h3 className="decode-card-wordmark" aria-label="DECODE">{"DECODE".split("").map((letter, index) => <span className={`is-${logoStates[index]}`} key={`${letter}-${index}`}>{letter}</span>)}</h3>;
}

export const decodeHubPreviewAnswer = "CAMEO";

export function DecodeHubPreview({ instance, phase, registerCard, typedAnswer }: HubPreviewProps) {
  const cardRef = useCallback((card: HTMLDivElement | null) => registerCard("decode", instance, card), [instance, registerCard]);
  return (
    <div className={`preview-card preview-card-decode is-${phase}`} data-preview-game="decode" data-preview-phase={phase} ref={cardRef}>
      <div className="preview-decode-topline" aria-label="DECODE">{"DECODE".split("").map((letter, index) => <i className={`is-${logoStates[index]}`} key={`${letter}-${index}`}>{letter}</i>)}</div>
      <small className="preview-decode-label">Clue word</small>
      <div className="preview-decode-clue">{"CLAMP".split("").map((letter, index) => {
        const state = index === 0 ? "correct" : index === 2 || index === 3 ? "present" : "absent";
        return <span className={`is-${state}`} key={`${letter}-${index}`}><b>{letter}</b><i>{state === "correct" ? "●" : state === "present" ? "↔" : "×"}</i></span>;
      })}</div>
      <div className="preview-decode-definition"><small>Definition</small><p>“It might just be a line or two”</p></div>
      <div className="preview-decode-answer"><small>Answer</small><div>{Array.from({ length: 5 }, (_, index) => {
        const letter = typedAnswer[index] || "";
        return <span key={`${index}-${letter || "empty"}`}>{letter}</span>;
      })}</div></div>
      <p className="preview-decode-feedback">{phase === "submitted" ? "decoding…" : phase === "feedback" ? "signal decoded" : "\u00a0"}</p>
    </div>
  );
}
