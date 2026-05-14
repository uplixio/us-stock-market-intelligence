"use client";
import { useEffect, useState } from "react";
import { C, regimeBadgeCls, regimeBadgeStyle, SIGNAL_WEIGHTS } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";
import Link from "next/link";
import { CalendarPicker } from "@/components/CalendarPicker";
import SectorHeatmap from "@/components/SectorHeatmap";
import { useT, mapRegime, mapGate, translate, mapSensorKey } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";

type SectorItem = {
  name: string;
  ticker: string;
  score: number;
  signal: string;
  rsi: number;
  rs_vs_spy: number;
  change_1d: number;
};

type MarketTiming = {
  regime?: string;
  regime_score?: number;
  regime_confidence?: number;
  signals?: Record<string, string>;
  adaptive_params?: { stop_loss?: string; max_drawdown_warning?: string };
  gate?: string;
  gate_score?: number;
  sectors?: SectorItem[];
  gate_metrics?: {
    avg_score?: number;
    bullish_sectors?: number;
    bearish_sectors?: number;
    top_sector?: string;
    bottom_sector?: string;
  };
  spy_divergence?: {
    signal?: string;
    label?: string;
    severity?: string;
    spy_price?: number;
    change_10d_pct?: number;
    vol_ratio_2d_vs_20d_avg?: number;
  };
};

type DailyReport = {
  data_date?: string;
  generated_at?: string;
  market_timing?: MarketTiming;
};

type LiveQuote = {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
  timestamp: string | null;
};

