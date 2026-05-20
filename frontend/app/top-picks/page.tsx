"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { gradeClass, barColor, scoreColor } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";
import { CalendarPicker } from "@/components/CalendarPicker";
import { useT, mapAction, mapStrategy, mapSetup, translate } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";

type StockPick = {
  ticker: string;
  company_name?: string;
  composite_score?: number;
  grade: string;
  grade_label?: string;
  strategy?: string;
  setup?: string;
  technical_score?: number;
  fundamental_score?: number;
  analyst_score?: number;
  rs_score?: number;
  volume_score?: number;
  rs_vs_spy?: number;
  action?: string;
};

type DailyReport = {
  data_date?: string;
  stock_picks?: StockPick[];
  summary?: { total_screened?: number };
};

function todayStr() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default function TopPicksPage() {
  const t = useT();
  const { lang } = useLang();
  const [date, setDate] = useState<string>("");
  const [picks, setPicks] = useState<StockPick[]>([]);
  const [screened, setScreened] = useState<number>(0);
  const [status, setStatus] = useState<string>(t("common.loading"));
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  async function loadReport(dateStr: string) {
    try {
      const r = await fetch(`/api/data/reports?date=${dateStr}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as DailyReport;
      setPicks(d.stock_picks ?? []);
      setScreened(d.summary?.total_screened ?? d.stock_picks?.length ?? 0);
      setDate(dateStr);
      setStatus("");
    } catch {
      setPicks([]);
      setDate(dateStr);
      setStatus(t("common.noData"));
    }
  }

  function shiftDate(delta: number) {
    if (availableDates.size === 0) return;
    const sorted = Array.from(availableDates).sort();
    const idx = sorted.indexOf(date);
    if (idx === -1) return;
    const next = sorted[idx + delta];
    if (next) void loadReport(next);
    else setStatus("데이터 없음");
  }

  useEffect(() => {
    fetch("/api/data/dates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { dates: string[] }) => setAvailableDates(new Set(d.dates)))
      .catch(() => {});

    fetch("/api/data/reports?date=latest", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: DailyReport) => {
        const dateStr = d.data_date ?? "";
        setPicks(d.stock_picks ?? []);
        setScreened(d.summary?.total_screened ?? d.stock_picks?.length ?? 0);
        setDate(dateStr);
        setStatus("");
      })
      .catch(() => setStatus("데이터 없음"));
  }, []);

  return (
    <>
      {/* Report Date bar */}
      <div className="flex items-center justify-between mb-6 px-5 py-3 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-lg">star</span>
          <span className="hidden sm:inline text-xs font-bold text-on-surface-variant uppercase tracking-widest">{t("common.reportDate")}</span>
        </div>
        <CalendarPicker
          value={date}
          availableDates={availableDates}
          onChange={(d) => void loadReport(d)}
          onShift={shiftDate}
          status={status !== t("common.loading") ? status : undefined}
        />
      </div>
    <section className="bg-surface-container-low rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-outline-variant/10 bg-surface-container-high/50">
        <div>
          <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">{t("top.heroTitle")} <HelpBtn topic="smart_money_screening" /></h3>
          <p className="text-xs text-on-surface-variant font-medium">
            {translate(lang, "top.heroSubtitle", { n: screened })}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {picks.length === 0 ? (
        <div className="p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-3">
            event_busy
          </span>
          <p className="text-sm text-on-surface-variant/60">
            {status === t("common.loading") ? t("common.loading") : t("dash.reportNotFound")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high/20">
                {([
                  { label: "#" },
                  { label: t("top.colTicker") },
                  { label: t("top.colGrade"), topic: "grade" },
                  { label: t("top.colComposite"), topic: "composite_score" },
                  { label: t("top.colStrategy"), topic: "strategy" },
                  { label: t("top.colSetup"), topic: "setup" },
                  { label: t("top.colTech"), topic: "technical_score" },
                  { label: t("top.colFund"), topic: "fundamental_score" },
                  { label: t("top.colAnalyst"), topic: "analyst_score" },
                  { label: t("top.colRs"), topic: "rs_vs_spy" },
                  { label: t("top.colAction"), topic: "action" },
                ] as { label: string; topic?: string }[]).map((h) => (
                  <th
                    key={h.label}
                    className="px-6 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1">{h.label}{h.topic && <HelpBtn topic={h.topic} />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {picks.map((s, i) => {
                const gc = gradeClass(s.grade);
                const score = s.composite_score ?? 0;
                const bw = Math.min(score, 100);
                const bc = barColor(bw);
                const rsCol = (s.rs_vs_spy ?? 0) > 0 ? "text-primary" : "text-error";
                const action = s.action ?? "WATCH";
                const actionBg =
                  action === "BUY" || action === "STRONG BUY"
                    ? "bg-primary-container text-on-primary font-bold ring-2 ring-primary/20"
                    : action === "WATCH"
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "bg-surface-container-highest text-on-surface-variant border border-outline-variant/30";

                return (
                  <tr
                    key={s.ticker}
                    className={`hover:bg-surface-bright/30 transition-colors group animate-fade-in-up stagger-${Math.min(i + 1, 10)}`}
                  >
                    <td className="px-6 py-5 text-sm font-medium text-on-surface-variant">
                      {String(i + 1).padStart(2, "0")}
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <Link
                          href={`/stock/${s.ticker}?date=${date}`}
                          className="text-sm font-black tracking-tight group-hover:text-primary transition-colors hover:underline"
                          title={`${s.ticker} 상세 분석`}
                        >
                          {s.ticker}
                        </Link>
                        <span className="text-[10px] text-on-surface-variant">
                          {s.company_name ?? ""}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex flex-col items-start gap-0.5">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${gc}`}
                        >
                          {s.grade}
                        </span>
                        {s.grade_label && (
                          <span className="text-[9px] text-on-surface-variant leading-tight max-w-[90px]">
                            {s.grade_label}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</span>
                        <div className="flex-1 h-1.5 w-24 bg-surface-container-highest rounded-full overflow-hidden">
                          <div className={`${bc} h-full`} style={{ width: `${bw}%` }} />
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5 text-sm text-on-surface-variant">
                      {mapStrategy(lang, s.strategy) || "—"}
                    </td>
                    <td className="px-6 py-5 text-sm text-on-surface-variant">
                      {mapSetup(lang, s.setup) || "—"}
                    </td>
                    <td className="px-6 py-5 text-center text-sm font-medium">
                      {s.technical_score ?? "—"}
                    </td>
                    <td className="px-6 py-5 text-center text-sm font-medium">
                      {s.fundamental_score ?? "—"}
                    </td>
                    <td className="px-6 py-5 text-center text-sm font-medium">
                      {s.analyst_score ?? "—"}
                    </td>

                    <td className="px-6 py-5">
                      <span className={`text-sm font-bold ${rsCol}`}>
                        {(s.rs_vs_spy ?? 0) > 0 ? "+" : ""}
                        {s.rs_vs_spy ?? 0}%
                      </span>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-tighter font-bold ${actionBg}`}
                        >
                          {mapAction(lang, action)}
                        </span>
                        <a
                          href={`https://kr.tradingview.com/chart/?symbol=${s.ticker}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-primary/10 transition-colors"
                          title="TradingView 차트"
                        >
                          <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary text-base">
                            open_in_new
                          </span>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
    </>
  );
}
