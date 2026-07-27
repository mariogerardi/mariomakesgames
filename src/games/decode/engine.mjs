export {
  DECODE_FEEDBACK,
  createDecodeState,
  decodeTimedWordLength,
  deriveDecodeFeedback,
  evaluateDecodeAttempt,
  tickDecodeClock,
} from "../../contracts/decode.mjs";

export function normalizeDecodeInput(value, length) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, length);
}

export function formatDecodeTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}
