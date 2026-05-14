"use client";
import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { HelpBtn } from "@/components/HelpBtn";
import { regimeColor, gateColor } from "@/lib/data";
import { useT, mapRegime, mapGate } from "@/lib/i18n";
import { useLang } from "@/components/LangProvider";

// ── 타입 ─────────────────────────────────────────────────────────

type Metrics = {
  cumulative_return: number;
  annualized_return: number;
  sharpe: number;
  alpha_vs_spy: number;
  max_drawdown: number;
  win_rate: number;
};

type EquityPoint = { date: string; value: number; invested?: boolean };

type SignalEntry = {
  date: string;
  regime: string;
  gate: string;
  verdict: string;
  invested: boolean;
  daily_return_pct: number;
  tickers: string[];
};

type Strategy = {
  label: string;
  description: string;
  color: string;
  metrics: Metrics;
  equity_curve: EquityPoint[];
  signal_log: SignalEntry[];
  trade_count: number;
};

type PerformanceData = {
  generated_at: string;
  date_range: { start: string; end: string };
  spy_cumulative_return: number;
  spy_annualized_return: number;
  strategies: Record<string, Strategy>;
  spy_curve: EquityPoint[];
  note: string;
};

type StrategyKey = string;

// ── 기간 필터 ─────────────────────────────────────────────────────

type Period = "1M" | "3M" | "6M" | "ALL" | "CUSTOM";

function filterByPeriod(
  data: PerformanceData,
  period: Period,
  customRange?: { start: string; end: string }
): PerformanceData {
  if (period === "ALL") return data;

  let cutoffStr: string;
  let endStr: string | null = null;

  if (period === "CUSTOM") {
    if (!customRange?.start) return data;
    cutoffStr = customRange.start;
    endStr = customRange.end || null;
  } else {
    const days = { "1M": 30, "3M": 90, "6M": 180 }[period as "1M" | "3M" | "6M"];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoffStr = cutoff.toISOString().slice(0, 10);
  }

  const inRange = (date: string) =>
    date >= cutoffStr && (endStr ? date <= endStr : true);

  const filtered: PerformanceData = {
    ...data,
    spy_curve: data.spy_curve.filter((p) => inRange(p.date)),
    strategies: {},
  };

  Object.entries(data.strategies).forEach(([key, s]) => {
    const filteredCurve = s.equity_curve.filter((p) => inRange(p.date));
    const filteredLog = s.signal_log.filter((p) => inRange(p.date));
    const tradeReturns = filteredLog.filter((e) => e.invested).map((e) => e.daily_return_pct);
    const initial = filteredCurve[0]?.value ?? 10000;
    const final = filteredCurve[filteredCurve.length - 1]?.value ?? initial;
    const cumRet = ((final / initial) - 1) * 100;
    const n = Math.max(filteredLog.length, 1);
    const annRet = ((final / initial) ** (252 / n) - 1) * 100;
    const meanR = tradeReturns.length ? tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length : 0;
    const stdR = tradeReturns.length > 1
      ? Math.sqrt(tradeReturns.reduce((a, b) => a + (b - meanR) ** 2, 0) / (tradeReturns.length - 1))
      : 0;
    const sharpe = stdR > 0 ? (meanR / stdR) * Math.sqrt(252) : 0;
    const winRate = tradeReturns.length
      ? (tradeReturns.filter((r) => r > 0).length / tradeReturns.length) * 100
      : 0;
    let peak = initial, mdd = 0;
    for (const p of filteredCurve) {
      if (p.value > peak) peak = p.value;
      const dd = (p.value - peak) / peak * 100;
      if (dd < mdd) mdd = dd;
    }
    const spyCurve = filtered.spy_curve;
    const spyInitial = spyCurve[0]?.value ?? 10000;
    const spyFinal = spyCurve[spyCurve.length - 1]?.value ?? spyInitial;
    const spyAnn = ((spyFinal / spyInitial) ** (252 / n) - 1) * 100;

    filtered.strategies[key] = {
      ...s,
      equity_curve: filteredCurve,
      signal_log: filteredLog,
      trade_count: tradeReturns.length,
      metrics: {
        cumulative_return: Math.round(cumRet * 100) / 100,
        annualized_return: Math.round(annRet * 100) / 100,
        sharpe: Math.round(sharpe * 1000) / 1000,
        max_drawdown: Math.round(mdd * 100) / 100,
        win_rate: Math.round(winRate * 10) / 10,
        alpha_vs_spy: Math.round((annRet - spyAnn) * 100) / 100,
      },
    };
  });

  return filtered;}

