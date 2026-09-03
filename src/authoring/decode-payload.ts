import type { DecodeEntryPayload, DecodePayload } from "./contracts.mjs";

export function decodePayloadEntries(payload: DecodePayload): DecodeEntryPayload[] {
  if (Array.isArray(payload.entries)) return payload.entries;
  return [{ answer: payload.answer ?? "", clueWord: payload.clueWord ?? "", clue: payload.clue ?? "" }];
}

export function decodeAuthoringType(payload: DecodePayload) {
  return payload.authoringType ?? "bank";
}
