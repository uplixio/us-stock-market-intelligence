"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CalendarPicker } from "@/components/CalendarPicker";
import { HelpBtn } from "@/components/HelpBtn";
import { regimeBadgeCls, regimeBadgeStyle, regimeLabel, scoreColor, SIGNAL_NAMES, C } from "@/lib/ui";
import { VerdictHero } from "@/components/stock-detail/VerdictHero";
import { VerdictFlow } from "@/components/stock-detail/VerdictFlow";
import { IndicatorCard } from "@/components/stock-detail/IndicatorCard";
import { ScoreWaterfall } from "@/components/stock-detail/ScoreWaterfall";

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

type MLPredictor = {
  spy?: { direction?: string; probability_up?: number; confidence_pct?: number; model_accuracy?: number };
  qqq?: { direction?: string; probability_up?: number; confidence_pct?: number; model_accuracy?: number };
};

type MarketTiming = {
  regime?: string;
  regime_score?: number;
  regime_confidence?: number;
  signals?: Record<string, string>;
  gate?: string;
  gate_score?: number;
  ml_predictor?: MLPredictor;
  adaptive_params?: { stop_loss?: string; max_drawdown_warning?: string };
};

type DailyReport = {
  data_date?: string;
  generated_at?: string;
  market_timing?: MarketTiming;
  verdict?: string;
  stock_picks?: StockPick[];
};

type RiskAlert = {
  level: string;
  category: string;
  ticker: string;
  message: string;
  action: string;
};
type StopLossStatus = {
  ticker: string;
  entry_price: number;
  current_price: number;
  from_peak_pct: number;
  alert_level: string;
};
type PositionSize = {
  ticker: string;
  final_pct: number;
  dollar_amount: number;
};
type RiskData = {
  alerts?: RiskAlert[];
  stop_loss_status?: StopLossStatus[];
  position_sizes?: PositionSize[];
};

type AISummary = {
  thesis?: string;
  catalysts?: Array<string | { point: string; evidence?: string }>;
  bear_cases?: Array<string | { point: string; evidence?: string }>;
  recommendation?: string;
  confidence?: number | string;
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

function pickPointText(p: string | { point: string; evidence?: string } | undefined): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  return p.point ?? "";
}

