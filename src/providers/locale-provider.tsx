import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { t as translate, type AppLocale, type TranslationKey } from '@/lib/i18n';
import { loadLocale, saveLocale } from '@/lib/locale-storage';

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey) => string;
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadLocale().then((loaded) => {
      setLocaleState(loaded);
      setReady(true);
    });
  }, []);

  const setLocale = (next: AppLocale) => {
    setLocaleState(next);
    void saveLocale(next);
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => translate(locale, key),
      ready,
    }),
    [locale, ready]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}
