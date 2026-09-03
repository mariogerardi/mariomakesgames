export function isLocalStudioHost(host: string | null) {
  const candidate = String(host ?? "").split(",")[0].trim();
  const hostname = candidate.startsWith("[")
    ? candidate.slice(1, candidate.indexOf("]"))
    : candidate.replace(/:\d+$/, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
