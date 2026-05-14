export const dynamic = "force-dynamic";

type MarketSession = "pre_market" | "regular" | "after_hours" | "closed";

type LiveQuote = {
  symbol: string;
  label: string;
  price: number | null;
  changePct: number | null;
  previousClose: number | null;
  timestamp: string | null;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
};

const CORE_SYMBOLS = [
  { symbol: "SPY", label: "S&P 500 ETF" },
  { symbol: "QQQ", label: "Nasdaq 100 ETF" },
  { symbol: "^VIX", label: "VIX" },
];

const SECTOR_SYMBOLS = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLV", label: "Health Care" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLY", label: "Consumer Disc." },
  { symbol: "XLP", label: "Consumer Staples" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLC", label: "Communication" },
];

function getNewYorkParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function getMarketDate() {
  const { year, month, day } = getNewYorkParts();
  return `${year}-${month}-${day}`;
}

function getMarketSession(): MarketSession {
  const { weekday, hour, minute } = getNewYorkParts();
  if (weekday === "Sat" || weekday === "Sun") return "closed";

  const mins = hour * 60 + minute;
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre_market";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after_hours";
  return "closed";
}

function lastValid(values: Array<number | null> | undefined): { value: number | null; index: number } {
  if (!values) return { value: null, index: -1 };
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (typeof value === "number" && Number.isFinite(value)) return { value, index: i };
  }
  return { value: null, index: -1 };
}

async function fetchQuote(symbol: string, label: string): Promise<LiveQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=5m&includePrePost=true`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo chart failed for ${symbol}: ${res.status}`);

  const body = (await res.json()) as YahooChartResponse;
  const result = body.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close;
  const latest = lastValid(closes);
  const price = latest.value ?? result?.meta?.regularMarketPrice ?? null;
  const previousClose = result?.meta?.chartPreviousClose ?? result?.meta?.previousClose ?? null;
  const ts = latest.index >= 0 ? result?.timestamp?.[latest.index] : undefined;
  const changePct =
    price != null && previousClose != null && previousClose !== 0
      ? (price / previousClose - 1) * 100
      : null;

  return {
    symbol,
    label,
    price: price == null ? null : Number(price.toFixed(2)),
    changePct: changePct == null ? null : Number(changePct.toFixed(2)),
    previousClose: previousClose == null ? null : Number(previousClose.toFixed(2)),
    timestamp: ts ? new Date(ts * 1000).toISOString() : null,
  };
}

function classifyLiveRegime(core: LiveQuote[]) {
  const spy = core.find((q) => q.symbol === "SPY");
  const qqq = core.find((q) => q.symbol === "QQQ");
  const vix = core.find((q) => q.symbol === "^VIX");

  let score = 0;
  if ((spy?.changePct ?? 0) > 0.15) score += 1;
  if ((qqq?.changePct ?? 0) > 0.15) score += 1;
  if ((vix?.price ?? 99) < 18) score += 1;
  if ((spy?.changePct ?? 0) < -0.5) score -= 1;
  if ((qqq?.changePct ?? 0) < -0.5) score -= 1;
  if ((vix?.price ?? 0) > 25) score -= 2;

  if (score >= 2) return { regime: "risk_on", label: "Risk-on tilt" };
  if (score <= -2) return { regime: "risk_off", label: "Risk-off tilt" };
  return { regime: "neutral", label: "Mixed / neutral" };
}

export async function GET() {
  try {
    const [core, sectors] = await Promise.all([
      Promise.all(CORE_SYMBOLS.map((q) => fetchQuote(q.symbol, q.label))),
      Promise.all(SECTOR_SYMBOLS.map((q) => fetchQuote(q.symbol, q.label))),
    ]);
    const classification = classifyLiveRegime(core);

    return Response.json({
      generated_at: new Date().toISOString(),
      market_date: getMarketDate(),
      market_timezone: "America/New_York",
      session_state: getMarketSession(),
      data_source: "Yahoo Finance chart API",
      provisional: true,
      ...classification,
      core,
      sectors: sectors.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999)),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "live snapshot failed" },
      { status: 502 },
    );
  }
}