export default function StockDetailPage() {
  const params = useParams<{ ticker: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const ticker = (params.ticker ?? "").toUpperCase();
  const dateParam = searchParams.get("date") ?? "";

  const [date, setDate] = useState<string>(dateParam || todayStr());
  const [report, setReport] = useState<DailyReport | null>(null);
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [status, setStatus] = useState<string>("로딩 중...");
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  async function loadAll(dateStr: string) {
    setStatus("로딩 중...");
    try {
      const [rReport, rRisk] = await Promise.all([
        fetch(`/api/data/reports?date=${dateStr}`, { cache: "no-store" }),
        fetch(`/api/data/risk?date=${dateStr}`, { cache: "no-store" }),
      ]);

      if (!rReport.ok) {
        setReport(null);
        setRisk(null);
        setDate(dateStr);
        setStatus("해당 날짜 리포트 없음");
        return;
      }
      const repData = (await rReport.json()) as DailyReport;
      setReport(repData);
      setDate(repData.data_date ?? dateStr);

      if (rRisk.ok) {
        setRisk((await rRisk.json()) as RiskData);
      } else {
        setRisk(null);
      }
      setStatus("");
    } catch {
      setReport(null);
      setRisk(null);
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
    if (next) void loadAll(next);
  }

  function updateDate(next: string) {
    void loadAll(next);
    router.replace(`/stock/${ticker}?date=${next}`);
  }

  function changeTicker(next: string) {
    const t = next.trim().toUpperCase();
    if (!t || t === ticker) return;
    router.replace(`/stock/${t}?date=${date}`);
  }

  useEffect(() => {
    fetch("/api/data/dates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { dates: string[] }) => setAvailableDates(new Set(d.dates)))
      .catch(() => {});

    const initDate = dateParam || "latest";
    fetch(`/api/data/reports?date=${initDate}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: DailyReport | null) => {
        const dateStr = d?.data_date ?? dateParam ?? todayStr();
        if (d) setReport(d);
        setDate(dateStr);
        return dateStr;
      })
      .then((dateStr) => fetch(`/api/data/risk?date=${dateStr}`, { cache: "no-store" }))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((d: RiskData | null) => {
        setRisk(d);
        setStatus("");
      })
      .catch(() => setStatus("데이터 없음"));

    fetch("/api/data/ai-summaries", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Record<string, AISummary> | null) => {
        if (d && d[ticker]) setAiSummary(d[ticker]);
        else setAiSummary(null);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Derived
  const pick = useMemo<StockPick | undefined>(
    () => report?.stock_picks?.find((p) => p.ticker.toUpperCase() === ticker),
    [report, ticker]
  );
  const mt = report?.market_timing ?? {};
  const regime = mt.regime ?? "neutral";
  const gate = mt.gate ?? "CAUTION";
  const grade = pick?.grade ?? "C";
  const action = pick?.action ?? "WATCH";
  const verdict = report?.verdict ?? "CAUTION";
  const signals = mt.signals ?? {};

  const stopLoss = risk?.stop_loss_status?.find((s) => s.ticker.toUpperCase() === ticker);
  const tickerAlerts = (risk?.alerts ?? []).filter(
    (a) => a.ticker.toUpperCase() === ticker
  );
  const posSize = risk?.position_sizes?.find((p) => p.ticker.toUpperCase() === ticker);

  // Autocomplete options — current picks
  const options = useMemo(
    () => (report?.stock_picks ?? []).map((p) => p.ticker.toUpperCase()),
    [report]
  );

  const hasReport = !!report;
  const hasPick = !!pick;

  // ── Card bodies ──────────────────────────────────────────────────
  const regimeBadge = {
    label: regimeLabel(regime),
    cls: regimeBadgeCls(regime),
    style: regimeBadgeStyle(regime),
  };
  const gateBadge = {
    label: gate,
    cls: regimeBadgeCls(gate),
    style: regimeBadgeStyle(gate),
  };
  const mlDir = mt.ml_predictor?.spy?.direction ?? "neutral";
  const mlBadge = {
    label: mlDir === "bullish" ? "BULLISH" : mlDir === "bearish" ? "BEARISH" : "N/A",
    cls: regimeBadgeCls(mlDir),
  };

  function regimeFit(strategy?: string): string {
    if (!strategy) return "전략 정보 없음";
    if (regime === "risk_on") {
      if (strategy === "Trend") return "RISK_ON + Trend = 강세장 추세 적합 ✅";
      if (strategy === "Swing") return "RISK_ON + Swing = 변동성 이용 ⚠️";
      return "RISK_ON + Reversal = 저점 매수 탐색 ⚠️";
    }
    if (regime === "neutral") {
      if (strategy === "Trend") return "NEUTRAL + Trend = 부분 매수 검토 ⚠️";
      return "NEUTRAL + " + strategy + " = 소량 진입만 권고";
    }
    return "방어적 regime — " + strategy + " 전략 유효성 낮음 ❌";
  }

  // ── Render ───────────────────────────────────────────────────────
  if (!hasReport && status !== "로딩 중...") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-4">
          search_off
        </span>
        <h2 className="text-lg font-bold mb-2">{ticker} 데이터를 찾을 수 없습니다</h2>
        <p className="text-xs text-on-surface-variant mb-6">{status}</p>
        <Link
          href="/top-picks"
          className="text-sm font-bold text-primary hover:text-primary/70"
        >
          ← Top Picks로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 px-5 py-3 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <Link
            href="/top-picks"
            className="inline-flex items-center gap-1 text-xs font-bold text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Top Picks
          </Link>
          <span className="text-on-surface-variant/40">·</span>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              Ticker
            </label>
            <select
              value={options.includes(ticker) ? ticker : "__CURRENT__"}
              onChange={(e) => changeTicker(e.target.value)}
              className="bg-surface-container-lowest border border-outline-variant/20 rounded-lg px-3 py-1 text-sm font-bold text-primary outline-none focus:border-primary transition-colors min-w-[130px] cursor-pointer"
              title="Smart Money Top Picks 종목 선택"
            >
              {!options.includes(ticker) && (
                <option value="__CURRENT__">{ticker} (해당 날짜 없음)</option>
              )}
              {options.map((t) => {
                const p = report?.stock_picks?.find((sp) => sp.ticker.toUpperCase() === t);
                const rank = (report?.stock_picks ?? []).findIndex(
                  (sp) => sp.ticker.toUpperCase() === t
                );
                const label = rank >= 0 ? `#${String(rank + 1).padStart(2, "0")} ${t}` : t;
                return (
                  <option key={t} value={t}>
                    {label}
                    {p?.grade ? `  [${p.grade}]` : ""}
                  </option>
                );
              })}
            </select>
            <span className="text-[10px] text-on-surface-variant hidden md:inline">
              {options.length}종목
            </span>
          </div>
        </div>
        <CalendarPicker
          value={date}
          availableDates={availableDates}
          onChange={updateDate}
          onShift={shiftDate}
          status={status !== "로딩 중..." ? status : undefined}
        />
      </div>

      {hasPick ? (
        <>
          <VerdictHero
            ticker={ticker}
            companyName={pick.company_name}
            action={action}
            verdict={verdict}
            compositeScore={pick.composite_score ?? 0}
            grade={grade}
            gradeLabel={pick.grade_label}
            strategy={pick.strategy}
            setup={pick.setup}
            rsVsSpy={pick.rs_vs_spy}
          />

          <VerdictFlow
            regime={regime}
            gate={gate}
            grade={grade}
            action={action}
            date={date}
          />

          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-1">
              6-Indicator Cross-Reference <HelpBtn topic="verdict" />
            </h2>
            <span className="text-[10px] text-on-surface-variant">
              각 카드는 이 지표가 {ticker}와 어떻게 연관되는지 설명
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* 1. Market Regime */}
            <IndicatorCard
              title="Market Regime"
              icon="analytics"
              href={`/regime?date=${date}`}
              badge={regimeBadge}
              help={<HelpBtn topic="regime" />}
              summary={regimeFit(pick.strategy)}
            >
              <div className="grid grid-cols-5 gap-1">
                {Object.entries(signals).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex flex-col items-center bg-surface-container-high/40 rounded px-1 py-1.5"
                    title={`${SIGNAL_NAMES[k] ?? k}: ${v}`}
                    style={{ borderBottom: `2px solid ${C[v as string] ?? "#888"}` }}
                  >
                    <span className="text-[8px] font-bold text-on-surface-variant">
                      {(SIGNAL_NAMES[k] ?? k).slice(0, 5)}
                    </span>
                    <span
                      className="text-[9px] font-bold mt-0.5"
                      style={{ color: C[v as string] ?? "#888" }}
                    >
                      {String(v).slice(0, 3).toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </IndicatorCard>

            {/* 2. AI Analysis */}
            <IndicatorCard
              title="AI Analysis"
              icon="auto_awesome"
              href={`/ai?date=${date}`}
              help={<HelpBtn topic="ai_thesis" />}
              badge={
                aiSummary
                  ? {
                      label: String(aiSummary.recommendation ?? "—"),
                      cls: regimeBadgeCls(
                        aiSummary.recommendation === "BUY"
                          ? "GO"
                          : aiSummary.recommendation === "SELL"
                            ? "STOP"
                            : "CAUTION"
                      ),
                    }
                  : { label: "N/A", cls: "bg-surface-container-highest text-on-surface-variant" }
              }
              summary={
                aiSummary?.thesis
                  ? aiSummary.thesis.slice(0, 120) +
                    (aiSummary.thesis.length > 120 ? "…" : "")
                  : `${ticker} AI 심층 분석 미생성. Top Picks 기반 간이 해석: ${
                      pick.rs_vs_spy != null
                        ? `시장 대비 ${pick.rs_vs_spy > 0 ? "+" : ""}${pick.rs_vs_spy}% ${
                            pick.rs_vs_spy > 0 ? "강세" : "약세"
                          }`
                        : "상대 강도 데이터 없음"
                    }, 등급 ${grade}.`
              }
            >
              {aiSummary && (
                <div className="space-y-2 text-[11px]">
                  {aiSummary.catalysts?.[0] && (
                    <div className="flex gap-2 text-on-surface-variant">
                      <span className="text-primary font-bold shrink-0">▲</span>
                      <span className="line-clamp-2">
                        {pickPointText(aiSummary.catalysts[0])}
                      </span>
                    </div>
                  )}
                  {aiSummary.bear_cases?.[0] && (
                    <div className="flex gap-2 text-on-surface-variant">
                      <span className="text-error font-bold shrink-0">▼</span>
                      <span className="line-clamp-2">
                        {pickPointText(aiSummary.bear_cases[0])}
                      </span>
                    </div>
                  )}
                  {aiSummary.confidence != null && (
                    <p className="text-[10px] text-on-surface-variant">
                      Confidence: {aiSummary.confidence}
                      {typeof aiSummary.confidence === "number" ? "%" : ""}
                    </p>
                  )}
                </div>
              )}
            </IndicatorCard>

            {/* 3. Index Forecast */}
            <IndicatorCard
              title="Index Forecast"
              icon="insights"
              href={`/forecast?date=${date}`}
              badge={mlBadge}
              help={<HelpBtn topic="ml" />}
              summary={
                mt.ml_predictor?.spy
                  ? `SPY ML 방향 ${
                      mt.ml_predictor.spy.direction === "bullish" ? "상승" : "하락"
                    } (확률 ${((mt.ml_predictor.spy.probability_up ?? 0.5) * 100).toFixed(0)}%). ${ticker}은 지수 방향 참고 — 개별 종목 예측 아님.`
                  : "ML Predictor 데이터 없음"
              }
            >
              {mt.ml_predictor?.spy && (
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-surface-container-high/40 p-2 rounded">
                    <p className="text-[9px] text-on-surface-variant uppercase">SPY</p>
                    <p
                      className={`font-bold ${
                        mt.ml_predictor.spy.direction === "bullish"
                          ? "text-primary"
                          : "text-error"
                      }`}
                    >
                      {mt.ml_predictor.spy.direction === "bullish" ? "▲ UP" : "▼ DN"}{" "}
                      {mt.ml_predictor.spy.confidence_pct ?? "—"}%
                    </p>
                  </div>
                  <div className="bg-surface-container-high/40 p-2 rounded">
                    <p className="text-[9px] text-on-surface-variant uppercase">QQQ</p>
                    <p
                      className={`font-bold ${
                        mt.ml_predictor.qqq?.direction === "bullish"
                          ? "text-primary"
                          : "text-error"
                      }`}
                    >
                      {mt.ml_predictor.qqq?.direction === "bullish" ? "▲ UP" : "▼ DN"}{" "}
                      {mt.ml_predictor.qqq?.confidence_pct ?? "—"}%
                    </p>
                  </div>
                </div>
              )}
            </IndicatorCard>

            {/* 4. ML Rankings */}
            <IndicatorCard
              title="ML Rankings"
              icon="leaderboard"
              href={`/ml?date=${date}`}
              badge={{
                label: `Grade ${grade}`,
                cls: "",
              }}
              help={<HelpBtn topic="composite_score" />}
              summary={`6팩터 composite ${(pick.composite_score ?? 0).toFixed(1)} · ${
                pick.strategy ?? "—"
              } / ${pick.setup ?? "—"} · ${grade} 등급`}
            >
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                {[
                  { k: "Tech", v: pick.technical_score },
                  { k: "Fund", v: pick.fundamental_score },
                  { k: "Anlst", v: pick.analyst_score },
                  { k: "RS", v: pick.rs_score },
                  { k: "Vol", v: pick.volume_score },
                  { k: "13F", v: pick["13f_score"] },
                ].map((f) => (
                  <div
                    key={f.k}
                    className="bg-surface-container-high/40 rounded px-2 py-1 text-center"
                  >
                    <p className="text-[9px] text-on-surface-variant">{f.k}</p>
                    <p className={`font-bold ${scoreColor(f.v)}`}>
                      {f.v != null ? Math.round(f.v) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </IndicatorCard>

            {/* 5. Risk Monitor */}
            <IndicatorCard
              title="Risk Monitor"
              icon="security"
              href={`/risk?date=${date}`}
              help={<HelpBtn topic="risk_alert" />}
              badge={
                stopLoss
                  ? {
                      label: stopLoss.alert_level,
                      cls:
                        stopLoss.alert_level === "BREACHED"
                          ? "bg-error text-on-error"
                          : stopLoss.alert_level === "WARNING"
                            ? "bg-secondary/20 text-secondary"
                            : "bg-primary/10 text-primary",
                    }
                  : tickerAlerts.length > 0
                    ? { label: `${tickerAlerts.length} ALERT`, cls: "bg-secondary/20 text-secondary" }
                    : { label: "N/A", cls: "bg-surface-container-highest text-on-surface-variant" }
              }
              summary={
                stopLoss
                  ? `진입가 $${stopLoss.entry_price.toFixed(2)} → 현재 $${stopLoss.current_price.toFixed(2)} (peak 대비 ${stopLoss.from_peak_pct.toFixed(1)}%). Stop-loss 기준 ${stopLoss.alert_level}.`
                  : tickerAlerts.length > 0
                    ? `${tickerAlerts.length}건 알림: ${tickerAlerts[0].message}`
                    : `포지션 미보유 · Adaptive stop-loss ${mt.adaptive_params?.stop_loss ?? "—"} · 매수 시 손절선 참고`
              }
            >
              {posSize && (
                <div className="text-[11px] text-on-surface-variant">
                  Position size: <span className="font-bold text-on-surface">{posSize.final_pct}%</span> ($
                  {posSize.dollar_amount.toLocaleString("en-US", { maximumFractionDigits: 0 })})
                </div>
              )}
            </IndicatorCard>

            {/* 6. Performance */}
            <IndicatorCard
              title="Performance"
              icon="trending_up"
              href="/performance"
              badge={{
                label: pick.strategy ?? "—",
                cls: "bg-surface-container-highest text-on-surface",
              }}
              help={<HelpBtn topic="performance" />}
              summary={`${ticker}의 '${pick.strategy ?? "N/A"} / ${pick.setup ?? "N/A"}' 조합이 portfolio backtest의 어떤 bucket에 해당하는지는 Performance 페이지에서 확인. 이 페이지는 종목별 수익률 시뮬레이션 포함.`}
            >
              <div className="text-[11px] text-on-surface-variant">
                RS vs SPY{" "}
                <span
                  className={`font-bold ${
                    (pick.rs_vs_spy ?? 0) > 0 ? "text-primary" : "text-error"
                  }`}
                >
                  {(pick.rs_vs_spy ?? 0) > 0 ? "+" : ""}
                  {pick.rs_vs_spy ?? 0}%
                </span>
                {" · "}
                Entry 시뮬레이션에서 해당 날짜 수익률 확인 가능
              </div>
            </IndicatorCard>
          </div>

          <ScoreWaterfall
            technical={pick.technical_score}
            fundamental={pick.fundamental_score}
            analyst={pick.analyst_score}
            rs={pick.rs_score}
            volume={pick.volume_score}
            score13f={pick["13f_score"]}
            composite={pick.composite_score}
          />

          <p className="text-[10px] text-on-surface-variant/60 text-center mb-6">
            <HelpBtn topic="verdict" /> 판정은 참고용입니다. 최종 투자 결정은 본인 책임.
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[40vh] bg-surface-container-low rounded-xl p-8 border border-outline-variant/10">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-4">
            search_off
          </span>
          <h2 className="text-lg font-bold mb-2">
            {ticker}을(를) {date} Top Picks에서 찾을 수 없음
          </h2>
          <p className="text-xs text-on-surface-variant mb-4 text-center max-w-md">
            이 종목은 해당 날짜의 20개 screening 통과 종목 리스트에 포함되지 않았습니다.
            다른 날짜를 선택하거나 ticker를 변경해 보세요.
          </p>
          <div className="flex gap-3">
            <Link
              href={`/top-picks?date=${date}`}
              className="text-xs font-bold text-primary hover:text-primary/70"
            >
              {date} Top Picks 보기
            </Link>
            <span className="text-on-surface-variant/40">·</span>
            <Link
              href="/top-picks"
              className="text-xs font-bold text-on-surface-variant hover:text-primary"
            >
              최신 Top Picks
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
