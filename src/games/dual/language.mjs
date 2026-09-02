export const DUAL_INTERFACE_LANGUAGES = ["en", "en-es", "es"];
export const DEFAULT_DUAL_INTERFACE_LANGUAGE = "en-es";
export const DUAL_INTERFACE_LANGUAGE_EVENT = "dual-interface-language-change";

export function parseDualInterfaceLanguage(value) {
  return DUAL_INTERFACE_LANGUAGES.includes(value)
    ? value
    : DEFAULT_DUAL_INTERFACE_LANGUAGE;
}

export function dualLocalizedText(language, copy, side = "en") {
  if (language === "en") return copy.en;
  if (language === "es") return copy.es;
  return side === "es" ? copy.es : copy.en;
}
