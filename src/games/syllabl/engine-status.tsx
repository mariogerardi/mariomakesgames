import { syllablPuzzles } from "./catalog";

const placementLabels = {
  1: "Ends with",
  2: "Begins with",
  3: "Contains",
  4: "Begins & ends",
} as const;

export function SyllablEngineStatus() {
  const sample = syllablPuzzles[0];

  return (
    <div className="room-stage syllabl-engine-stage">
      <div className="stage-topline">
        <span className="status-dot" />
        Completion engine ready
      </div>

      <div className="syllabl-engine-preview">
        <div className="syllabl-engine-heading">
          <div>
            <span className="syllabl-engine-label">Canonical puzzle 001</span>
            <strong>{sample.puzzleLetters.toUpperCase()}</strong>
          </div>
          <span className="syllabl-engine-count">0 / 6</span>
        </div>

        <ol className="syllabl-constraint-list">
          {sample.inputsEnabled.map((placement, index) => (
            <li key={`${placement}-${index}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>
                {placementLabels[placement as keyof typeof placementLabels]}
              </b>
              <em>
                {sample.syllablesRequired[index]}{" "}
                {sample.syllablesRequired[index] === 1
                  ? "syllable"
                  : "syllables"}
              </em>
            </li>
          ))}
        </ol>

        <p className="syllabl-engine-note">
          Six valid words complete the puzzle. No obscurity score.
        </p>
      </div>

      <div className="stage-footer">
        <span>{syllablPuzzles.length} daily puzzles</span>
        <span>Completion only</span>
      </div>
    </div>
  );
}
