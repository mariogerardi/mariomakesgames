import { useCallback } from "react";
import type { HubPreviewProps } from "../../app-shell/hub-presentation";

const logoStates = ["correct", "present", "correct", "present", "absent", "correct"];

export function DecodeHubMark() {
  return <span className="decode-collection-mark"><i>D</i></span>;
}

export function DecodeHubWordmark() {
  return <h3 className="decode-card-wordmark" aria-label="DECODE">{"DECODE".split("").map((letter, index) => <span className={`is-${logoStates[index]}`} key={`${letter}-${index}`}>{letter}</span>)}</h3>;
}

export const decodeHubPreviewAnswer = "WINK";

export function DecodeHubPreview({ instance, phase, registerCard, typedAnswer }: HubPreviewProps) {
  const cardRef = useCallback((card: HTMLDivElement | null) => registerCard("decode", instance, card), [instance, registerCard]);
  return (
    <div className={`preview-card preview-card-decode is-${phase}`} data-preview-game="decode" data-preview-phase={phase} ref={cardRef}>
      <div className="preview-decode-topline" aria-label="DECODE">{"DECODE".split("").map((letter, index) => <i className={`is-${logoStates[index]}`} key={`${letter}-${index}`}>{letter}</i>)}</div>
      <small className="preview-decode-label">Clue word</small>
      <div className="preview-decode-clue">{"KNIT".split("").map((letter, index) => <span className={`is-${index === 3 ? "absent" : "present"}`} key={`${letter}-${index}`}><b>{letter}</b><i>{index === 3 ? "×" : "↔"}</i></span>)}</div>
      <div className="preview-decode-definition"><small>Definition</small><p>“flirtatious gesture, or signal of a kind”</p></div>
      <div className="preview-decode-answer"><small>Answer</small><div>{Array.from({ length: 4 }, (_, index) => <span key={index}>{typedAnswer[index] || ""}</span>)}</div></div>
      <p className="preview-decode-feedback">{phase === "submitted" ? "decoding…" : phase === "feedback" ? "signal decoded" : "\u00a0"}</p>
    </div>
  );
}
