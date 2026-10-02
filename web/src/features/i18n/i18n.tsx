"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isLanguage, translate, type Language, type MessageId, type MessageValues } from "./messages";

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void };
const LanguageContext = createContext<LanguageContextValue>({ language: "en", setLanguage: () => {} });
const locales: Record<Language, string> = { en: "en", te: "te-IN", hi: "hi-IN" };

export function LanguageProvider({ language = "en", children }: { language?: Language; children: React.ReactNode }) {
  const [current, updateLanguage] = useState(language);

  useEffect(() => { document.documentElement.lang = current; }, [current]);

  function setLanguage(next: Language) {
    if (!isLanguage(next)) return;
    document.cookie = `cp_lang=${next}; Path=/; SameSite=Lax; Max-Age=31536000`;
    document.documentElement.lang = next;
    updateLanguage(next);
  }

  return <LanguageContext.Provider value={{ language: current, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useText() {
  const { language } = useLanguage();
  return (id: MessageId, values?: MessageValues) => translate(language, id, values);
}

export function formatDateTime(language: Language, date: Date | string | number, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(locales[language], options).format(date instanceof Date ? date : new Date(date));
}