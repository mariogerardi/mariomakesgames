export function resumeDecodeCheckpoint(raw, mode, date) {
  try {
    const saved = JSON.parse(raw ?? "null");
    const data = saved?.native;
    if (!data || data.run?.mode !== mode || !["playing", "complete", "expired"].includes(data.run.status)) return null;
    // Daily 5 is the only resumable DECODE mode. Timed is abandoned when the
    // player leaves, while Zen always starts as a fresh session.
    if (mode !== "daily-5" || saved.date !== date || saved.outcome === "abandoned") return null;
    if (!Number.isInteger(data.run.score) || data.run.score < 0 || ![4, 5, 6, 7].includes(data.zenLength)) return null;
    const validPuzzle = (p) => p && typeof p.id === "string" && /^[A-Z]{4,7}$/i.test(p.answer) && typeof p.clueWord === "string" && typeof p.clue === "string";
    if (!validPuzzle(data.puzzle) || !Number.isFinite(Date.parse(data.runMeta?.startedAt)) || typeof data.runMeta.puzzleId !== "string") return null;
    if (mode === "daily-5" && (!Array.isArray(data.dailyPuzzles) || data.dailyPuzzles.length !== 5 || !data.dailyPuzzles.every(validPuzzle) || !Number.isInteger(data.run.dailyIndex) || !Number.isFinite(data.run.elapsedSeconds))) return null;
    if (mode === "timed" && !Number.isFinite(data.run.secondsRemaining)) return null;
    // The Daily stopwatch is paused while its play screen is not active. It
    // resumes only after the player uses the mode landing's resume action.
    return data;
  } catch { return null; }
}
