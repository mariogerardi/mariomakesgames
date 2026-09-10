// Project cloud checkpoints into the native save slots read by each game.
// Only game-owned progress keys are allowed; never restore arbitrary storage keys.
export function restoreRunCheckpoints(storage, runs) {
  const read = (key) => { try { return JSON.parse(storage.getItem(key) ?? "{}"); } catch { return {}; } };
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));
  const resetAt = (gameId) => Date.parse(storage.getItem(`mg-games:v1:${gameId}:cloud-reset`) ?? "") || 0;
  const isAfterReset = (run) => {
    const changedAt = Date.parse(String(run.updatedAt ?? "").split("#")[0]) || Date.parse(run.completedAt ?? "") || Date.parse(run.startedAt ?? "") || 0;
    return changedAt > resetAt(run.gameId);
  };
  const restorableRuns = runs.filter(isAfterReset);
  for (const run of [...restorableRuns].reverse()) {
    const native = run.checkpoint?.version === 1 ? run.checkpoint.state.native : legacyNativeCheckpoint(run);
    if (!native || typeof native !== "object") continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(run.puzzle.date ?? "") ? run.puzzle.date : null;
    switch (run.gameId) {
      case "syllabl":
        if (date) write(`mg-games:v2:syllabl:daily-${date}`, native);
        break;
      case "rarity":
        if (date && native.word) write(`rarity_daily_${date}`, native);
        break;
      case "before-after":
        write(`mg-games:v1:before-after:resume-${encodeURIComponent(run.puzzle.id)}`, native);
        if (run.mode === "daily") write("mg-games:v1:before-after:daily", native);
        break;
      case "token": {
        const key = "mg-games:v1:token:runs";
        write(key, { schemaVersion: 1, runs: { ...read(key).runs, [run.puzzle.id]: native } });
        break;
      }
      case "dual": {
        const key = "mg-games:v1:dual:runs";
        if (date) write(key, { ...read(key), [date]: native });
        break;
      }
      case "decode":
        write(`mg-games:v1:decode:resume-${run.mode}`, { ...run.checkpoint.state, updatedAt: run.updatedAt, outcome: run.outcome, date });
        break;
    }
  }
  const bridgeRuns = restorableRuns.filter((run) => run.gameId === "before-after" && run.outcome === "completed" && run.result?.status === "solved");
  if (bridgeRuns.length) {
    const key = "mg-games:v1:before-after:progress";
    const current = read(key);
    const solved = { ...(current.solved && typeof current.solved === "object" ? current.solved : {}) };
    const dailyDates = new Set(Array.isArray(current.dailyDates) ? current.dailyDates : []);
    let cloudAttempts = 0;
    for (const run of bridgeRuns) {
      const attempts = Math.max(0, Number(run.result.attempts) || 0);
      cloudAttempts += attempts;
      const progressId = run.mode === "packs" ? `packs:${run.puzzle.id}` : run.puzzle.date ? `daily:${run.puzzle.date}` : `${run.mode}:${run.puzzle.id}`;
      solved[progressId] = {
        attempts,
        durationMs: Math.max(0, Number(run.result.durationMs) || 0),
        solvedAt: run.completedAt ?? run.updatedAt ?? run.startedAt,
      };
      if ((run.mode === "daily" || run.mode === "archive") && /^\d{4}-\d{2}-\d{2}$/.test(run.puzzle.date ?? "")) dailyDates.add(run.puzzle.date);
    }
    write(key, {
      solved,
      totalAttempts: Math.max(Number(current.totalAttempts) || 0, cloudAttempts),
      dailyDates: [...dailyDates].sort(),
    });
  }
}

// Older cloud records stored results only. Recover only fields that are known,
// never fabricate TOKEN cursor positions or DECODE's current signal.
export function legacyNativeCheckpoint(run) {
  const result = run.result;
  const date = run.puzzle.date;
  if (run.gameId === "syllabl" && date && Array.isArray(result.guesses)) return {
    schemaVersion: 2, puzzleDate: date, puzzleLetters: run.puzzle.id.slice(date.length + 1),
    guesses: result.guesses, currentStage: result.stagesCompleted, status: run.outcome === "completed" ? "complete" : "in-progress",
  };
  if (run.gameId === "rarity" && result.submission && date) return {
    ...result.submission, puzzleString: run.puzzle.id.slice(date.length + 1), submittedAt: result.submission.timestamp,
  };
  if (run.gameId === "before-after") return {
    version: 1, puzzleId: run.puzzle.id, mode: run.mode, answerText: "", attempts: result.attempts,
    status: result.status, startedAt: Date.parse(run.startedAt), completedAt: run.completedAt ? Date.parse(run.completedAt) : null, durationMs: result.durationMs,
  };
  if (run.gameId === "dual" && date) return {
    version: 2, puzzleId: run.puzzle.id, dateKey: date,
    submissions: result.submissions.map((submission) => ({ ...submission, typed: submission.surface })),
    startedAt: Date.parse(run.startedAt), finishedAt: run.completedAt ? Date.parse(run.completedAt) : null,
  };
  return null;
}