type LiveSnapshot = {
  generated_at: string;
  market_date: string;
  market_timezone: string;
  session_state: "pre_market" | "regular" | "after_hours" | "closed";
  data_source: string;
  provisional: boolean;
  regime: string;
  label: string;
  core: LiveQuote[];
  sectors: LiveQuote[];
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

function sessionLabel(s: LiveSnapshot["session_state"] | undefined) {
  if (s === "pre_market") return "PRE-MARKET";
  if (s === "regular") return "LIVE";
  if (s === "after_hours") return "AFTER-HOURS";
  return "CLOSED";
}

function quoteColor(changePct: number | null) {
  if (changePct == null) return "text-on-surface-variant";
  if (changePct > 0) return "text-primary";
  if (changePct < 0) return "text-error";
  return "text-on-surface-variant";
}

export default function RegimePage() {
  const t = useT();
  const { lang } = useLang();
  const [date, setDate] = useState<string>(todayStr());
  const [mt, setMt] = useState<MarketTiming>({});
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>("");
  const [status, setStatus] = useState<string>(t("common.loading"));
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  async function loadReport(dateStr: string) {
    try {
      const res = await fetch(`/api/data/reports?date=${dateStr}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as DailyReport;
      setMt(d.market_timing ?? {});
      setDate(d.data_date ?? dateStr);
      setStatus("");
    } catch {
      setMt({});
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

    fetch("/api/data/reports?date=latest", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: DailyReport) => {
        const dateStr = d.data_date ?? todayStr();
        setMt(d.market_timing ?? {});
        setDate(dateStr);
        setStatus("");
      })
      .catch(() => setStatus(t("common.noData")));
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveSnapshot() {
      try {
        setLiveStatus("");
        const res = await fetch("/api/live/market-snapshot", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LiveSnapshot;
        if (!cancelled) setLive(data);
      } catch {
        if (!cancelled) {
          setLive(null);
          setLiveStatus("Live snapshot unavailable");
        }
      }
    }

    void loadLiveSnapshot();
    const timer = window.setInterval(loadLiveSnapshot, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  // 변수 바인딩 (기존 UI 변수명 유지)
  const r = mt.regime ?? "neutral";
  const p = mt.adaptive_params ?? { stop_loss: "N/A", max_drawdown_warning: "N/A" };
  const signals = mt.signals ?? {};
  const stratKey = r === "risk_on" ? "strategy.aggressive" : r === "neutral" ? "strategy.balanced" : "strategy.defensive";
  const stratLabel = t(stratKey);
  const sectors = (mt.sectors ?? []).slice().sort((a, b) => b.score - a.score);
  const m = mt.gate_metrics ?? {};
  const g = mt.gate ?? "CAUTION";
  const gateBadgeCls = regimeBadgeCls(g);
  const gateBadgeSty = regimeBadgeStyle(g);

  const d = mt.spy_divergence ?? {};
  const divSig = d.signal ?? "none";
  const sev = d.severity ?? "neutral";
  const isWarn = sev === "warning";
  const isOpp = sev === "opportunity";
  const cardBg = isWarn
    ? "bg-error-container/40 border-error/40"
    : isOpp
      ? "bg-primary-container/30 border-primary/40"
      : "bg-surface-container-high/30";
  const iconColor = isWarn ? "text-error" : isOpp ? "text-primary" : "text-on-surface-variant";
  const icon = isWarn ? "warning" : isOpp ? "trending_up" : "check_circle";
  const priceChg = d.change_10d_pct ?? 0;
  const priceCls = priceChg >= 0 ? "text-primary" : "text-error";

  return (
    <div>
      {/* Date Navigation */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 mb-6 px-5 py-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-lg">public</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                현재 미국 시장일
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                {sessionLabel(live?.session_state)}
              </span>
            </div>
            <p className="text-2xl md:text-3xl font-black text-primary leading-none">
              {formatIsoDate(live?.market_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            마지막 확정 일일 리포트
          </span>
          <CalendarPicker
            value={date}
            availableDates={availableDates}
            onChange={(d) => void loadReport(d)}
            onShift={shiftDate}
            status={status}
          />
        </div>
      </div>

      {/* Live Snapshot */}
      <section className="bg-surface-container-low rounded-xl border border-outline-variant/10 p-5 mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-lg">sensors</span>
              <span className="text-xs font-black text-on-surface uppercase tracking-widest">
                오늘 라이브 스냅샷
              </span>
              <span className="text-[9px] font-black px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container">
                장중 임시값
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">
              미국 시장일 {formatIsoDate(live?.market_date)} 기준으로 60초마다 갱신됩니다. 위 날짜 선택기는 마지막 확정 리포트({date})를 보는 용도입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold px-3 py-1 rounded bg-surface-container-high text-on-surface-variant">
              {sessionLabel(live?.session_state)}
            </span>
            <span className="text-[10px] text-on-surface-variant">
              라이브 갱신 {formatLiveTime(live?.generated_at)}
            </span>
          </div>
        </div>

        {liveStatus ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-surface-container-high/40">
            <span className="material-symbols-outlined text-secondary">sync_problem</span>
            <p className="text-sm text-on-surface-variant">{liveStatus}</p>
          </div>
        ) : live ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-4 bg-surface-container-high/40 rounded-xl p-5 border border-outline-variant/10">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">
                오늘 장중 바이어스
              </p>
              <div className="flex items-end gap-3">
                <p className="text-3xl font-black text-on-surface leading-none">
                  {mapRegime(lang, live.regime)}
                </p>
                <div
                  className="w-3 h-3 rounded-full mb-1.5"
                  style={{ background: C[live.regime] ?? "var(--color-outline)" }}
                />
              </div>
              <p className="text-xs text-on-surface-variant mt-3">{live.label}</p>
              <p className="text-[10px] text-on-surface-variant/70 mt-5">
                Source: {live.data_source}
              </p>
            </div>

            <div className="lg:col-span-4 grid grid-cols-3 gap-3">
              {live.core.map((q) => (
                <div key={q.symbol} className="bg-surface-container-high/40 rounded-xl p-4 border border-outline-variant/10">
                  <p className="text-[10px] font-bold text-on-surface-variant">{q.symbol}</p>
                  <p className="text-xl font-black text-on-surface mt-2">
                    {q.price == null ? "-" : q.price}
                  </p>
                  <p className={`text-xs font-bold mt-1 ${quoteColor(q.changePct)}`}>
                    {q.changePct == null ? "-" : `${q.changePct >= 0 ? "+" : ""}${q.changePct}%`}
                  </p>
                </div>
              ))}
            </div>

            <div className="lg:col-span-4 bg-surface-container-high/30 rounded-xl p-4 border border-outline-variant/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                  Sector Pulse
                </p>
                <p className="text-[10px] text-on-surface-variant">Top intraday movers</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {live.sectors.slice(0, 6).map((q) => (
                  <div key={q.symbol} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-on-surface truncate">{q.label}</p>
                      <p className="text-[9px] text-on-surface-variant">{q.symbol}</p>
                    </div>
                    <p className={`text-xs font-black ${quoteColor(q.changePct)}`}>
                      {q.changePct == null ? "-" : `${q.changePct >= 0 ? "+" : ""}${q.changePct}%`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-24 rounded-lg bg-surface-container-high/30 animate-pulse" />
        )}
      </section>

      {/* Regime Header Bento */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <div className="md:col-span-7 bg-surface-container-low p-8 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <span className="material-symbols-outlined" style={{ fontSize: "80px" }}>
              analytics
            </span>
          </div>
          <div className="flex flex-col gap-1 z-10">
            <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1">
              {t("regime.globalStatus")} <HelpBtn topic="regime" />
            </span>
            <div className="flex items-baseline gap-4 mt-2">
              <h1 className="text-5xl md:text-6xl font-black text-on-surface tracking-tighter leading-none">
                {mapRegime(lang, r)}
              </h1>
              <div
                className="w-4 h-4 rounded-full"
                style={{ background: C[r], boxShadow: `0 0 15px ${C[r]}50` }}
              />
            </div>
          </div>
          <div className="mt-10 flex gap-8 md:gap-12 z-10">
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase flex items-center gap-1">{t("regime.regimeScore")} <HelpBtn topic="regime_score" /></p>
              <p className={`text-3xl font-bold ${(mt.regime_score ?? 0) >= 2 ? "text-primary" : (mt.regime_score ?? 0) >= 1 ? "text-secondary" : "text-error"}`}>{mt.regime_score ?? 0}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase flex items-center gap-1">{t("regime.stopLoss")} <HelpBtn topic="stop_loss" /></p>
              <p className="text-3xl font-bold text-error">{p.stop_loss ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase flex items-center gap-1">{t("regime.mddWarning")} <HelpBtn topic="mdd_warning" /></p>
              <p className="text-3xl font-bold text-error/80">
                {p.max_drawdown_warning ?? "N/A"}
              </p>
            </div>
          </div>
        </div>
        <div className="md:col-span-5 grid grid-cols-2 gap-4">
          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col justify-between">
            <span className="material-symbols-outlined text-primary text-3xl">trending_up</span>
            <div className="mt-4">
              <p className="text-xs font-medium text-on-surface-variant uppercase flex items-center gap-1">{t("common.confidence")} <HelpBtn topic="confidence" /></p>
              <p className="text-xl font-bold text-on-surface">{mt.regime_confidence ?? 0}%</p>
            </div>
          </div>
          <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col justify-between">
            <span className="material-symbols-outlined text-tertiary text-3xl">hub</span>
            <div className="mt-4">
              <p className="text-xs font-medium text-on-surface-variant uppercase flex items-center gap-1">{t("regime.strategy")} <HelpBtn topic="strategy" /></p>
              <p className="text-xl font-bold text-on-surface">{stratLabel}</p>
            </div>
          </div>
          <Link
            href="/ai"
            className="bg-surface-container-high p-6 rounded-xl col-span-2 flex items-center justify-between hover:bg-surface-bright transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">auto_awesome</span>
              </div>
              <div>
                <p className="text-sm font-bold flex items-center gap-1">{t("regime.aiInsight")} <HelpBtn topic="ai_insight" /></p>
                <p className="text-xs text-on-surface-variant">
                  {r === "risk_on" ? t("regime.insightRiskOn") : t("regime.insightOther")}
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
          </Link>
        </div>
      </section>

      {/* 5 Sensors */}
      <div className="bg-surface-container-low rounded-xl p-6 mb-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6 flex items-center gap-2">
          {t("regime.sensorStatus")} <HelpBtn topic="regime" />
        </h4>
        {Object.keys(signals).length === 0 ? (
          <p className="text-xs text-on-surface-variant/60">{t("regime.noSensors")}</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(signals).map(([k, v]) => {
              const sensorTopic = ({ vix: "vix", trend: "trend", breadth: "breadth", credit: "credit", yield_curve: "yield_curve" } as Record<string, "vix" | "trend" | "breadth" | "credit" | "yield_curve">)[k];
              return (
                <div
                  key={k}
                  className="bg-surface-container-high/40 p-5 rounded-xl border border-outline-variant/10"
                  style={{ borderTop: `3px solid ${C[v as string] ?? "#888"}` }}
                >
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mb-1 flex items-center gap-1">
                    {mapSensorKey(k)} · {SIGNAL_WEIGHTS[k] ?? ""}
                    {sensorTopic && <HelpBtn topic={sensorTopic} />}
                  </p>
                  <p className="text-base font-bold mt-2" style={{ color: C[v as string] ?? "#888" }}>
                    {mapRegime(lang, String(v))}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Adaptive Params */}
      <div className="bg-surface-container-low rounded-xl p-6 mb-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-6 flex items-center gap-2">
          {t("regime.adaptiveParams")} <HelpBtn topic="stop_loss" />
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-container-high/40 p-6 rounded-xl border border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-2 flex items-center gap-1">
              {t("regime.stopLoss")} <HelpBtn topic="stop_loss" />
            </p>
            <p className="text-2xl font-bold text-error">{p.stop_loss ?? "N/A"}</p>
          </div>
          <div className="bg-surface-container-high/40 p-6 rounded-xl border border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-2 flex items-center gap-1">
              {t("regime.mddWarning")} <HelpBtn topic="mdd_warning" />
            </p>
            <p className="text-2xl font-bold text-tertiary">{p.max_drawdown_warning ?? "N/A"}</p>
          </div>
          <div className="bg-surface-container-high/40 p-6 rounded-xl border border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant uppercase font-bold mb-2 flex items-center gap-1">
              {t("regime.strategy")} <HelpBtn topic="strategy" />
            </p>
            <p className="text-2xl font-bold text-on-surface">{stratLabel}</p>
          </div>
        </div>
      </div>

      {/* Volume-Price Divergence */}
      <div className="bg-surface-container-low rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
            {t("regime.volumeDivergence")} <HelpBtn topic="spy_divergence" />
          </h4>
          <span className="text-[10px] text-on-surface-variant">
            {t("regime.divergenceSub")}
          </span>
        </div>
        {divSig === "none" ? (
          <div className="flex items-center gap-4 p-4 bg-surface-container-high/30 rounded-lg">
            <span className="material-symbols-outlined text-on-surface-variant text-3xl">
              check_circle
            </span>
            <div>
              <p className="text-sm font-bold text-on-surface">{t("regime.noSignal")}</p>
              <p className="text-[10px] text-on-surface-variant mt-1">
                {t("regime.noDivergence")}
              </p>
            </div>
          </div>
        ) : (
          <div className={`p-5 rounded-lg border ${cardBg}`}>
            <div className="flex items-start gap-4">
              <span
                className={`material-symbols-outlined text-4xl ${iconColor}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {icon}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <p className="text-base font-bold text-on-surface uppercase tracking-wider">
                    {divSig.replace("_", " ")}
                  </p>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded ${isWarn ? "bg-error text-on-error" : isOpp ? "bg-primary text-on-primary" : "bg-surface-container-highest"}`}
                  >
                    {sev.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant mb-3">{d.label ?? ""}</p>
                <div className="flex flex-wrap gap-4 text-[10px]">
                  <span>SPY ${d.spy_price ?? "-"}</span>
                  <span className={priceCls}>
                    10D {priceChg >= 0 ? "+" : ""}
                    {priceChg}%
                  </span>
                  <span>Vol 2D/20D ratio: {d.vol_ratio_2d_vs_20d_avg ?? "-"}x</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sector Gate */}
      <div className="bg-surface-container-low rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
              {t("regime.sectorGate")} <HelpBtn topic="gate" />
            </h4>
            <p className="text-[10px] text-on-surface-variant mt-1">
              {translate(lang, "regime.sectorStats", {
                avg: m.avg_score ?? mt.gate_score ?? 0,
                bull: m.bullish_sectors ?? 0,
                bear: m.bearish_sectors ?? 0,
                top: m.top_sector ?? "-",
                bottom: m.bottom_sector ?? "-",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded ${gateBadgeCls}`}
              style={gateBadgeSty}
            >
              {mapGate(lang, g)}
            </span>
            <HelpBtn topic="gate" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {sectors.length === 0 ? (
            <p className="text-xs text-on-surface-variant col-span-full">
              {t("regime.noSectorGate")}
            </p>
          ) : (
            sectors.map((s) => {
              const sig = s.signal ?? "NEUTRAL";
              const sigCls =
                sig === "BULLISH"
                  ? "text-primary"
                  : sig === "BEARISH"
                    ? "text-error"
                    : "text-secondary";
              const rsCls = s.rs_vs_spy >= 0 ? "text-primary" : "text-error";
              const borderTop =
                sig === "BULLISH" ? "#3fe56c" : sig === "BEARISH" ? "#ffb4ab" : "#fdd400";
              const chgCls = s.change_1d >= 0 ? "text-primary" : "text-error";
              return (
                <div
                  key={s.ticker}
                  className="bg-surface-container-high/40 p-4 rounded-lg border border-outline-variant/10"
                  style={{ borderTop: `3px solid ${borderTop}` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-on-surface">{s.name}</p>
                    <span className="text-[9px] font-bold text-on-surface-variant">
                      {s.ticker}
                    </span>
                  </div>
                  <p className={`text-2xl font-black ${sigCls} leading-none mb-2`}>{s.score}</p>
                  <p className={`text-[10px] font-bold ${sigCls} mb-2`}>{mapRegime(lang, sig)}</p>
                  <div className="flex items-center justify-between text-[10px] text-on-surface-variant">
                    <span>RSI {s.rsi}</span>
                    <span className={rsCls}>
                      RS {s.rs_vs_spy >= 0 ? "+" : ""}
                      {(s.rs_vs_spy * 100).toFixed(2)}%
                    </span>
                    <span className={chgCls}>
                      {s.change_1d >= 0 ? "+" : ""}
                      {s.change_1d}%
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="text-[9px] text-on-surface-variant mt-4">
          {t("regime.sectorFormula")}
        </p>
      </div>

      {/* Sector Heatmap */}
      {sectors.length > 0 && (
        <div className="bg-surface-container-low rounded-xl p-6 mt-6">
          <SectorHeatmap sectors={sectors} />
        </div>
      )}
    </div>
  );
}
