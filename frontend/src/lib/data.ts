// CSR fetch helpers — no build-time bundle inclusion.
// All data is fetched at runtime so Synology static serving always returns fresh JSON.

export async function fetchReportData(filename: string): Promise<unknown> {
  const res = await fetch(`/data/${filename}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${filename}: ${res.status}`);
  return res.json();
}

export type Regime = "risk_on" | "neutral" | "risk_off" | "crisis";
export type SignalState = "risk_on" | "neutral" | "risk_off";
export type GateState = "GO" | "CAUTION" | "STOP";
export type Recommendation = "BUY" | "WATCH" | "SMALL BUY" | "HOLD" | string;
export type Grade = "A" | "B" | "C" | "D" | "F" | string;

export interface RegimeConfig {
  regime: Regime;
  weighted_score: number;
  confidence: number;
  signals: {
    vix: SignalState;
    trend: SignalState;
    breadth: SignalState;
    credit: SignalState;
    yield_curve: SignalState;
  };
  adaptive_params: {
    stop_loss: string;
    max_drawdown_warning: string;
  };
}

export interface SectorSignal {
  name: string;
  ticker: string;
  score: number;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL" | string;
  price: number;
  change_1d: number;
  rsi: number;
  rs_vs_spy: number;
}

export interface MarketGate {
  gate: GateState;
  score: number;
  reasons: string[];
  metrics: {
    avg_score: number;
    bullish_sectors: number;
    bearish_sectors: number;
    top_sector: string;
    bottom_sector: string;
  };
  sectors: SectorSignal[];
  spy_divergence?: {
    signal: string;
    label: string;
    severity: string;
    spy_price?: number;
    change_10d_pct?: number;
    vol_ratio_2d_vs_20d_avg?: number;
  };
}

export interface TopPick {
  ticker: string;
  quant_score: number;
  grade: Grade;
  ai_score?: number;
  ai_recommendation?: Recommendation;
  ai_contribution?: number;
  final_score: number;
  has_ai?: boolean;
  tech_score?: number;
  fund_score?: number;
  rs_vs_spy?: number;
  company_name?: string;
  sector?: string;
}

export interface Top10Report {
  generated_at: string;
  total_screened: number;
  ai_analyzed: number;
  top10: TopPick[];
}

export type AIPoint = string | { point: string; evidence?: string };

export interface AISummary {
  thesis: string;
  catalysts: AIPoint[];
  bear_cases: AIPoint[];
  recommendation: Recommendation;
  confidence: number | string;
}

export function renderAIPoint(p: AIPoint): { point: string; evidence?: string } {
  if (typeof p === "string") return { point: p };
  return { point: p.point, evidence: p.evidence };
}

export type AISummaries = Record<string, AISummary>;

export interface GbmPrediction {
  ticker: string;
  gbm_score: number;
  gbm_rank: number;
  company_name?: string;
  sector?: string;
}

export interface GbmPredictions {
  total: number;
  top: GbmPrediction[];
  model: string;
  generated_from: string;
}

export interface KeyDriver {
  feature: string;
  importance: number;
  value: number;
  direction: "bullish" | "bearish" | string;
}

export interface DirectionalPrediction {
  direction: "bullish" | "bearish" | string;
  probability_up: number;
  predicted_return: number;
  confidence: string;
  confidence_pct: number;
  key_drivers: KeyDriver[];
}

export interface IndexPrediction {
  date: string;
  predictions: {
    spy: DirectionalPrediction;
    qqq: DirectionalPrediction;
  };
}

export interface PredictionHistoryEntry {
  date: string;
  spy: Partial<DirectionalPrediction>;
  qqq: Partial<DirectionalPrediction>;
  model_accuracy?: number;
}

export interface StockPick {
  ticker: string;
  company_name?: string;
  composite_score?: number;
  grade: Grade;
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
}

export interface DailyReportSummary {
  total_screened?: number;
  grade_distribution?: Record<string, number>;
  strategy_distribution?: Record<string, number>;
  action_distribution?: Record<string, number>;
}

export interface LatestReport {
  generated_at?: string;
  data_date?: string;
  market_timing?: {
    regime: Regime;
    regime_score: number;
    regime_confidence: number;
    gate: GateState;
    gate_score: number;
    ml_predictor?: {
      spy?: DirectionalPrediction;
      qqq?: DirectionalPrediction;
    };
  };
  verdict?: string;
  stock_picks?: StockPick[];
  summary?: DailyReportSummary;
}


// Helper to format generated_at as KST-friendly string
export function formatTimestamp(ts: string | undefined): string {
  if (!ts) return "—";
  return ts;
}

