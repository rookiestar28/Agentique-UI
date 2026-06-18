export type LocaleCode = "en" | "zh-Hans" | "zh-Hant" | "ja" | "ko" | "de" | "fr" | "it" | "es" | "ru";
export type LocaleDirection = "ltr" | "rtl";

export type SupportedLocale = {
  readonly code: LocaleCode;
  readonly englishName: string;
  readonly nativeName: string;
  readonly dir: LocaleDirection;
  readonly enabled: boolean;
};

export type MessageCatalog = {
  readonly [key: string]: string | MessageCatalog;
};

export type CatalogParityLocaleReport = {
  readonly code: LocaleCode;
  readonly keyCount: number;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
};

export type CatalogParityReport = {
  readonly ok: boolean;
  readonly expectedKeyCount: number;
  readonly locales: readonly CatalogParityLocaleReport[];
};

export type Translator = {
  readonly locale: LocaleCode;
  readonly t: (messageId: string, params?: Record<string, unknown>) => string;
};
