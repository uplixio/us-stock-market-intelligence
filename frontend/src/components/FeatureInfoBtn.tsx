"use client";
import { useEffect, useState } from "react";

export function FeatureInfoBtn({ description }: { description: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!description) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={description}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-surface-container-highest text-on-surface-variant hover:bg-primary/30 hover:text-primary text-[9px] font-bold leading-none cursor-pointer shrink-0"
      >
        ?
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setOpen(false)}
          />
          <div
            role="tooltip"
            className="fixed left-4 right-4 top-24 z-[9999] sm:absolute sm:inset-auto sm:left-0 sm:top-5 sm:w-96 sm:max-w-[90vw] bg-surface-container-low border border-outline-variant/30 rounded-xl shadow-2xl px-4 py-3 text-sm text-on-surface leading-relaxed normal-case font-normal tracking-normal whitespace-normal"
          >
            {description}
          </div>
        </>
      )}
    </span>
  );
}
