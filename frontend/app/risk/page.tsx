"use client";
import { useEffect, useState } from "react";
import type {
  RiskAlertData,
  RiskAlert,
  StopLossStatus,
  ConcentrationData,
  ComponentVarEntry,
  StressScenario,
  CdarEntry,
} from "@/lib/data";
import { regimeBadgeCls, regimeBadgeStyle, gradeClass } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";
import { CalendarPicker } from "@/components/CalendarPicker";
import { useT, mapAction } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";

// 오늘 날짜 (YYYY-MM-DD)
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function toCompact(d: string) {
  return d.replace(/-/g, "");
}

export default function RiskPage() {
  const t = useT();
  const { lang } = useLang();
  const [data, setData] = useState<RiskAlertData | null>(null);
  const [status, setStatus] = useState(t("common.loading"));
  const [date, setDate] = useState(todayISO());
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());

  // 날짜별 데이터 로드
  async function loadForDate(d: string) {
    setStatus(t("common.loading"));
    setData(null);
    let res = await fetch(`/api/data/risk?date=${d}`, { cache: "no-store" });
    if (!res.ok) res = await fetch("/api/data/risk?date=latest", { cache: "no-store" });
    if (!res.ok) { setStatus(t("common.noData")); return; }
    const json = await res.json() as RiskAlertData;
    setData(json);
    setDate(d);
    setStatus("");
  }

  // ◀▶ 인접 날짜 탐색
  function shiftDate(delta: number) {
    if (availableDates.size === 0) return;
    const sorted = Array.from(availableDates).sort();
    const idx = sorted.indexOf(date);
    if (idx === -1) return;
    const next = sorted[idx + delta];
    if (next) void loadForDate(next);
  }

  // 초기 로드
  useEffect(() => {
    // 날짜 매니페스트
    fetch("/api/data/risk-dates", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { dates: string[] }) => {
        const converted = d.dates.map((s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
        setAvailableDates(new Set(converted));
      })
      .catch(() => {});

    // 오늘 데이터 로드
    void loadForDate(todayISO());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block">
            security
          </span>
          <p className="text-sm text-on-surface-variant">{status}</p>
        </div>
      </div>
    );
  }

  // 파생 변수
  const critCount = (data.alerts ?? []).filter((a: RiskAlert) => a.level === "CRITICAL").length;
  const warnCount = (data.alerts ?? []).filter((a: RiskAlert) => a.level === "WARNING").length;
  const overallStatus = critCount > 0 ? t("dash.alert") : warnCount > 0 ? t("dash.watch") : t("dash.clear");
  const statusColor =
    critCount > 0 ? "text-error" : warnCount > 0 ? "text-secondary" : "text-primary";
  void mapAction;
  void lang;

  const sortedAlerts = [...(data.alerts ?? [])].sort((a, b) => {
    const order: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return (order[a.level] ?? 3) - (order[b.level] ?? 3);
  });

  const stopLoss = data.stop_loss_status ?? [];
  const sortedStops = [...stopLoss].sort((a: StopLossStatus, b: StopLossStatus) => {
    const order: Record<string, number> = { BREACHED: 0, WARNING: 1, OK: 2 };
    return (order[a.alert_level] ?? 3) - (order[b.alert_level] ?? 3);
  });

  const concentration = data.concentration as ConcentrationData | undefined;
  const sectorEntries = Object.entries(concentration?.sector_concentration ?? {}).sort(
    (a, b) => b[1].pct - a[1].pct
  );

  const positions = (data.position_sizes ?? []).filter((p) => p.ticker !== "CASH" && p.final_pct > 0);
  const maxPct = positions.length > 0 ? Math.max(...positions.map((p) => p.final_pct)) : 1;

  return (
    <div>
      {/* ── 날짜 네비게이터 ── */}
      <div className="flex items-center justify-between mb-6 px-5 py-3 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
          <span className="hidden sm:inline text-xs font-bold text-on-surface-variant uppercase tracking-widest">
            {t("common.reportDate")}
          </span>
        </div>
        <CalendarPicker
          value={date}
          availableDates={availableDates}
          onChange={(d) => void loadForDate(d)}
          onShift={(delta) => void shiftDate(delta)}
          status={status !== t("common.loading") ? status : undefined}
        />
      </div>

      {/* ── 섹션 1: 헤더 ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 px-6 py-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span
            className="material-symbols-outlined text-error text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            security
          </span>
          <div>
            <h1 className="text-lg font-black text-on-surface tracking-tight flex items-center gap-1">
              {t("risk.title")} <HelpBtn topic="risk_alert" />
            </h1>
            <p className="text-[10px] text-on-surface-variant">{data.generated_at}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span
              className={`text-[10px] font-bold px-3 py-1 rounded uppercase ${regimeBadgeCls(data.regime)}`}
              style={regimeBadgeStyle(data.regime)}
            >
              Regime: {data.regime.replace("_", " ")}
            </span>
            <HelpBtn topic="regime" />
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`text-[10px] font-bold px-3 py-1 rounded ${regimeBadgeCls(data.verdict)}`}
              style={regimeBadgeStyle(data.verdict)}
            >
              VERDICT: {data.verdict}
            </span>
            <HelpBtn topic="verdict" />
          </div>
          {data.market_context?.index_prediction?.spy_direction && (() => {
            const d = data.market_context!.index_prediction;
            const spyBull = d.spy_direction === "bullish";
            const spyBear = d.spy_direction === "bearish";
            const qqqBull = d.qqq_direction === "bullish";
            const qqqBear = d.qqq_direction === "bearish";
            return (
              <>
                <div className="flex items-center gap-1">
                  <span
                    className={`text-[9px] font-bold px-2 py-1 rounded uppercase ${spyBull ? "bg-emerald-500/15 text-emerald-400" : spyBear ? "bg-red-500/15 text-red-400" : "bg-zinc-500/15 text-zinc-400"}`}
                    title={`SPY 5일 방향 예측 (ML) — 상승 확률 ${(d.spy_probability * 100).toFixed(1)}%`}
                  >
                    SPY{spyBull ? "↑" : spyBear ? "↓" : "→"} {(d.spy_probability * 100).toFixed(0)}%
                  </span>
                  <HelpBtn topic="ml" value={`${d.spy_direction}:${(d.spy_probability * 100).toFixed(0)}`} />
                </div>
                {d.qqq_direction && (
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[9px] font-bold px-2 py-1 rounded uppercase ${qqqBull ? "bg-emerald-500/15 text-emerald-400" : qqqBear ? "bg-red-500/15 text-red-400" : "bg-zinc-500/15 text-zinc-400"}`}
                      title={`QQQ 5일 방향 예측 (ML) — 상승 확률 ${(d.qqq_probability * 100).toFixed(1)}%`}
                    >
                      QQQ{qqqBull ? "↑" : qqqBear ? "↓" : "→"} {(d.qqq_probability * 100).toFixed(0)}%
                    </span>
                    <HelpBtn topic="ml" value={`${d.qqq_direction}:${(d.qqq_probability * 100).toFixed(0)}`} />
                  </div>
                )}
              </>
            );
          })()}
          {(data.market_context?.ai_sell_count ?? 0) > 0 && (
            <span className="text-[9px] font-bold px-2 py-1 rounded bg-amber-500/15 text-amber-400 uppercase" title="AI 분석에서 SELL 권고 종목 수">
              AI SELL ×{data.market_context!.ai_sell_count}
            </span>
          )}
        </div>
      </div>

      {/* ── 섹션 2: Portfolio Summary 4-카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1">
            Risk Status <HelpBtn topic="risk_alert" />
          </p>
          <p className={`text-3xl font-black tracking-tighter ${statusColor}`}>{overallStatus}</p>
          <p className="text-xs text-on-surface-variant mt-1">
            {critCount} critical · {warnCount} warning
          </p>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1">
            Allocation <HelpBtn topic="position_sizing" />
          </p>
          <p className="text-3xl font-black tracking-tighter text-on-surface">
            {data.portfolio_summary?.invested_pct ?? 0}%
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            현금 {data.portfolio_summary?.cash_pct ?? 100}%
          </p>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1">
            VaR (5D) <HelpBtn topic="var_risk" />
          </p>
          <p
            className={`text-3xl font-black tracking-tighter ${
              data.portfolio_summary?.risk_budget_status === "EXCEEDED"
                ? "text-error"
                : data.portfolio_summary?.risk_budget_status === "WARNING"
                  ? "text-secondary"
                  : "text-primary"
            }`}
          >
            ${(data.portfolio_summary?.total_var_dollar ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            Budget: {data.portfolio_summary?.risk_budget_status ?? "N/A"}
          </p>
        </div>

        <div className="bg-surface-container-low p-6 rounded-xl">
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-1">
            {t("risk.riskBudget")} <HelpBtn topic="risk_alert" />
          </p>
          <p
            className={`text-3xl font-black tracking-tighter ${
              data.portfolio_summary?.risk_budget_status === "EXCEEDED"
                ? "text-error"
                : data.portfolio_summary?.risk_budget_status === "WARNING"
                  ? "text-secondary"
                  : "text-primary"
            }`}
          >
            {data.portfolio_summary?.risk_budget_status ?? "N/A"}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            Total: ${((data.portfolio_summary?.total_value ?? 100000) / 1000).toFixed(0)}K
          </p>
        </div>
      </div>

      {/* ── 섹션 3: Risk Alerts 테이블 ── */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden mb-6">
        <div className="p-6 border-b border-outline-variant/10 flex items-center gap-2">
          <span
            className="material-symbols-outlined text-error text-lg"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            warning
          </span>
          <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
            {t("dash.riskAlerts")} <HelpBtn topic="risk_alert" />
          </h4>
          <span className="ml-auto text-[10px] text-on-surface-variant">{sortedAlerts.length}건</span>
        </div>
        {sortedAlerts.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <span className="material-symbols-outlined text-4xl text-primary/40 mb-2 block">verified</span>
            <p className="text-sm text-on-surface-variant">All Clear — 리스크 항목 없음</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-3 py-3 text-center"># <HelpBtn topic="risk_rank" /></th>
                  <th className="px-5 py-3 text-left">Level <HelpBtn topic="risk_alert" /></th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-right">Value <HelpBtn topic="var_risk" /></th>
                  <th className="px-4 py-3 text-right">Threshold <HelpBtn topic="stop_loss" /></th>
                  <th className="px-5 py-3 text-right">Action <HelpBtn topic="risk_action" /></th>
                </tr>
              </thead>
              <tbody>
                {sortedAlerts.map((alert: RiskAlert, i: number) => {
                  const levelColor =
                    alert.level === "CRITICAL"
                      ? "text-error"
                      : alert.level === "WARNING"
                        ? "text-secondary"
                        : "text-on-surface-variant";
                  const rowBg =
                    alert.level === "CRITICAL" ? "bg-error/5" : alert.level === "WARNING" ? "bg-secondary/5" : "";
                  const icon =
                    alert.level === "CRITICAL" ? "error" : alert.level === "WARNING" ? "warning" : "info";
                  return (
                    <tr
                      key={i}
                      className={`border-b border-outline-variant/5 hover:bg-surface-bright/20 ${rowBg}`}
                    >
                      <td className="px-3 py-3 text-center">
                        <span className={`text-[11px] font-black tabular-nums ${levelColor}`}>{i + 1}</span>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold ${levelColor}`}>
                          <span
                            className="material-symbols-outlined text-sm"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            {icon}
                          </span>
                          {alert.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 uppercase text-[10px]">
                        <span className={
                          alert.category === "ai_sell"
                            ? "text-amber-400 font-bold"
                            : alert.category === "prediction"
                              ? "text-violet-400 font-bold"
                              : "text-on-surface-variant"
                        }>
                          {alert.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-on-surface">{alert.ticker}</td>
                      <td className="px-4 py-3 text-on-surface-variant max-w-xs truncate">{alert.message}</td>
                      <td
                        className={`px-4 py-3 text-right font-bold font-mono ${
                          (alert.value ?? 0) < 0 ? "text-error" : "text-primary"
                        }`}
                      >
                        {typeof alert.value === "number" ? alert.value.toFixed(2) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface-variant">
                        {typeof alert.threshold === "number" ? alert.threshold.toFixed(2) : "-"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold ${
                            alert.action === "SELL"
                              ? "bg-error/10 text-error"
                              : alert.action === "REDUCE"
                                ? "bg-secondary/10 text-secondary"
                                : "bg-surface-container-highest text-on-surface-variant"
                          }`}
                        >
                          {alert.action}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 섹션 4: Stop-Loss Monitor ── */}
      {sortedStops.length > 0 && (
        <div className="bg-surface-container-low rounded-xl overflow-hidden mb-6">
          <div className="p-6 border-b border-outline-variant/10 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-lg">shield</span>
            <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
              {t("risk.stopLossMonitor")} <HelpBtn topic="stop_loss" />
            </h4>
            <span className="ml-2 text-[10px] text-on-surface-variant">
              {sortedStops.filter((s: StopLossStatus) => s.alert_level === "BREACHED").length} BREACHED ·{" "}
              {sortedStops.filter((s: StopLossStatus) => s.alert_level === "WARNING").length} WARNING ·{" "}
              {sortedStops.filter((s: StopLossStatus) => s.alert_level === "OK").length} OK
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-5 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-right">Entry</th>
                  <th className="px-4 py-3 text-right">Current</th>
                  <th className="px-4 py-3 text-right">Δ Entry</th>
                  <th className="px-4 py-3 text-right">Δ Peak</th>
                  <th className="px-4 py-3 text-center">Fixed</th>
                  <th className="px-4 py-3 text-center">Trailing</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedStops.map((s: StopLossStatus) => {
                  const rowBg =
                    s.alert_level === "BREACHED"
                      ? "bg-error/5"
                      : s.alert_level === "WARNING"
                        ? "bg-secondary/5"
                        : "";
                  const statusCls =
                    s.alert_level === "BREACHED"
                      ? "bg-error text-on-error"
                      : s.alert_level === "WARNING"
                        ? "bg-secondary/20 text-secondary"
                        : "bg-primary/10 text-primary";
                  const fixedCls =
                    s.fixed_status === "BREACHED"
                      ? "text-error font-bold"
                      : s.fixed_status === "WARNING"
                        ? "text-secondary"
                        : "text-primary";
                  const trailCls =
                    s.trailing_status === "BREACHED"
                      ? "text-error font-bold"
                      : s.trailing_status === "WARNING"
                        ? "text-secondary"
                        : "text-primary";
                  return (
                    <tr
                      key={s.ticker}
                      className={`border-b border-outline-variant/5 hover:bg-surface-bright/20 ${rowBg}`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-bold text-on-surface">{s.ticker}</p>
                        <p className="text-[10px] text-on-surface-variant truncate max-w-[120px]">
                          {s.company_name}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface-variant">
                        ${s.entry_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-on-surface">
                        ${s.current_price.toFixed(2)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          (s.from_entry_pct ?? 0) >= 0 ? "text-primary" : "text-error"
                        }`}
                      >
                        {s.from_entry_pct != null
                          ? `${s.from_entry_pct >= 0 ? "+" : ""}${s.from_entry_pct.toFixed(2)}%`
                          : "-"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          s.from_peak_pct >= 0 ? "text-primary" : "text-error"
                        }`}
                      >
                        {s.from_peak_pct >= 0 ? "+" : ""}
                        {s.from_peak_pct.toFixed(2)}%
                      </td>
                      <td className={`px-4 py-3 text-center text-[10px] ${fixedCls}`}>{s.fixed_status}</td>
                      <td className={`px-4 py-3 text-center text-[10px] ${trailCls}`}>{s.trailing_status}</td>
                      <td className="px-5 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold ${statusCls}`}
                        >
                          {s.alert_level}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 섹션 5: Position Sizing ── */}
      <div className="bg-surface-container-low rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-primary text-lg">account_balance_wallet</span>
          <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
            {t("dash.positionSizing")} <HelpBtn topic="position_sizing" />
          </h4>
        </div>
        <div className="relative h-3 w-full bg-surface-container-highest rounded-full overflow-hidden mb-2">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-secondary rounded-full"
            style={{ width: `${data.portfolio_summary?.invested_pct ?? 0}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-bold text-on-surface-variant mb-6">
          <span>투자 {data.portfolio_summary?.invested_pct ?? 0}%</span>
          <span>현금 {data.portfolio_summary?.cash_pct ?? 100}%</span>
        </div>
        <div className="space-y-2">
          {positions.map((pos) => (
            <div key={pos.ticker} className="flex items-center gap-3">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded border text-[10px] font-bold shrink-0 ${gradeClass(pos.grade)}`}
              >
                {pos.grade || "-"}
              </span>
              <div className="w-14 text-xs font-bold text-on-surface shrink-0">{pos.ticker}</div>
              <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${maxPct > 0 ? (pos.final_pct / maxPct) * 100 : 0}%` }}
                />
              </div>
              <span className="w-10 text-right text-[10px] font-bold text-on-surface-variant shrink-0">
                {pos.final_pct}%
              </span>
              <span className="w-20 text-right text-[10px] font-mono text-on-surface-variant shrink-0">
                ${pos.dollar_amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
          {(data.portfolio_summary?.cash_pct ?? 0) > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-outline-variant/10">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-surface-container-highest text-on-surface-variant text-[10px] font-bold shrink-0">
                $
              </span>
              <div className="w-14 text-xs font-bold text-on-surface-variant shrink-0">CASH</div>
              <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className="h-full bg-on-surface-variant/30 rounded-full"
                  style={{ width: `${Math.min(data.portfolio_summary.cash_pct, 100)}%` }}
                />
              </div>
              <span className="w-10 text-right text-[10px] font-bold text-on-surface-variant shrink-0">
                {data.portfolio_summary.cash_pct}%
              </span>
              <span className="w-20 text-right text-[10px] font-mono text-on-surface-variant shrink-0">
                $
                {(
                  (data.portfolio_summary.total_value * data.portfolio_summary.cash_pct) /
                  100
                ).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 섹션 6: Concentration ── */}
      {concentration && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-surface-container-low rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-tertiary text-lg">donut_large</span>
              <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                {t("risk.sectorConc")} <HelpBtn topic="concentration" />
              </h4>
            </div>
            <div className="space-y-3">
              {sectorEntries.map(([sector, d]) => (
                <div key={sector}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="font-bold text-on-surface">{sector}</span>
                    <span className="text-on-surface-variant">
                      {d.count}종목 · {d.pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        d.pct >= 40 ? "bg-error" : d.pct >= 30 ? "bg-secondary" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(d.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {concentration.concentration_warnings.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-error/5 border border-error/20 space-y-1">
                {concentration.concentration_warnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-error">
                    {w}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface-container-low rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-secondary text-lg">hub</span>
              <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
                {t("risk.correlationRisk")} <HelpBtn topic="concentration" />
              </h4>
              <span className="text-[10px] text-on-surface-variant ml-auto">
                threshold: {concentration.correlation_threshold}
              </span>
            </div>
            {concentration.high_correlation_pairs.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg">
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <p className="text-xs text-on-surface-variant">고상관 페어 없음 — 분산 양호</p>
              </div>
            ) : (
              <div className="space-y-3">
                {concentration.high_correlation_pairs.map((pair, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-secondary/5 rounded-lg border border-secondary/20"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface">{pair.pair[0]}</span>
                      <span className="material-symbols-outlined text-on-surface-variant text-sm">swap_horiz</span>
                      <span className="text-xs font-bold text-on-surface">{pair.pair[1]}</span>
                    </div>
                    <span
                      className={`text-sm font-black font-mono ${
                        pair.corr >= 0.9 ? "text-error" : "text-secondary"
                      }`}
                    >
                      {pair.corr.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {Object.keys(concentration.correlation_exposure).length > 0 && (
              <div className="mt-4 pt-4 border-t border-outline-variant/10">
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
                  Correlation Exposure
                </p>
                {Object.entries(concentration.correlation_exposure).map(([ticker, exp]) => (
                  <div key={ticker} className="flex justify-between text-[10px] py-1">
                    <span className="font-bold text-on-surface">{ticker}</span>
                    <span className="text-secondary font-mono">{exp}쌍</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 섹션 7: Component VaR ── */}
      {(data.component_var ?? []).length > 0 && (
        <div className="bg-surface-container-low rounded-xl p-6 mb-6 mt-6">
          <div className="flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-error text-lg">bar_chart</span>
            <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
              {t("risk.componentVar")} <HelpBtn topic="var_risk" />
            </h4>
            <span className="ml-auto text-[10px] text-on-surface-variant">
              종목별 리스크 기여도 (Euler 분해)
            </span>
          </div>
          <div className="space-y-2">
            {(data.component_var ?? []).map((entry: ComponentVarEntry) => {
              const pct = entry.contribution_pct;
              const barColor =
                pct >= 30 ? "bg-error" : pct >= 20 ? "bg-secondary" : "bg-primary";
              return (
                <div key={entry.ticker} className="flex items-center gap-3">
                  <div className="w-12 text-xs font-bold text-on-surface shrink-0">{entry.ticker}</div>
                  <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-[10px] font-bold text-on-surface-variant shrink-0">
                    {pct.toFixed(1)}%
                  </span>
                  <span className="w-24 text-right text-[10px] font-mono text-on-surface-variant shrink-0">
                    ${entry.component_var_dollar.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                  <span className="w-20 text-right text-[10px] font-mono text-on-surface-variant/60 shrink-0">
                    wt {entry.weight_pct}%
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-on-surface-variant mt-4 opacity-60">
            기여도 합 = 포트폴리오 전체 VaR. 기여도가 높을수록 리스크 집중 위험 증가.
          </p>
        </div>
      )}

      {/* ── 섹션 8: Stress Testing ── */}
      {(data.stress_scenarios ?? []).length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span
              className="material-symbols-outlined text-secondary text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              thunderstorm
            </span>
            <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
              {t("risk.stressTesting")} <HelpBtn topic="risk_alert" />
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(data.stress_scenarios ?? []).map((sc: StressScenario) => {
              const ret = sc.avg_portfolio_return;
              const retColor =
                ret < -20 ? "text-error" : ret < -10 ? "text-secondary" : "text-on-surface";
              const bgColor =
                ret < -20 ? "border-error/30 bg-error/5" : ret < -10 ? "border-secondary/20 bg-secondary/5" : "border-outline-variant/10";
              const spyDiff = ret - sc.spy_return;
              return (
                <div key={sc.label} className={`rounded-xl p-5 border ${bgColor}`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                    {sc.label}
                  </p>
                  <p className="text-xs text-on-surface-variant mb-3">{sc.period}</p>
                  <p className={`text-3xl font-black tracking-tighter ${retColor}`}>
                    {ret >= 0 ? "+" : ""}
                    {ret.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-on-surface-variant mt-1">
                    SPY {sc.spy_return >= 0 ? "+" : ""}
                    {sc.spy_return.toFixed(1)}% ·{" "}
                    <span className={spyDiff >= 0 ? "text-primary" : "text-error"}>
                      {spyDiff >= 0 ? "+" : ""}
                      {spyDiff.toFixed(1)}% vs SPY
                    </span>
                  </p>
                  <div className="mt-3 pt-3 border-t border-outline-variant/10 grid grid-cols-2 gap-1 text-[10px]">
                    <div>
                      <span className="text-on-surface-variant">Best </span>
                      <span className="font-bold text-primary">{sc.best_ticker}</span>
                      <span className="text-primary ml-1">
                        {sc.ticker_returns[sc.best_ticker] >= 0 ? "+" : ""}
                        {sc.ticker_returns[sc.best_ticker]?.toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-on-surface-variant">Worst </span>
                      <span className="font-bold text-error">{sc.worst_ticker}</span>
                      <span className="text-error ml-1">
                        {sc.ticker_returns[sc.worst_ticker]?.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 섹션 9: CDaR ── */}
      {(data.cdar ?? []).length > 0 && (
        <div className="bg-surface-container-low rounded-xl overflow-hidden mb-6">
          <div className="p-6 border-b border-outline-variant/10 flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary text-lg">waterfall_chart</span>
            <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
              {t("risk.cdarCvar")} <HelpBtn topic="var_risk" />
            </h4>
            <span className="ml-auto text-[10px] text-on-surface-variant">
              경로 의존형 테일 리스크 (6mo, α=5%)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest border-b border-outline-variant/10">
                  <th className="px-5 py-3 text-left">Ticker</th>
                  <th className="px-4 py-3 text-right">CDaR</th>
                  <th className="px-4 py-3 text-right">CVaR</th>
                  <th className="px-4 py-3 text-right">Max DD</th>
                  <th className="px-5 py-3 text-right">Current DD</th>
                </tr>
              </thead>
              <tbody>
                {[...(data.cdar ?? [])].sort((a, b) => a.cdar_pct - b.cdar_pct).map((row: CdarEntry) => {
                  const worse = row.cdar_pct < row.cvar_pct;
                  return (
                    <tr
                      key={row.ticker}
                      className="border-b border-outline-variant/5 hover:bg-surface-bright/20"
                    >
                      <td className="px-5 py-3 font-bold text-on-surface">{row.ticker}</td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          worse ? "text-error" : "text-secondary"
                        }`}
                      >
                        {row.cdar_pct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-on-surface-variant">
                        {row.cvar_pct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-error">
                        {row.max_dd_pct.toFixed(1)}%
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono font-bold ${
                          row.current_dd_pct < -5 ? "text-error" : "text-on-surface-variant"
                        }`}
                      >
                        {row.current_dd_pct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-6 py-3 text-[10px] text-on-surface-variant opacity-60">
            CDaR = 최악 5% 드로다운 평균 (경로 의존). CVaR = 최악 5% 일 수익률 평균 (점 추정). CDaR &gt; CVaR이면 연속 하락 구간이 더 위험.
          </p>
        </div>
      )}

      {/* 하단 여백 (모바일 nav 공간) */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
