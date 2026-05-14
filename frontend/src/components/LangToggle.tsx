"use client";
import { useLang } from "@/components/LangProvider";

export function LangToggle() {
  const { lang, toggle, mounted } = useLang();

  if (!mounted) {
    return <button className="w-9 h-9 rounded-xl" aria-label="Toggle language" />;
  }

  return (
    <button
      onClick={toggle}
      className="px-2 h-9 min-w-9 rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1"
      aria-label="Toggle language"
      title={lang === "ko" ? "Switch to English" : "한국어로 전환"}
    >
      <span className="material-symbols-outlined text-[18px]">translate</span>
      <span className="text-[11px] font-bold tracking-wider uppercase">
        {lang === "ko" ? "KO" : "EN"}
      </span>
    </button>
  );
}
