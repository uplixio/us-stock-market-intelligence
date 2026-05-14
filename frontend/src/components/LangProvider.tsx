"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "ko" | "en";

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  mounted: boolean;
};

const LangContext = createContext<LangContextValue>({
  lang: "ko",
  setLang: () => {},
  toggle: () => {},
  mounted: false,
});

const STORAGE_KEY = "lang";

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ko");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      if (saved === "ko" || saved === "en") setLangState(saved);
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.setAttribute("lang", lang);
    } catch {}
  }, [lang, mounted]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggle = useCallback(() => setLangState((p) => (p === "ko" ? "en" : "ko")), []);

  return (
    <LangContext.Provider value={{ lang, setLang, toggle, mounted }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
