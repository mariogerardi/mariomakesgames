/** Shared schedule reader. Concurrent readers share requests, not stale data. */
export function createStudioRuntime({ fetcher, promoted }) {
  const pending = new Map();
  function request(url) {
    if (!pending.has(url)) pending.set(url, (async () => {
      try {
        const response = await fetcher(url, { cache: "no-store" });
        return response.ok ? await response.json() : null;
      } catch { return null; }
      finally { pending.delete(url); }
    })());
    return pending.get(url);
  }
  function resolve(schedule, puzzles, gameId, mode, date) {
    const slot = schedule?.entries?.find((entry) => entry.gameId === gameId && entry.mode === mode && entry.date === date);
    if (!slot) return null;
    const selected = slot.puzzles.map((reference) => puzzles.find((puzzle) => puzzle.gameId === gameId && puzzle.id === reference.puzzleId && puzzle.revision === reference.revision));
    // Never serve only part of an edition or silently substitute a newer revision.
    return selected.every(Boolean) ? selected : [];
  }
  return {
    async loadSlot(gameId, mode, date) {
      const [schedule, published] = await Promise.all([
        request("/api/studio/schedule"),
        request(`/api/studio/published?gameId=${encodeURIComponent(gameId)}`),
      ]);
      const local = schedule && published ? resolve(schedule.schedule, published.puzzles ?? [], gameId, mode, date) : null;
      return local ?? resolve(promoted.schedule, promoted.puzzles, gameId, mode, date) ?? [];
    },
    async loadPublished(gameId) {
      const published = await request(`/api/studio/published?gameId=${encodeURIComponent(gameId)}`);
      return (published?.puzzles ?? promoted.puzzles).filter((puzzle) => puzzle.gameId === gameId);
    },
  };
}
