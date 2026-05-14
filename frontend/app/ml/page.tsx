"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { gradeClass, barColor, scoreColor } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";
import { CalendarPicker } from "@/components/CalendarPicker";
import { useT } from "@/lib/i18n";

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
  "13f_score"?: number;
  rs_vs_spy?: number;
  action?: string;
};

type DailyReport = {
  data_date?: string;
  generated_at?: string;
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

export default function MLPage() {
  const t = useT();
  const [date, setDate] = useState<string>(todayStr());
  const [picks, setPicks] = useState<StockPick[]>([]);
  const [screened, setScreened] = useState<number>(0);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [status, setStatus] = useState<string>(t("common.loading"));
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  async function loadReport(dateStr: string) {
    try {
      const r = await fetch(`/api/data/reports?date=${dateStr}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as DailyReport;
      setPicks(d.stock_picks ?? []);
      setScreened(d.summary?.total_screened ?? d.stock_picks?.length ?? 0);
      setGeneratedAt(d.generated_at ?? dateStr);
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
      .then((r) => r.json())
      .then((d: DailyReport) => {
        const dateStr = d.data_date ?? todayStr();
        setPicks(d.stock_picks ?? []);
        setScreened(d.summary?.total_screened ?? d.stock_picks?.length ?? 0);
        setGeneratedAt(d.generated_at ?? dateStr);
        setDate(dateStr);
        setStatus("");
      })
      .catch(() => setStatus("데이터 없음"));
  }, []);

  const maxScore = Math.max(...picks.map((p) => p.composite_score ?? 0), 0.001);

  return (
    <>
      {/* Report Date bar */}
      <div className="flex items-center justify-between mb-6 px-5 py-3 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-lg">leaderboard</span>
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
    <section className="bg-surface-container-low rounded-xl overflow-hidden mb-6">
      {/* Header */}
      <div className="px-8 py-6 border-b border-outline-variant/10 bg-surface-container-high/50">
        <div>
          <h3 className="text-xl font-bold tracking-tight">{t("ml.breakdownTitle")}</h3>
          <p className="text-xs text-on-surface-variant font-medium">
            {t("common.screened")} {screened} · {generatedAt}
          </p>
        </div>
      </div>

      {/* Score legend */}
      <div className="p-4 bg-surface-container-high/20 text-[10px] text-on-surface-variant border-b border-outline-variant/10">
        <b className="text-on-surface">{t("top.colComposite")}</b> — 6 factor weighted sum (Technical + Fundamental + Analyst + RS + Volume + 13F)
      </div>

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
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)] min-h-[400px]">
          <table className="w-full min-w-[1050px] text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-high/20">
                {([
                  { label: t("ml.colNumber") },
                  { label: t("top.colTicker") },
                  { label: t("top.colGrade"), topic: "grade" },
                  { label: t("ml.colComposite"), topic: "composite_score" },
                  { label: t("ml.colTech"), topic: "technical_score" },
                  { label: t("ml.colFund"), topic: "fundamental_score" },
                  { label: t("ml.colAnalyst"), topic: "analyst_score" },
                  { label: t("ml.colRsScore"), topic: "rs_score" },
                  { label: t("ml.colVolume"), topic: "volume_score" },
                  { label: t("ml.col13f"), topic: "score_13f" },
                  { label: t("ml.colRsVsSpy"), topic: "rs_vs_spy" },
                  { label: t("ml.colStrength") },
                ] as { label: string; topic?: string }[]).map((h) => (
                  <th
                    key={h.label}
                    className="px-5 py-4 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1">{h.label}{h.topic && <HelpBtn topic={h.topic} />}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {picks.map((s, i) => {
                const score = s.composite_score ?? 0;
                const pct = (score / maxScore) * 100;
                const gc = gradeClass(s.grade);
                const rsCol = (s.rs_vs_spy ?? 0) > 0 ? "text-primary" : "text-error";

                return (
                  <tr
                    key={s.ticker}
                    className="hover:bg-surface-bright/30 transition-colors"
                  >
                    <td className="px-5 py-4 text-sm font-bold text-on-surface-variant">
                      {String(i + 1).padStart(2, "0")}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/stock/${s.ticker}?date=${date}`}
                          className="text-sm font-bold text-on-surface hover:text-primary hover:underline transition-colors"
                          title={`${s.ticker} 상세 분석`}
                        >
                          {s.ticker}
                        </Link>
                        <span className="text-[10px] text-on-surface-variant">
                          {s.company_name ?? ""}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${gc}`}
                      >
                        {s.grade}
                      </span>
                    </td>
                    <td className={`px-5 py-4 text-sm font-black ${scoreColor(score)}`}>
                      {score.toFixed(1)}
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-medium">
                      {s.technical_score ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-medium">
                      {s.fundamental_score ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-medium">
                      {s.analyst_score ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-medium">
                      {s.rs_score != null ? s.rs_score.toFixed(0) : "—"}
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-medium">
                      {s.volume_score != null ? s.volume_score.toFixed(0) : "—"}
                    </td>
                    <td className="px-5 py-4 text-center text-sm font-medium">
                      {s["13f_score"] ?? "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-sm font-bold ${rsCol}`}>
                        {(s.rs_vs_spy ?? 0) > 0 ? "+" : ""}
                        {s.rs_vs_spy ?? 0}%
                      </span>
                    </td>
                    <td className="px-5 py-4 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor(pct)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-on-surface-variant w-6 text-right">
                          {Math.round(pct)}
                        </span>
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
