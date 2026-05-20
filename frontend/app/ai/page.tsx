"use client";
import { useEffect, useState } from "react";
import { gradeClass } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";
import { CalendarPicker } from "@/components/CalendarPicker";

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
  rs_vs_spy?: number;
  action?: string;
};

type DailyReport = {
  data_date?: string;
  generated_at?: string;
  stock_picks?: StockPick[];
};

type AIPoint = string | { point: string; evidence?: string };

type AISummary = {
  thesis: string;
  catalysts: AIPoint[];
  bear_cases: AIPoint[];
  recommendation: string;
  confidence: number | string;
};

function renderPoint(p: AIPoint): { point: string; evidence?: string } {
  if (typeof p === "string") return { point: p };
  return { point: p.point, evidence: p.evidence };
}

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

export default function AIPage() {
  const [date, setDate] = useState<string>("");
  const [picks, setPicks] = useState<StockPick[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [status, setStatus] = useState<string>("로딩 중...");
  const [aiSummaries, setAiSummaries] = useState<Record<string, AISummary>>({});
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  async function loadReport(dateStr: string) {
    try {
      const r = await fetch(`/api/data/reports?date=${dateStr}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as DailyReport;
      setPicks(d.stock_picks ?? []);
      setGeneratedAt(d.generated_at ?? dateStr);
      setDate(dateStr);
      setStatus("");
    } catch {
      setPicks([]);
      setDate(dateStr);
      setStatus("데이터 없음");
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
        setGeneratedAt(d.generated_at ?? dateStr);
        setDate(dateStr);
        setStatus("");
      })
      .catch(() => setStatus("데이터 없음"));

    fetch("/api/data/ai-summaries", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Record<string, AISummary>) => setAiSummaries(d))
      .catch(() => {});
  }, []);

  return (
    <div>
      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-6 px-5 py-3 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-lg">psychology</span>
          <span className="hidden sm:inline text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            Report Date
          </span>
        </div>
        <CalendarPicker
          value={date}
          availableDates={availableDates}
          onChange={(d) => void loadReport(d)}
          onShift={shiftDate}
          status={status}
        />
      </div>

      {picks.length === 0 ? (
        <div className="bg-surface-container-low rounded-xl p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 block mb-3">
            event_busy
          </span>
          <p className="text-sm text-on-surface-variant/60">
            {status === "로딩 중..." ? "로딩 중..." : "해당 날짜에 리포트가 없습니다"}
          </p>
        </div>
      ) : (
        <div>
          {picks.map((s) => {
            const ai = aiSummaries[s.ticker];
            const gc = gradeClass(s.grade);
            const score = s.composite_score ?? 0;
            const rsPos = (s.rs_vs_spy ?? 0) > 0;
            const scoreClr = (v: number | null | undefined) =>
              v == null ? "text-on-surface-variant" : v >= 75 ? "text-primary" : v >= 50 ? "text-secondary" : "text-error";
            const rcBg =
              ai?.recommendation === "BUY"
                ? "from-primary to-primary-container text-on-primary"
                : "from-error to-error-container text-on-error";
            const conf = ai?.confidence ?? 0;

            return (
              <div
                key={s.ticker}
                id={`ai-${s.ticker}`}
                className="glass-panel rounded-xl overflow-hidden mb-6 ring-1 ring-outline-variant/30"
              >
                {/* Card Header */}
                <header className="flex justify-between items-center px-8 py-6 bg-surface-container-lowest/50 border-b border-outline-variant/10">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                      <span
                        className="material-symbols-outlined text-primary"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        psychology
                      </span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight text-on-surface">
                        {s.ticker} AI Analysis
                      </h2>
                      <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest">
                        {s.company_name ?? ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${gc}`}
                    >
                      {s.grade}
                    </span>
                    {ai && (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          ai.recommendation === "BUY"
                            ? "bg-primary/10 text-primary"
                            : "bg-error/10 text-error"
                        }`}
                      >
                        {ai.recommendation ?? "HOLD"}
                      </span>
                    )}
                  </div>
                </header>

                <div className="p-8 space-y-6">
                  {/* Quant Score Cards */}
                  <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {([
                      { label: "Composite", value: score.toFixed(1), color: scoreClr(score), topic: "composite_score" },
                      { label: "Technical", value: String(s.technical_score ?? "—"), color: scoreClr(s.technical_score), topic: "technical_score" },
                      { label: "Fundamental", value: String(s.fundamental_score ?? "—"), color: scoreClr(s.fundamental_score), topic: "fundamental_score" },
                      { label: "Analyst", value: String(s.analyst_score ?? "—"), color: scoreClr(s.analyst_score), topic: "analyst_score" },
                      {
                        label: "RS vs SPY",
                        value: rsPos ? `+${s.rs_vs_spy}%` : `${s.rs_vs_spy ?? 0}%`,
                        color: rsPos ? "text-primary" : "text-error",
                        topic: "rs_vs_spy",
                      },
                    ] as { label: string; value: string; color: string; topic: string }[]).map((m) => (
                      <div
                        key={m.label}
                        className="bg-surface-container-low p-4 rounded-xl text-center border border-outline-variant/10"
                      >
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1 flex items-center justify-center gap-1">
                          {m.label}<HelpBtn topic={m.topic} />
                        </p>
                        <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
                      </div>
                    ))}
                  </section>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {s.strategy && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-container-highest text-on-surface-variant border border-outline-variant/30">
                        {s.strategy}
                      </span>
                    )}
                    {s.setup && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        {s.setup}
                      </span>
                    )}
                    {s.grade_label && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-container-high text-on-surface-variant">
                        {s.grade_label}
                      </span>
                    )}
                    {s.action && (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-surface-container-highest text-on-surface border border-outline-variant/30">
                        Action: {s.action}
                      </span>
                    )}
                  </div>

                  {/* AI Thesis */}
                  {ai ? (
                    <>
                      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-4">
                          <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                            Investment Thesis <HelpBtn topic="ai_thesis" />
                          </h3>
                          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/20 leading-relaxed text-on-surface">
                            {ai.thesis ?? "N/A"}
                          </div>
                        </div>
                        <div className="flex flex-col justify-center">
                          <div className="bg-surface-container-high p-6 rounded-xl border border-outline-variant/30 flex flex-col items-center text-center">
                            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-tighter mb-2 flex items-center justify-center gap-1">
                              AI Signal Strength <HelpBtn topic="confidence" />
                            </span>
                            <div className="text-4xl font-black text-primary tracking-tighter text-glow-primary mb-4">
                              {conf}%
                            </div>
                            <div
                              className={`w-full py-3 rounded-lg bg-gradient-to-br ${rcBg} font-bold text-lg text-center`}
                            >
                              {ai.recommendation ?? "HOLD"}
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {ai.catalysts && ai.catalysts.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                              <span className="material-symbols-outlined text-sm">trending_up</span>
                              <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                                Bull Catalysts <HelpBtn topic="catalysts" />
                              </h4>
                            </div>
                            <div className="space-y-3">
                              {ai.catalysts.map((c, i) => {
                                const r = renderPoint(c);
                                return (
                                  <div
                                    key={i}
                                    className="p-4 rounded-lg bg-surface-container-lowest border-l-4 border-primary"
                                  >
                                    <p className="text-sm font-semibold text-on-surface">
                                      {r.point}
                                    </p>
                                    {r.evidence && (
                                      <p className="text-xs text-on-surface-variant mt-1 italic">
                                        {r.evidence}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {ai.bear_cases && ai.bear_cases.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-error">
                              <span className="material-symbols-outlined text-sm">report_problem</span>
                              <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-1">
                                Bear Risks <HelpBtn topic="bear_cases" />
                              </h4>
                            </div>
                            <div className="space-y-3">
                              {ai.bear_cases.map((b, i) => {
                                const r = renderPoint(b);
                                return (
                                  <div
                                    key={i}
                                    className="p-4 rounded-lg bg-surface-container-lowest border-l-4 border-error"
                                  >
                                    <p className="text-sm font-semibold text-on-surface">
                                      {r.point}
                                    </p>
                                    {r.evidence && (
                                      <p className="text-xs text-on-surface-variant mt-1 italic">
                                        {r.evidence}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <div className="bg-surface-container-high/30 rounded-xl p-4 text-center border border-outline-variant/10">
                      <p className="text-xs text-on-surface-variant">
                        AI deep analysis available for latest date only
                      </p>
                    </div>
                  )}
                </div>

                <footer className="px-8 py-4 bg-surface-container-lowest/80 flex justify-between items-center text-[10px] text-on-surface-variant/60 uppercase font-medium border-t border-outline-variant/10">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-glow"></span>
                    <span>AI Engine - Neural Analysis Active</span>
                  </div>
                  <div>{generatedAt}</div>
                </footer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
