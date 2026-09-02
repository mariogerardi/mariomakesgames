export function parseDualRunLibrary(payload) {
  const parsed = typeof payload === "string" ? (() => {
    try { return JSON.parse(payload); } catch { return null; }
  })() : payload;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(([dateKey, value]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && value && typeof value === "object" && !Array.isArray(value),
    ),
  );
}

export function upsertDualRun(library, session, serialized) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session.dateKey)) {
    throw new Error(`Invalid DUAL date key: ${session.dateKey}`);
  }
  return { ...library, [session.dateKey]: serialized };
}
