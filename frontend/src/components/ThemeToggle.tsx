"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <button className="w-9 h-9 rounded-xl" aria-label="Toggle theme" />;
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="material-symbols-outlined text-[20px]">
        {theme === "dark" ? "light_mode" : "dark_mode"}
      </span>
    </button>
  );
}