// ── 차트 데이터 병합 ──────────────────────────────────────────────

function mergeChartData(data: PerformanceData) {
  const map = new Map<string, Record<string, number>>();
  data.spy_curve.forEach((p) => { map.set(p.date, { spy: p.value }); });
  Object.keys(data.strategies).forEach((key) => {
    data.strategies[key]?.equity_curve.forEach((p) => {
      const entry = map.get(p.date) ?? {};
      entry[key] = p.value;
      map.set(p.date, entry);
    });
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }));
}

// ── 메트릭 정의 ───────────────────────────────────────────────────

const METRICS = [
  {
    key: "cumulative_return" as keyof Metrics,
    labelKey: "perf.totalReturn",
    suffix: "%",
    icon: "trending_up",
    fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    color: (v: number) => (v >= 0 ? "text-primary" : "text-error"),
  },
  {
    key: "sharpe" as keyof Metrics,
    labelKey: "perf.sharpe",
    suffix: "",
    icon: "speed",
    fmt: (v: number) => v.toFixed(2),
    color: (v: number) =>
      v >= 1 ? "text-primary" : v >= 0 ? "text-yellow-400" : "text-error",
  },
  {
    key: "alpha_vs_spy" as keyof Metrics,
    labelKey: "perf.alpha",
    suffix: "%",
    icon: "leaderboard",
    fmt: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
    color: (v: number) => (v >= 0 ? "text-primary" : "text-error"),
  },
  {
    key: "max_drawdown" as keyof Metrics,
    labelKey: "perf.maxDd",
    suffix: "%",
    icon: "trending_down",
    fmt: (v: number) => `${v.toFixed(1)}%`,
    color: () => "text-error",
  },
  {
    key: "win_rate" as keyof Metrics,
    labelKey: "perf.winRate",
    suffix: "%",
    icon: "check_circle",
    fmt: (v: number) => `${v.toFixed(0)}%`,
    color: (v: number) =>
      v >= 60 ? "text-primary" : v >= 50 ? "text-yellow-400" : "text-error",
  },
];

// strategy_a → "A", strategy_b → "B", ...  동적 처리
const stratLabel = (key: StrategyKey) =>
  key.replace("strategy_", "").toUpperCase();

// ── Verdict 색상 ─────────────────────────────────────────────────