// Regime color helper
export function regimeColor(r: Regime | string): string {
  switch (r) {
    case "risk_on": return "text-emerald-400";
    case "neutral": return "text-yellow-400";
    case "risk_off": return "text-orange-400";
    case "crisis": return "text-red-500";
    default: return "text-zinc-400";
  }
}

export function gateColor(g: GateState | string): string {
  switch (g) {
    case "GO": return "text-emerald-400";
    case "CAUTION": return "text-yellow-400";
    case "STOP": return "text-red-500";
    default: return "text-zinc-400";
  }
}

export function gradeColor(g: Grade | string): string {
  switch (g) {
    case "A": return "bg-emerald-500 text-black";
    case "B": return "bg-lime-500 text-black";
    case "C": return "bg-yellow-500 text-black";
    case "D": return "bg-orange-500 text-black";
    case "F": return "bg-red-500 text-white";
    default: return "bg-zinc-700 text-white";
  }
}

// ── Risk Alert Types (Part 6) ──────────────────────────────────

export type RiskLevel = "CRITICAL" | "WARNING" | "INFO";

export interface RiskAlert {
  level: RiskLevel;
  category: string;
  ticker: string;
  message: string;
  value: number;
  threshold: number;
  action: string;
  timestamp: string;
}

export interface PositionSize {
  ticker: string;
  company_name: string;
  grade: string;
  base_pct: number;
  grade_multiplier?: number;
  regime_multiplier?: number;
  verdict_cap?: string | null;
  final_pct: number;
  dollar_amount: number;
}

export interface StopLossStatus {
  ticker: string;
  company_name: string;
  entry_price: number;
  peak_price: number;
  current_price: number;
  from_entry_pct: number;
  from_peak_pct: number;
  fixed_threshold: number;
  trailing_threshold: number;
  fixed_status: "OK" | "WARNING" | "BREACHED";
  trailing_status: "OK" | "WARNING" | "BREACHED";
  regime: string;
  alert_level: "OK" | "WARNING" | "BREACHED";
}

export interface DrawdownData {
  current_price: number;
  peak_price: number;
  entry_price: number;
  from_entry_pct: number;
  from_peak_pct: number;
  max_dd: number;
  from_peak_days: number;
}

export interface ConcentrationData {
  sector_concentration: Record<string, { count: number; pct: number }>;
  concentration_warnings: string[];
  high_correlation_pairs: Array<{ pair: [string, string]; corr: number }>;
  correlation_exposure: Record<string, number>;
  correlation_threshold: number;
}

export interface ComponentVarEntry {
  ticker: string;
  weight_pct: number;
  component_var_pct: number;
  component_var_dollar: number;
  contribution_pct: number;
  marginal_var: number;
}

export interface StressScenario {
  scenario: string;
  label: string;
  period: string;
  color: string;
  avg_portfolio_return: number;
  spy_return: number;
  ticker_returns: Record<string, number>;
  best_ticker: string;
  worst_ticker: string;
}

export interface CdarEntry {
  ticker: string;
  cdar_pct: number;
  cvar_pct: number;
  max_dd_pct: number;
  current_dd_pct: number;
  period: string;
  alpha: number;
}

export interface RiskAlertData {
  generated_at: string;
  regime: string;
  verdict: string;
  market_context?: {
    regime: string;
    verdict: string;
    index_prediction: {
      spy_direction: string;
      spy_probability: number;
      qqq_direction: string;
      qqq_probability: number;
    };
    ai_sell_count: number;
    prediction_warning_active: boolean;
  };
  portfolio_summary: {
    total_value: number;
    invested_pct: number;
    cash_pct: number;
    total_var_dollar: number;
    risk_budget_status: string;
  };
  alerts: RiskAlert[];
  position_sizes: PositionSize[];
  stop_loss_status?: StopLossStatus[];
  drawdowns?: Record<string, DrawdownData>;
  concentration?: ConcentrationData;
  component_var?: ComponentVarEntry[];
  stress_scenarios?: StressScenario[];
  cdar?: CdarEntry[];
}

export function riskLevelColor(level: RiskLevel | string): string {
  switch (level) {
    case "CRITICAL": return "text-red-500";
    case "WARNING": return "text-amber-500";
    case "INFO": return "text-blue-500";
    default: return "text-zinc-400";
  }
}

export async function loadRiskAlerts(): Promise<RiskAlertData | null> {
  try {
    const res = await fetch("/api/data/risk?date=latest", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json() as RiskAlertData;
  } catch {
    return null;
  }
}
