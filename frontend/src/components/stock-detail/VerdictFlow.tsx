"use client";
import Link from "next/link";
import { regimeBadgeCls, regimeBadgeStyle, gradeClass } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";

type Props = {
  regime: string; // risk_on / neutral / risk_off / crisis
  gate: string; // GO / CAUTION / STOP
  grade: string; // A / B / C / D / F
  action: string; // BUY / WATCH / SMALL BUY / HOLD
  date: string; // YYYY-MM-DD — forwarded to target pages
};

type HelpTopic = "regime" | "gate" | "grade" | "action";

type Step = {
  label: string;
  value: string;
  href: string;
  badgeCls: string;
  badgeStyle?: { background: string; color: string };
  topic: HelpTopic;
};

export function VerdictFlow({ regime, gate, grade, action, date }: Props) {
  const q = `?date=${date}`;
  const g = (grade || "C").charAt(0).toUpperCase();

  const steps: Step[] = [
    {
      label: "Market Regime",
      value: (regime || "neutral").replace("_", " ").toUpperCase(),
      href: `/regime${q}`,
      badgeCls: regimeBadgeCls(regime),
      badgeStyle: regimeBadgeStyle(regime),
      topic: "regime",
    },
    {
      label: "Sector Gate",
      value: gate || "—",
      href: `/regime${q}`,
      badgeCls: regimeBadgeCls(gate),
      badgeStyle: regimeBadgeStyle(gate),
      topic: "gate",
    },
    {
      label: "Stock Grade",
      value: g,
      href: `/ml${q}`,
      badgeCls: gradeClass(g),
      topic: "grade",
    },
    {
      label: "Action",
      value: action || "WATCH",
      href: `/top-picks${q}`,
      badgeCls: regimeBadgeCls(action === "BUY" || action === "SMALL BUY" ? "GO" : action === "HOLD" ? "STOP" : "CAUTION"),
      topic: "action",
    },
  ];

  return (
    <section className="bg-surface-container-low rounded-xl p-6 mb-6 border border-outline-variant/10">
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-4 flex items-center gap-1">
        Decision Flow · 각 단계 클릭 시 원본 페이지로 이동 <HelpBtn topic="verdict" />
      </h4>
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 md:gap-3">
            <Link
              href={s.href}
              className="group flex flex-col items-center px-4 py-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:border-primary/40 hover:bg-surface-container-high transition-colors min-w-[120px]"
            >
              <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 flex items-center gap-1">
                {s.label} <HelpBtn topic={s.topic} />
              </span>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold ${s.badgeCls}`}
                style={s.badgeStyle}
              >
                {s.value}
              </span>
              <span className="text-[9px] text-on-surface-variant/60 group-hover:text-primary mt-1 transition-colors">
                자세히 →
              </span>
            </Link>
            {i < steps.length - 1 && (
              <span className="material-symbols-outlined text-on-surface-variant/40">
                chevron_right
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
