import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DUAL_INTERFACE_LANGUAGE,
  dualLocalizedText,
  parseDualInterfaceLanguage,
} from "../../src/games/dual/language.mjs";

test("DUAL defaults unknown or missing interface preferences to EN/ES", () => {
  assert.equal(DEFAULT_DUAL_INTERFACE_LANGUAGE, "en-es");
  assert.equal(parseDualInterfaceLanguage(null), "en-es");
  assert.equal(parseDualInterfaceLanguage("unexpected"), "en-es");
  assert.equal(parseDualInterfaceLanguage("en"), "en");
  assert.equal(parseDualInterfaceLanguage("es"), "es");
});

test("DUAL split copy follows its physical language side", () => {
  const copy = { en: "Settings", es: "Ajustes" };
  assert.equal(dualLocalizedText("en-es", copy, "en"), "Settings");
  assert.equal(dualLocalizedText("en-es", copy, "es"), "Ajustes");
  assert.equal(dualLocalizedText("en", copy, "es"), "Settings");
  assert.equal(dualLocalizedText("es", copy, "en"), "Ajustes");
});
