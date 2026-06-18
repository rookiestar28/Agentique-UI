import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createTranslator, defaultLocale, englishMessages, getLocaleMetadata, loadLocaleCatalog, readPersistedLocale, supportedLocales, writePersistedLocale } from "./index.mjs";
import type { LocaleCode, MessageCatalog, SupportedLocale, Translator } from "./types";

type I18nContextValue = {
  locale: LocaleCode;
  localeMetadata: SupportedLocale;
  supportedLocales: readonly SupportedLocale[];
  setLocale: (locale: LocaleCode) => void;
  t: Translator["t"];
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  children: ReactNode;
  initialLocale?: LocaleCode;
};

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => initialLocale ?? getStoredLocale());
  const [catalogs, setCatalogs] = useState<Partial<Record<LocaleCode, MessageCatalog>>>(() => ({
    [defaultLocale]: englishMessages
  }));

  useEffect(() => {
    const metadata = getLocaleMetadata(locale);
    document.documentElement.lang = metadata.code;
    document.documentElement.dir = metadata.dir;
  }, [locale]);

  useEffect(() => {
    if (catalogs[locale]) {
      return undefined;
    }

    let canceled = false;
    loadLocaleCatalog(locale).then((catalog) => {
      if (canceled) return;
      setCatalogs((current) => (current[locale] ? current : { ...current, [locale]: catalog }));
    });
    return () => {
      canceled = true;
    };
  }, [catalogs, locale]);

  const value = useMemo<I18nContextValue>(() => {
    const translator = createTranslator(locale, {
      catalog: catalogs[locale] ?? englishMessages,
      fallbackCatalog: englishMessages
    });
    return {
      locale: translator.locale,
      localeMetadata: getLocaleMetadata(translator.locale),
      supportedLocales,
      setLocale(nextLocale) {
        const normalized = writePersistedLocale(getBrowserStorage(), nextLocale);
        setLocaleState(normalized);
      },
      t: translator.t
    };
  }, [catalogs, locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    return createFallbackContext();
  }
  return value;
}

function createFallbackContext(): I18nContextValue {
  const translator = createTranslator(defaultLocale);
  return {
    locale: translator.locale,
    localeMetadata: getLocaleMetadata(translator.locale),
    supportedLocales,
    setLocale: () => undefined,
    t: translator.t
  };
}

function getStoredLocale(): LocaleCode {
  return readPersistedLocale(getBrowserStorage());
}

function getBrowserStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}
