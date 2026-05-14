"use client";
import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  title: string;
  icon: string; // material symbol name
  href: string;
  badge?: { label: string; cls?: string; style?: { background: string; color: string } };
  summary: string;
  help?: ReactNode; // HelpBtn or custom help element next to title
  children?: ReactNode;
};

export function IndicatorCard({ title, icon, href, badge, summary, help, children }: Props) {
  return (
    <section className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 flex flex-col">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
          <h3 className="text-sm font-bold uppercase tracking-widest text-on-surface">{title}</h3>
          {help}
        </div>
        {badge && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${badge.cls ?? "bg-surface-container-highest text-on-surface-variant"}`}
            style={badge.style}
          >
            {badge.label}
          </span>
        )}
      </header>
      <p className="text-xs text-on-surface-variant leading-relaxed mb-3">{summary}</p>
      {children && <div className="flex-1 mb-3">{children}</div>}
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/70 transition-colors mt-auto"
      >
        자세히 보기
        <span className="material-symbols-outlined text-sm">arrow_forward</span>
      </Link>
    </section>
  );
}
