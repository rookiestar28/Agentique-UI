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

export const defaultLocale: LocaleCode;
export const localeStorageKey: "agentique.ui.locale.v1";
export const supportedLocales: readonly SupportedLocale[];
export const englishMessages: MessageCatalog;
export const localeCatalogModulePaths: Readonly<Record<LocaleCode, string>>;
export const localeCatalogLoaders: Readonly<Record<LocaleCode, () => Promise<MessageCatalog>>>;

export function isSupportedLocale(value: unknown): value is LocaleCode;
export function normalizeLocale(value: unknown): LocaleCode;
export function getLocaleMetadata(value: unknown): SupportedLocale;
export function readPersistedLocale(storage?: Pick<Storage, "getItem"> | null): LocaleCode;
export function writePersistedLocale(storage: Pick<Storage, "setItem"> | undefined | null, locale: unknown): LocaleCode;
export function getLoadedLocaleCatalog(locale: unknown): MessageCatalog;
export function loadLocaleCatalog(locale: unknown): Promise<MessageCatalog>;
export function loadAllLocaleCatalogs(): Promise<Record<LocaleCode, MessageCatalog>>;
export function createTranslator(locale: unknown, options?: { catalog?: MessageCatalog; fallbackCatalog?: MessageCatalog }): Translator;
export function translate(locale: unknown, messageId: string, params?: Record<string, unknown>, options?: { catalog?: MessageCatalog; fallbackCatalog?: MessageCatalog }): string;
export function translateAsync(locale: unknown, messageId: string, params?: Record<string, unknown>): Promise<string>;
export function translateFromCatalog(catalog: MessageCatalog, fallbackCatalog: MessageCatalog, messageId: string, params?: Record<string, unknown>): string;
export function formatMessage(template: string, params?: Record<string, unknown>): string;
export function flattenMessageKeys(catalog: MessageCatalog): string[];
export function getCatalogParityReport(): Promise<CatalogParityReport>;
