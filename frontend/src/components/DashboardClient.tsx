"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { LatestReport, RegimeConfig, StockPick, RiskAlertData, RiskAlert } from "@/lib/data";
import { C, regimeBadgeCls, regimeBadgeStyle, gradeClass } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";
import { CalendarPicker } from "@/components/CalendarPicker";
import { useT, mapRegime, mapGate, mapAction, mapSensorKey } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";

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

type LiveQuote = {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
};

type LiveSnapshot = {
  generated_at: string;
  market_date: string;
  market_timezone: string;
  session_state: "pre_market" | "regular" | "after_hours" | "closed";
  regime: string;
  label: string;
  core: LiveQuote[];
  sectors: LiveQuote[];
};

function sessionLabel(s: LiveSnapshot["session_state"] | undefined) {
  if (s === "pre_market") return "PRE-MARKET";
  if (s === "regular") return "LIVE";
  if (s === "after_hours") return "AFTER-HOURS";
  return "CLOSED";
}

function formatIsoDate(dateStr: string | undefined) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${year}. ${month}. ${day}.`;
}

function formatLiveTime(ts: string | null | undefined) {
  if (!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function quoteColor(changePct: number | null) {
  if (changePct == null) return "text-on-surface-variant";
  if (changePct > 0) return "text-primary";
  if (changePct < 0) return "text-error";
  return "text-on-surface-variant";
}

export function DashboardClient() {
  const t = useT();
  const { lang } = useLang();
  const [date, setDate] = useState<string>(todayStr());
  const [report, setReport] = useState<LatestReport | null>(null);
  const [regime, setRegime] = useState<RegimeConfig>({} as RegimeConfig);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [status, setStatus] = useState<string>(t("common.loading"));
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [riskData, setRiskData] = useState<RiskAlertData | null>(null);

  async function loadReport(dateStr: string) {
    try {
      const r = await fetch(`/api/data/reports?date=${dateStr}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as LatestReport;
      setReport(data);
      setDate(dateStr);
      setStatus("");
    } catch {
      setReport(null);
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
    else setStatus(t("common.noData"));
  }

  useEffect(() => {
    fetch("/api/data/dates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { dates: string[] }) => setAvailableDates(new Set(d.dates)))
      .catch(() => {});

    // CSR: 최신 리포트 + regime 초기 로딩
    fetch("/api/data/reports?date=latest", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: LatestReport) => {
        setReport(d);
        setDate(d.data_date ?? todayStr());
        setStatus("");
      })
      .catch(() => setStatus("데이터 없음"));

    fetch("/api/data/regime", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: RegimeConfig) => setRegime(d))
      .catch(() => {});

    fetch("/api/data/risk?date=latest", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: RiskAlertData) => setRiskData(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveSnapshot() {
      try {
        const res = await fetch("/api/live/market-snapshot", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LiveSnapshot;
        if (!cancelled) setLive(data);
      } catch {
        if (!cancelled) setLive(null);
      }
    }

    void loadLiveSnapshot();
    const timer = window.setInterval(loadLiveSnapshot, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const mt = report?.market_timing;
  const r = mt?.regime ?? regime.regime ?? "neutral";
  const score = mt?.regime_score ?? regime.weighted_score ?? 0;
  const conf = mt?.regime_confidence ?? regime.confidence ?? 0;
  const gate = mt?.gate ?? "CAUTION";
  const gateScore = mt?.gate_score ?? 0;
  const verdict = report?.verdict ?? "CAUTION";
  const picks: StockPick[] = report?.stock_picks ?? [];
  const summary = report?.summary ?? {};
  const spy = mt?.ml_predictor?.spy;
  const qqq = mt?.ml_predictor?.qqq;
  const signals = regime.signals ?? {};
  const adaptive = regime.adaptive_params ?? { stop_loss: "N/A", max_drawdown_warning: "N/A" };

  const verdictColor =
    verdict === "GO" ? C.risk_on : verdict === "STOP" ? C.crisis : C.neutral;
  const gateIcon =
    verdict === "GO" ? "check_circle" : verdict === "STOP" ? "block" : "warning";
  const gateBg =
    verdict === "GO"
      ? "bg-primary-container text-on-primary-container"
      : verdict === "STOP"
        ? "bg-error-container text-on-error-container"
        : "bg-secondary-container text-black";

  return (
    <div>
      {/* Hero */}
      <div className="bg-surface-container-low p-5 md:p-8 rounded-xl mb-6 relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-[clamp(1rem,4.5vw,2.5rem)] font-bold tracking-tight text-on-surface mb-2 flex flex-wrap items-center gap-2 md:gap-3">
            {t("dash.heroTitle")} <HelpBtn topic="verdict" />
          </h2>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              {t("live")}
            </span>
            <p className="text-xs sm:text-sm text-on-surface-variant">
              {t("dash.heroSubtitle")}
            </p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <span className="material-symbols-outlined" style={{ fontSize: "120px" }}>
            monitoring
          </span>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-6 px-5 py-3 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
          <span className="hidden sm:inline text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            확정 일일 리포트 날짜
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

      {!report ? (
        <div className="bg-surface-container-low rounded-xl p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-4">
            event_busy
          </span>
          <p className="text-lg font-bold text-on-surface-variant mb-2">{date}</p>
          <p className="text-sm text-on-surface-variant/60">{t("dash.reportNotFound")}</p>
          <p className="text-xs text-on-surface-variant/40 mt-2">
            {t("dash.reportNotFoundHint")}
          </p>
        </div>
      ) : (
        <>
          {/* Live Snapshot */}
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-5 mb-6 overflow-hidden">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(420px,640px)] gap-5 xl:items-center">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary">sensors</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black text-on-surface uppercase tracking-widest">
                      오늘 라이브 스냅샷
                    </p>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container">
                      장중 임시값
                    </span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                      {sessionLabel(live?.session_state)}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1">
                    미국 시장일 {formatIsoDate(live?.market_date)} · 라이브 갱신 {formatLiveTime(live?.generated_at)} · 확정 리포트는 {report.data_date ?? date}입니다.
                  </p>
                </div>
              </div>

              {live ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 min-w-0">
                  <div className="bg-surface-container-high/40 rounded-lg px-3 py-2 border border-outline-variant/10 min-w-0">
                    <p className="text-[9px] text-on-surface-variant font-bold uppercase">Bias</p>
                    <p className="text-sm font-black text-on-surface truncate">{mapRegime(lang, live.regime)}</p>
                  </div>
                  {live.core.map((q) => (
                    <div key={q.symbol} className="bg-surface-container-high/40 rounded-lg px-3 py-2 border border-outline-variant/10 min-w-0">
                      <p className="text-[9px] text-on-surface-variant font-bold">{q.symbol}</p>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <p className="text-sm font-black text-on-surface truncate">{q.price ?? "-"}</p>
                        <p className={`text-[10px] font-bold ${quoteColor(q.changePct)}`}>
                          {q.changePct == null ? "-" : `${q.changePct >= 0 ? "+" : ""}${q.changePct}%`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-16 w-full rounded-lg bg-surface-container-high/30 animate-pulse" />
              )}
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <div className="bg-surface-container-low p-4 md:p-6 rounded-xl relative overflow-hidden">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                {t("common.verdict")} <HelpBtn topic="verdict" />
              </p>
              <p className="text-3xl font-black tracking-tighter" style={{ color: verdictColor }}>
                {mapGate(lang, verdict)}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">{t("common.regime")} {mapRegime(lang, r)}</p>
            </div>
            <div className="bg-surface-container-low p-4 md:p-6 rounded-xl">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                {t("common.confidence")} <HelpBtn topic="confidence" value={conf} />
              </p>
              <p className={`text-3xl font-black tracking-tighter ${conf >= 90 ? "text-primary" : conf >= 60 ? "text-secondary" : "text-error"}`}>{conf}%</p>
              <p className={`text-xs mt-1 ${(score ?? 0) >= 2 ? "text-primary" : (score ?? 0) >= 1 ? "text-secondary" : "text-error"}`}>{t("common.score")} {score}</p>
            </div>
            <div className="bg-surface-container-low p-4 md:p-6 rounded-xl">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                {t("common.screened")} <HelpBtn topic="picks" value={summary.total_screened ?? picks.length} />
              </p>
              <p className="text-3xl font-black tracking-tighter text-on-surface">
                {summary.total_screened ?? picks.length}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">{t("common.stocksAnalyzed")}</p>
            </div>
            <div className="bg-surface-container-low p-4 md:p-6 rounded-xl border border-primary/20">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                {t("common.marketGate")} <HelpBtn topic="gate" value={gate} />
              </p>
              <p
                className="text-3xl font-black tracking-tighter"
                style={{
                  color: gate === "GO" ? C.risk_on : gate === "STOP" ? C.crisis : C.neutral,
                }}
              >
                {mapGate(lang, gate)}
              </p>
              <p className="text-xs text-on-surface-variant mt-1">{t("common.score")} {gateScore}</p>
            </div>
          </div>

          {/* 2-col */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Signals */}
              <div className="bg-surface-container-low rounded-xl p-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6 flex items-center gap-2">
                  {t("dash.coreIndicators")} <HelpBtn topic="regime" value={score} />
                </h4>
                <div className="flex flex-wrap gap-4">
                  {spy?.direction && (
                    <div className="bg-surface-container-lowest p-4 rounded-lg flex-1 min-w-[calc(50%-8px)] md:min-w-[140px] border border-outline-variant/5">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-2 flex items-center gap-1">
                        SPY 5D <HelpBtn topic="ml" value={`${spy.direction}:${spy.confidence_pct ?? 0}`} />
                      </p>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${regimeBadgeCls(spy.direction)}`}
                        style={regimeBadgeStyle(spy.direction)}
                      >
                        {mapRegime(lang, spy.direction)}{" "}
                        {spy.predicted_return > 0 ? "+" : ""}
                        {spy.predicted_return}%
                      </span>
                      <p className={`text-[9px] font-bold mt-1 ${(spy.confidence_pct ?? 0) >= 70 ? "text-primary" : (spy.confidence_pct ?? 0) >= 50 ? "text-secondary" : "text-error"}`}>
                        {t("status.confidence")} {spy.confidence_pct ?? 0}% · {(spy.confidence_pct ?? 0) >= 70 ? t("status.high") : (spy.confidence_pct ?? 0) >= 50 ? t("status.medium") : t("status.low")}
                      </p>
                    </div>
                  )}
                  {qqq?.direction && (
                    <div className="bg-surface-container-lowest p-4 rounded-lg flex-1 min-w-[calc(50%-8px)] md:min-w-[140px] border border-outline-variant/5">
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-2 flex items-center gap-1">
                        QQQ 5D <HelpBtn topic="ml" value={`${qqq.direction}:${qqq.confidence_pct ?? 0}`} />
                      </p>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${regimeBadgeCls(qqq.direction)}`}
                        style={regimeBadgeStyle(qqq.direction)}
                      >
                        {mapRegime(lang, qqq.direction)}{" "}
                        {qqq.predicted_return > 0 ? "+" : ""}
                        {qqq.predicted_return}%
                      </span>
                      <p className={`text-[9px] font-bold mt-1 ${(qqq.confidence_pct ?? 0) >= 70 ? "text-primary" : (qqq.confidence_pct ?? 0) >= 50 ? "text-secondary" : "text-error"}`}>
                        {t("status.confidence")} {qqq.confidence_pct ?? 0}% · {(qqq.confidence_pct ?? 0) >= 70 ? t("status.high") : (qqq.confidence_pct ?? 0) >= 50 ? t("status.medium") : t("status.low")}
                      </p>
                    </div>
                  )}
                  <div className="bg-surface-container-lowest p-4 rounded-lg flex-1 min-w-[calc(50%-8px)] md:min-w-[140px] border border-outline-variant/5">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-2 flex items-center gap-1">
                      {t("sensor.regime")} <HelpBtn topic="regime" />
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${regimeBadgeCls(r)}`}
                      style={regimeBadgeStyle(r)}
                    >
                      {mapRegime(lang, r)}
                    </span>
                  </div>
                  <div className="bg-surface-container-lowest p-4 rounded-lg flex-1 min-w-[calc(50%-8px)] md:min-w-[140px] border border-outline-variant/5">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-2 flex items-center gap-1">
                      {t("sensor.gate")} <HelpBtn topic="gate" />
                    </p>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${regimeBadgeCls(gate)}`}
                      style={regimeBadgeStyle(gate)}
                    >
                      {mapGate(lang, gate)}
                    </span>
                  </div>
                  {/* Sensor fallback */}
                  {Object.entries(signals).map(([k, v]) => (
                    <div
                      key={k}
                      className="bg-surface-container-lowest p-4 rounded-lg flex-1 min-w-[calc(50%-8px)] md:min-w-[140px] border border-outline-variant/5"
                    >
                      <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-2 flex items-center gap-1">
                        {mapSensorKey(k)} <HelpBtn topic="regime" />
                      </p>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${regimeBadgeCls(v as string)}`}
                        style={regimeBadgeStyle(v as string)}
                      >
                        {mapRegime(lang, String(v))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top 5 Alpha Picks */}
              <div className="bg-surface-container-low rounded-xl overflow-hidden">
                <div className="p-6 border-b border-outline-variant/10 flex justify-between items-center">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                    {t("dash.topAlphaPicks")} <HelpBtn topic="picks" />
                  </h4>
                  <Link
                    href="/top-picks"
                    className="text-xs font-bold text-primary flex items-center gap-1"
                  >
                    {t("dash.fullTerminal")}{" "}
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </Link>
                </div>
                <div>
                  {picks.slice(0, 5).map((stock, i) => {
                    const action = stock.action ?? "WATCH";
                    const actBg =
                      action === "BUY" || action === "SMALL BUY"
                        ? "bg-primary/10 text-primary"
                        : action === "HOLD"
                          ? "bg-error/10 text-error"
                          : "bg-secondary/10 text-secondary";
                    return (
                      <div
                        key={stock.ticker}
                        className={`flex items-center px-6 py-4 hover:bg-surface-bright/30 transition-colors border-b border-outline-variant/5 animate-fade-in-up stagger-${i + 1}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-xs font-bold mr-4">
                          {stock.ticker.charAt(0)}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-on-surface">{stock.ticker}</p>
                          <p className="text-[10px] text-on-surface-variant">
                            {stock.company_name ?? ""}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-bold mr-3 ${actBg}`}
                        >
                          {mapAction(lang, action)}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold mr-4 ${gradeClass(stock.grade)}`}
                        >
                          {stock.grade}
                        </span>
                        <p className="text-sm font-bold text-on-surface mr-3">
                          {stock.composite_score ?? 0}
                        </p>
                        <a
                          href={`https://kr.tradingview.com/chart/?symbol=${stock.ticker}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-primary/10 transition-colors"
                          title="TradingView"
                        >
                          <span className="material-symbols-outlined text-on-surface-variant hover:text-primary text-base">
                            open_in_new
                          </span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Market Gate card */}
              <div
                className={`${gateBg} rounded-xl p-8 shadow-2xl flex flex-col items-center text-center`}
              >
                <span
                  className="material-symbols-outlined text-5xl mb-4"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {gateIcon}
                </span>
                <h5 className="text-3xl font-black tracking-tighter mb-2">{mapGate(lang, verdict)}</h5>
                <p className="text-sm font-bold uppercase tracking-widest opacity-80 mb-6 flex items-center justify-center gap-2">
                  {t("dash.integratedVerdict")} <HelpBtn topic="verdict" />
                </p>
                <div className="w-full bg-black/10 p-4 rounded-lg mb-4">
                  <p className="text-[10px] font-bold uppercase mb-1 flex items-center justify-center gap-1">{t("dash.gateScore")} <HelpBtn topic="gate" /></p>
                  <p className="text-4xl font-black">{gateScore}</p>
                </div>
                <div className="flex gap-4 text-sm">
                  <span>{t("common.regime")}: {mapRegime(lang, r)}</span>
                  <span>{t("common.confidence")}: {conf}%</span>
                </div>
                <div className="flex gap-4 text-[10px] mt-2 opacity-80">
                  <span>{t("regime.stopLoss")}: {adaptive.stop_loss}</span>
                  <span>MDD: {adaptive.max_drawdown_warning}</span>
                </div>
              </div>

              {/* Breadth Gauge */}
              <div className="bg-surface-container-low rounded-xl p-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6 flex items-center gap-2">
                  {t("dash.breadthGauge")} <HelpBtn topic="regime" />
                </h4>
                {(() => {
                  const breadthAbove = (report?.market_timing as Record<string, unknown> | undefined)
                    ?.breadth_above_200ma as number | undefined;
                  const breadthPct = (() => {
                    if (typeof breadthAbove === "number")
                      return Math.max(5, Math.min(95, breadthAbove));
                    const signal = signals.breadth;
                    if (signal === "risk_on") return 75;
                    if (signal === "risk_off") return 30;
                    return 50;
                  })();
                  return (
                    <>
                      <div className="relative h-4 w-full bg-surface-container-highest rounded-full overflow-hidden mb-2">
                        <div
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-secondary-fixed-dim to-primary"
                          style={{ width: `${breadthPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase">
                        <span>{t("dash.bearish")}</span>
                        <span>{t("dash.neutral")}</span>
                        <span>{t("dash.bullish")}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* AI Feed */}
              <div className="bg-surface-container-low rounded-xl p-6">
                <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6 flex items-center gap-2">
                  {t("dash.aiFeed")} <HelpBtn topic="ai_thesis" />
                </h4>
                <div className="space-y-4">
                  {picks.slice(0, 3).map((stock) => {
                    const isUp = (stock.rs_vs_spy ?? 0) > 0;
                    return (
                      <div key={stock.ticker} className="flex gap-4">
                        <div
                          className={`w-1 h-10 rounded-full ${isUp ? "bg-primary" : "bg-error"}`}
                        ></div>
                        <div>
                          <p className="text-xs text-on-surface font-bold">
                            {mapAction(lang, stock.action ?? "WATCH")}: {stock.ticker}
                          </p>
                          <p className="text-[10px] text-on-surface-variant">
                            {t("top.colGrade")} {stock.grade} · {t("common.score")} {stock.composite_score ?? 0} · RS{" "}
                            {(stock.rs_vs_spy ?? 0) > 0 ? "+" : ""}
                            {stock.rs_vs_spy ?? 0}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Risk Alert Section */}
          {riskData && (
            <div className="mt-6 space-y-6">
              {/* Risk Overview Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-container-low p-4 md:p-6 rounded-xl">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                    {t("dash.riskStatus")} <HelpBtn topic="risk_alert" />
                  </p>
                  <p className={`text-3xl font-black tracking-tighter ${
                    (riskData.alerts?.filter((a: RiskAlert) => a.level === "CRITICAL").length ?? 0) > 0
                      ? "text-error"
                      : (riskData.alerts?.filter((a: RiskAlert) => a.level === "WARNING").length ?? 0) > 0
                        ? "text-secondary"
                        : "text-primary"
                  }`}>
                    {(riskData.alerts?.filter((a: RiskAlert) => a.level === "CRITICAL").length ?? 0) > 0
                      ? t("dash.alert")
                      : (riskData.alerts?.filter((a: RiskAlert) => a.level === "WARNING").length ?? 0) > 0
                        ? t("dash.watch")
                        : t("dash.clear")}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {riskData.alerts?.filter((a: RiskAlert) => a.level === "CRITICAL").length ?? 0} {t("common.critical")} ·{" "}
                    {riskData.alerts?.filter((a: RiskAlert) => a.level === "WARNING").length ?? 0} {t("common.warning")}
                  </p>
                </div>

                <div className="bg-surface-container-low p-4 md:p-6 rounded-xl">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                    {t("dash.allocation")} <HelpBtn topic="position_sizing" />
                  </p>
                  <p className="text-3xl font-black tracking-tighter text-on-surface">
                    {riskData.portfolio_summary?.invested_pct ?? 0}%
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {t("dash.invested")} {riskData.portfolio_summary?.invested_pct ?? 0}% · {t("dash.cash")} {riskData.portfolio_summary?.cash_pct ?? 100}%
                  </p>
                </div>

                <div className="bg-surface-container-low p-4 md:p-6 rounded-xl">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                    {t("dash.var5d")} <HelpBtn topic="var_risk" />
                  </p>
                  <p className={`text-3xl font-black tracking-tighter ${
                    riskData.portfolio_summary?.risk_budget_status === "EXCEEDED"
                      ? "text-error"
                      : riskData.portfolio_summary?.risk_budget_status === "WARNING"
                        ? "text-secondary"
                        : "text-primary"
                  }`}>
                    ${(riskData.portfolio_summary?.total_var_dollar ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {t("dash.budget")}: {riskData.portfolio_summary?.risk_budget_status ?? "N/A"}
                  </p>
                </div>

                <div className="bg-surface-container-low p-4 md:p-6 rounded-xl">
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide md:tracking-widest mb-2 md:mb-3 flex items-center gap-1">
                    {t("dash.portfolio")} <HelpBtn topic="concentration" />
                  </p>
                  <p className="text-3xl font-black tracking-tighter text-on-surface">
                    ${((riskData.portfolio_summary?.total_value ?? 100000) / 1000).toFixed(0)}K
                  </p>
                  <p className="text-xs text-on-surface-variant mt-1">
                    {t("dash.totalValue")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Alerts List */}
                <div className="lg:col-span-2 bg-surface-container-low rounded-xl overflow-hidden">
                  <div className="p-6 border-b border-outline-variant/10">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                      {t("dash.riskAlerts")} <HelpBtn topic="risk_alert" />
                    </h4>
                  </div>
                  <div>
                    {(riskData.alerts ?? [])
                      .filter((a: RiskAlert) => a.level !== "INFO")
                      .length === 0 ? (
                      <div className="px-6 py-8 text-center">
                        <span className="material-symbols-outlined text-3xl text-primary/40 mb-2">verified</span>
                        <p className="text-sm text-on-surface-variant">{t("dash.allClear")}</p>
                      </div>
                    ) : (
                      (riskData.alerts ?? [])
                        .filter((a: RiskAlert) => a.level !== "INFO")
                        .map((alert: RiskAlert, i: number) => (
                          <div
                            key={i}
                            className={`flex items-start px-6 py-4 border-b border-outline-variant/5 ${
                              alert.level === "CRITICAL" ? "bg-error/5" : ""
                            }`}
                          >
                            <span
                              className={`material-symbols-outlined text-lg mr-3 mt-0.5 ${
                                alert.level === "CRITICAL" ? "text-error" : "text-secondary"
                              }`}
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              {alert.level === "CRITICAL" ? "error" : "warning"}
                            </span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    alert.level === "CRITICAL"
                                      ? "bg-error/10 text-error"
                                      : "bg-secondary/10 text-secondary"
                                  }`}
                                >
                                  {alert.level}
                                </span>
                                <span className="text-[10px] font-bold text-on-surface-variant uppercase">
                                  {alert.category}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface">{alert.message}</p>
                            </div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ml-3 ${
                                alert.action === "SELL"
                                  ? "bg-error/10 text-error"
                                  : alert.action === "REDUCE"
                                    ? "bg-secondary/10 text-secondary"
                                    : "bg-primary/10 text-on-surface-variant"
                              }`}
                            >
                              {mapAction(lang, alert.action)}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Position Sizing */}
                <div className="bg-surface-container-low rounded-xl p-6">
                  <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6 flex items-center gap-2">
                    {t("dash.positionSizing")} <HelpBtn topic="position_sizing" />
                  </h4>

                  {/* Allocation Bar */}
                  <div className="mb-4">
                    <div className="relative h-4 w-full bg-surface-container-highest rounded-full overflow-hidden mb-2">
                      <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-secondary"
                        style={{ width: `${riskData.portfolio_summary?.invested_pct ?? 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase">
                      <span>{t("dash.invested")} {riskData.portfolio_summary?.invested_pct ?? 0}%</span>
                      <span>{t("dash.cash")} {riskData.portfolio_summary?.cash_pct ?? 100}%</span>
                    </div>
                  </div>

                  {/* Position List */}
                  <div className="space-y-2">
                    {(riskData.position_sizes ?? [])
                      .filter((p) => p.ticker !== "CASH" && p.final_pct > 0)
                      .slice(0, 8)
                      .map((pos) => (
                        <div key={pos.ticker} className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold border ${gradeClass(pos.grade)}`}
                          >
                            {pos.grade}
                          </span>
                          <span className="text-xs font-bold text-on-surface flex-1">{pos.ticker}</span>
                          <div className="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(pos.final_pct * 2, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-on-surface-variant w-10 text-right">
                            {pos.final_pct}%
                          </span>
                        </div>
                      ))}
                    {/* Cash */}
                    {riskData.portfolio_summary?.cash_pct != null && riskData.portfolio_summary.cash_pct > 0 && (
                      <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/10">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold bg-surface-container-highest text-on-surface-variant">
                          $
                        </span>
                        <span className="text-xs font-bold text-on-surface-variant flex-1">CASH</span>
                        <div className="w-16 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                          <div
                            className="h-full bg-on-surface-variant/30 rounded-full"
                            style={{ width: `${Math.min(riskData.portfolio_summary.cash_pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-on-surface-variant w-10 text-right">
                          {riskData.portfolio_summary.cash_pct}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stop-Loss Summary */}
                  <div className="mt-6 pt-4 border-t border-outline-variant/10">
                    <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1">
                      {t("dash.stopLossStatus")} <HelpBtn topic="trailing_stop" />
                    </p>
                    <div className="flex gap-3">
                      {(() => {
                        const stops = riskData.alerts?.filter((a: RiskAlert) => a.category === "stop_loss") ?? [];
                        const breached = stops.filter((a: RiskAlert) => a.level === "CRITICAL").length;
                        const warned = stops.filter((a: RiskAlert) => a.level === "WARNING").length;
                        const ok = (riskData.position_sizes?.filter((p) => p.ticker !== "CASH").length ?? 0) - breached - warned;
                        return (
                          <>
                            {breached > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-error">
                                <span className="w-2 h-2 rounded-full bg-error" />
                                {breached} {t("dash.breached")}
                              </span>
                            )}
                            {warned > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-secondary">
                                <span className="w-2 h-2 rounded-full bg-secondary" />
                                {warned} {t("dash.warningCount")}
                              </span>
                            )}
                            {ok > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary">
                                <span className="w-2 h-2 rounded-full bg-primary" />
                                {ok > 0 ? ok : 0} {t("dash.ok")}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Link href="/risk" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-bold text-primary transition-colors">
                  <span className="material-symbols-outlined text-sm">security</span>
                  {t("dash.fullRiskMonitor")}
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
