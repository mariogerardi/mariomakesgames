export type DecodeMode = "timed" | "daily-5" | "zen";
export type DecodeStatus = "playing" | "expired" | "complete";
export type DecodeState =
  | {
      mode: "timed";
      status: DecodeStatus;
      score: number;
      secondsRemaining: number;
    }
  | {
      mode: "daily-5";
      status: DecodeStatus;
      score: number;
      dailyIndex: number;
      elapsedSeconds: number;
    }
  | {
      mode: "zen";
      status: DecodeStatus;
      score: number;
    };
export type DecodeFeedback = "correct" | "present" | "absent";

export const DECODE_FEEDBACK: Readonly<{
  correct: "correct";
  present: "present";
  absent: "absent";
}>;
export function deriveDecodeFeedback(
  clueWord: string,
  answerWord: string,
): DecodeFeedback[];
export function decodeTimedWordLength(score: number): 4 | 5 | 6 | 7;
export function createDecodeState(mode: DecodeMode): DecodeState;
export function evaluateDecodeAttempt(input: {
  state: DecodeState;
  answer: string;
  guess: string;
}): {
  correct: boolean;
  reason: string | null;
  complete: boolean;
  nextWordLength: 4 | 5 | 6 | 7 | null;
  state: DecodeState;
};
export function tickDecodeClock(
  state: DecodeState,
  seconds?: number,
): DecodeState;
export function normalizeDecodeInput(value: unknown, length: number): string;
export function formatDecodeTime(seconds: number): string;