function verdictColor(v: string) {
  switch (v) {
    case "GO":
      return "text-primary";
    case "CAUTION":
      return "text-yellow-400";
    case "STOP":
      return "text-error";
    default:
      return "text-on-surface-variant";
  }
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-high border border-outline-variant/20 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-bold text-on-surface mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-on-surface-variant">{entry.name}:</span>
          <span className="font-bold" style={{ color: entry.color }}>
            ${entry.value?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 페이지 ───────────────────────────────────────────────────────

export default function PerformancePage() {
  const t = useT();
  const { lang } = useLang();
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>("strategy_a");
  const [period, setPeriod] = useState<Period>("ALL");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/data/performance", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: PerformanceData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
          sync
        </span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-surface-container-low rounded-xl p-10 text-center">
        <p className="text-on-surface-variant">
          {t("common.noData")}
        </p>
      </div>
    );
  }

  const customRange =
    period === "CUSTOM" && customStart
      ? { start: customStart, end: customEnd || data.date_range.end }
      : undefined;
  const filteredData = filterByPeriod(data, period, customRange);
  const strategyKeys = Object.keys(filteredData.strategies);
  const strategy = filteredData.strategies[activeStrategy] ?? filteredData.strategies[strategyKeys[0]];
  const chartData = mergeChartData(filteredData);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-surface-container-low p-8 rounded-xl relative overflow-hidden">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold tracking-tight mb-1 flex items-center gap-2">
            {t("perf.backtester")} <HelpBtn topic="performance" />
          </h2>
          <p className="text-sm text-on-surface-variant">
            {period === "ALL"
              ? `${data.date_range.start} ~ ${data.date_range.end}`
              : `최근 ${period} · ${filteredData.spy_curve[0]?.date ?? ""} ~`}{" "}
            · 3거래일 보유 ·{" "}
            <span className="text-on-surface">SPY {data.spy_cumulative_return > 0 ? "+" : ""}{data.spy_cumulative_return.toFixed(1)}%</span>
          </p>
          <p className="text-[11px] text-on-surface-variant mt-1 opacity-60">{data.note}</p>
        </div>
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <span className="material-symbols-outlined" style={{ fontSize: "120px" }}>
            trending_up
          </span>
        </div>
      </div>

      {/* 기간 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-widest mr-1">기간</span>
        {(["1M", "3M", "6M", "ALL"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              period === p
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {p === "ALL" ? "전체" : p}
          </button>
        ))}
        <button
          onClick={() => setPeriod("CUSTOM")}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
            period === "CUSTOM"
              ? "bg-primary text-on-primary"
              : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-sm leading-none">calendar_month</span>
          직접
        </button>
        {period === "CUSTOM" && (
          <>
            <input
              type="date"
              value={customStart}
              min={data.date_range.start}
              max={data.date_range.end}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-surface-container-high text-on-surface text-xs rounded-lg px-2 py-1.5 border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
            <span className="text-on-surface-variant text-xs">~</span>
            <input
              type="date"
              value={customEnd}
              min={customStart || data.date_range.start}
              max={data.date_range.end}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-surface-container-high text-on-surface text-xs rounded-lg px-2 py-1.5 border border-outline-variant/20 focus:outline-none focus:border-primary"
            />
          </>
        )}
      </div>

      {/* 전략 탭 */}
      <div className="flex gap-2 flex-wrap">
        {strategyKeys.map((key) => {
          const s = filteredData.strategies[key];
          const active = activeStrategy === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStrategy(key)}
              style={active ? { borderColor: s.color, color: s.color } : {}}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                active
                  ? "bg-surface-container-high"
                  : "border-outline-variant/20 text-on-surface-variant bg-surface-container-low hover:bg-surface-container-high"
              }`}
            >
              <span className="font-black">{stratLabel(key)}</span>
              <span className="ml-2 hidden sm:inline">{s.label}</span>
              <span
                className="ml-2 text-xs font-black"
                style={{ color: s.metrics.cumulative_return >= 0 ? "#4ade80" : "#f87171" }}
              >
                {s.metrics.cumulative_return > 0 ? "+" : ""}
                {s.metrics.cumulative_return.toFixed(1)}%
              </span>
            </button>
          );
        })}
        {/* SPY 뱃지 */}
        <div className="px-4 py-2.5 rounded-xl text-sm font-bold border border-outline-variant/20 bg-surface-container-low text-on-surface-variant flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#f97316]" />
          <span>SPY</span>
          <span
            className="text-xs font-black"
            style={{
              color: (() => {
                const spyCurve = filteredData.spy_curve;
                if (spyCurve.length < 2) return "#94a3b8";
                const ret = (spyCurve[spyCurve.length - 1].value / spyCurve[0].value - 1) * 100;
                return ret >= 0 ? "#4ade80" : "#f87171";
              })(),
            }}
          >
            {(() => {
              const spyCurve = filteredData.spy_curve;
              if (spyCurve.length < 2) return "—";
              const ret = (spyCurve[spyCurve.length - 1].value / spyCurve[0].value - 1) * 100;
              return `${ret > 0 ? "+" : ""}${ret.toFixed(1)}%`;
            })()}
          </span>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="bg-surface-container-low rounded-xl p-6">
        <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface mb-4 flex items-center gap-2">
          {t("perf.equityCurve")} <HelpBtn topic="performance" />
        </h4>
        {mounted ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
              <defs>
                {strategyKeys.map((key) => (
                  <linearGradient key={key} id={`grad_${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={data.strategies[key].color}
                      stopOpacity={activeStrategy === key ? 0.25 : 0.08}
                    />
                    <stop
                      offset="95%"
                      stopColor={data.strategies[key].color}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0c" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(d: string) => d.slice(5)}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickFormatter={(v: number) =>
                  `$${Math.round(v / 100) * 100 === v ? (v / 1000).toFixed(1) + "k" : v}`
                }
                width={48}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{value}</span>
                )}
              />
              {/* SPY 벤치마크 (점선) */}
              <Area
                type="monotone"
                dataKey="spy"
                name="SPY"
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                fill="none"
                dot={false}
                activeDot={{ r: 4, fill: "#f97316" }}
              />
              {/* 선택된 전략만 표시 */}
              {strategyKeys
                .filter((key) => key === activeStrategy)
                .map((key) => {
                  const s = data.strategies[key];
                  return (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={`${stratLabel(key)}: ${s.label}`}
                      stroke={s.color}
                      strokeWidth={2.5}
                      fill={`url(#grad_${key})`}
                      dot={false}
                      activeDot={{ r: 5, fill: s.color }}
                    />
                  );
                })}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center">
            <span className="material-symbols-outlined animate-spin text-3xl text-primary">sync</span>
          </div>
        )}
      </div>

      {/* 메트릭 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRICS.map((m) => {
          const val = strategy.metrics[m.key] ?? 0;
          return (
            <div
              key={m.key}
              className="bg-surface-container-low rounded-xl p-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <span className="material-symbols-outlined text-base">{m.icon}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">
                  {t(m.labelKey)}
                </span>
              </div>
              <p className={`text-2xl font-black ${m.color(val)}`}>{m.fmt(val)}</p>
              <p className="text-[10px] text-on-surface-variant">
                vs SPY:{" "}
                {m.key === "alpha_vs_spy"
                  ? "연간 초과수익"
                  : m.key === "cumulative_return"
                  ? `SPY ${data.spy_cumulative_return > 0 ? "+" : ""}${data.spy_cumulative_return.toFixed(1)}%`
                  : `투자 ${strategy.trade_count}/${Object.values(strategy.signal_log).length}일`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Signal Timeline */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            {t("perf.signalTimeline")} — {strategy.label} <HelpBtn topic="performance" />
          </h4>
          <span className="text-xs text-on-surface-variant">
            투자 {strategy.trade_count} / {strategy.signal_log.length}일
          </span>
        </div>
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-high/20">
                {[t("forecast.colDate"), t("common.regime"), t("common.gate"), t("common.verdict"), t("perf.colInvest"), t("perf.col5dReturn")].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {[...strategy.signal_log].reverse().map((entry) => (
                <tr
                  key={entry.date}
                  className={`hover:bg-surface-bright/10 transition-colors ${
                    entry.invested ? "" : "opacity-50"
                  }`}
                >
                  <td className="px-4 py-3 text-[11px] font-mono text-on-surface-variant whitespace-nowrap">
                    {entry.date}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${regimeColor(entry.regime)}`}>
                      {mapRegime(lang, entry.regime)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${gateColor(entry.gate)}`}>
                      {mapGate(lang, entry.gate)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${verdictColor(entry.verdict)}`}>
                      {mapGate(lang, entry.verdict)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.invested ? (
                      <span className="material-symbols-outlined text-primary text-base">
                        check_circle
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-on-surface-variant/30 text-base">
                        remove_circle
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {entry.invested ? (
                      <span
                        className={`text-sm font-black ${
                          entry.daily_return_pct >= 0 ? "text-primary" : "text-error"
                        }`}
                      >
                        {entry.daily_return_pct > 0 ? "+" : ""}
                        {entry.daily_return_pct.toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-xs text-on-surface-variant/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 전략 설명 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {strategyKeys.map((key) => {
          const s = filteredData.strategies[key];
          const active = activeStrategy === key;
          return (
            <button
              key={key}
              onClick={() => setActiveStrategy(key)}
              className={`p-5 rounded-xl text-left transition-all border ${
                active
                  ? "bg-surface-container-high border-primary/30"
                  : "bg-surface-container-low border-outline-variant/10 hover:bg-surface-container-high"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-xs font-black uppercase tracking-widest">
                  전략 {stratLabel(key)}
                </span>
              </div>
              <p className="text-sm font-bold text-on-surface mb-1">{s.label}</p>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {s.description}
              </p>
              <div className="mt-3 flex gap-3 text-xs">
                <span style={{ color: s.color }} className="font-black">
                  {s.metrics.cumulative_return > 0 ? "+" : ""}
                  {s.metrics.cumulative_return.toFixed(1)}%
                </span>
                <span className="text-on-surface-variant">
                  투자 {s.trade_count}일
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
