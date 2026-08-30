import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { defaultLanguage, interpolate, translations, type Language, type TranslationKey } from './translations';

const STORAGE_KEY = 'de-pseudo-language';

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'fi' || stored === 'en' || stored === 'sv') return stored;
  } catch { /* localStorage unavailable (private mode, etc.) — fall back to default */ }
  return defaultLanguage;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  function setLanguage(next: Language) {
    setLanguageState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore persistence failure */ }
  }

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t: (key, vars) => interpolate(translations[language][key] ?? translations[defaultLanguage][key] ?? key, vars),
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
