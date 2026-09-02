export type DualInterfaceLanguage = "en" | "en-es" | "es";
export type DualLocalizedCopy = Readonly<{ en: string; es: string }>;

export const DUAL_INTERFACE_LANGUAGES: readonly DualInterfaceLanguage[];
export const DEFAULT_DUAL_INTERFACE_LANGUAGE: DualInterfaceLanguage;
export const DUAL_INTERFACE_LANGUAGE_EVENT: "dual-interface-language-change";

export function parseDualInterfaceLanguage(value: unknown): DualInterfaceLanguage;
export function dualLocalizedText(
  language: DualInterfaceLanguage,
  copy: DualLocalizedCopy,
  side?: "en" | "es",
): string;
