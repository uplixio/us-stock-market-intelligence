import logging
import time
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

SECTORS = {
    "Technology": "XLK",
    "Health Care": "XLV",
    "Financials": "XLF",
    "Cons Disc": "XLY",
    "Cons Staples": "XLP",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Materials": "XLB",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
    "Communication": "XLC",
}


@dataclass
class SectorResult:
    name: str
    ticker: str
    score: float
    signal: str
    price: float
    change_1d: float
    rsi: float
    rs_vs_spy: float


@dataclass
class USMarketGateResult:
    gate: str  # GO / CAUTION / STOP
    score: float
    reasons: list[str] = field(default_factory=list)
    sectors: list[SectorResult] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


def calculate_rsi(series: pd.Series, period: int = 14) -> float:
    if series is None or len(series) < period + 1:
        return 50.0

    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    last = rsi.iloc[-1]
    return 50.0 if np.isnan(last) else round(float(last), 2)


def calculate_macd_signal(series: pd.Series) -> str:
    if series is None or len(series) < 35:
        return "NEUTRAL"

    ema12 = series.ewm(span=12, adjust=False).mean()
    ema26 = series.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    histogram = macd_line - signal_line

    # 크로스오버 감지
    prev_diff = macd_line.iloc[-2] - signal_line.iloc[-2]
    curr_diff = macd_line.iloc[-1] - signal_line.iloc[-1]

    # 크로스오버 체크 (히스토그램 체크보다 먼저 — 크로스오버가 우선순위 높음)
    # MACD가 시그널 위로 올라옴
    if prev_diff <= 0 and curr_diff > 0:
        return "BULLISH"
    # MACD가 시그널 아래로 내려감
    if prev_diff >= 0 and curr_diff < 0:
        return "BEARISH"

    # 히스토그램 축소 감지 (크로스오버 없는 경우에만 적용)
    curr_hist = abs(histogram.iloc[-1])
    prev_hist = abs(histogram.iloc[-2])
    if prev_hist > 0 and curr_hist < prev_hist * 0.5:
        return "NEUTRAL"

    # 현재 위치 기준
    if curr_diff > 0:
        return "BULLISH"
    elif curr_diff < 0:
        return "BEARISH"

    return "NEUTRAL"


def calculate_volume_ratio(volume: pd.Series, period: int = 20) -> float:
    if volume is None or len(volume) < period:
        return 1.0

    avg = volume.rolling(period).mean().iloc[-1]
    if avg == 0 or np.isnan(avg):
        return 1.0

    return round(float(volume.iloc[-1] / avg), 2)


def detect_volume_price_divergence(df: pd.DataFrame) -> str:
    """거래량-가격 다이버전스 감지

    bearish divergence: 가격↑ + 거래량↓ (상승 신뢰도 낮음)
    bullish divergence: 가격↓ + 거래량↓ (하락 확신 약함 = 반등 가능)
    volume_surge: 가격↑ + 거래량↑ (강한 상승)
    volume_decline_bear: 가격↓ + 거래량↑ (강한 매도 압력)
    """
    if len(df) < 5:
        return "insufficient_data"

    try:
        recent = df.tail(5)
        price_change = (recent['Close'].iloc[-1] - recent['Close'].iloc[0]) / recent['Close'].iloc[0]

        avg_vol = df['Volume'].tail(20).mean() if len(df) >= 20 else df['Volume'].mean()
        recent_vol = recent['Volume'].mean()
        vol_ratio = (recent_vol - avg_vol) / avg_vol if avg_vol > 0 else 0

        if price_change > 0.02 and vol_ratio < -0.15:
            return "bearish_div"     # 가격↑ + 거래량↓ = 상승 신뢰도 낮음
        elif price_change < -0.02 and vol_ratio < -0.15:
            return "bullish_div"     # 가격↓ + 거래량↓ = 하락 확신 약함 (반등 가능성)
        elif price_change > 0.02 and vol_ratio > 0.20:
            return "volume_surge"    # 가격↑ + 거래량↑ = 강한 상승
        elif price_change < -0.02 and vol_ratio > 0.20:
            return "volume_decline_bear"  # 가격↓ + 거래량↑ = 강한 매도
        else:
            return "normal"
    except Exception:
        return "unknown"


def _fetch_history(ticker: str, period: str = "6mo", session=None) -> pd.DataFrame:
    try:
        t = yf.Ticker(ticker, session=session)
        return t.history(period=period)
    except Exception:
        logger.debug("%s 수집 실패", ticker)
        return pd.DataFrame()


def analyze_sector(name: str, ticker: str, spy_close: pd.Series, session=None) -> SectorResult:
    hist = _fetch_history(ticker, period="6mo", session=session)
    if hist.empty:
        return SectorResult(name=name, ticker=ticker, score=50, signal="NEUTRAL",
                            price=0, change_1d=0, rsi=50, rs_vs_spy=1.0)

    close = hist["Close"]
    price = float(close.iloc[-1])
    change_1d = round((close.iloc[-1] / close.iloc[-2] - 1) * 100, 2) if len(close) >= 2 else 0

    rsi = calculate_rsi(close)
    macd = calculate_macd_signal(close)
    vol_ratio = calculate_volume_ratio(hist["Volume"])

    # SPY 대비 상대강도 (20일)
    if spy_close is not None and len(close) >= 20 and len(spy_close) >= 20:
        sector_ret = float(close.iloc[-1] / close.iloc[-20] - 1)
        spy_ret = float(spy_close.iloc[-1] / spy_close.iloc[-20] - 1)
        rs_vs_spy = round(sector_ret - spy_ret, 4)
    else:
        rs_vs_spy = 0.0

    # 종합 점수 (0~100)
    # RSI 점수: 30~70 → 높을수록 강세
    rsi_score = min(max((rsi - 20) / 60 * 100, 0), 100)
    # MACD 점수
    macd_score = {"BULLISH": 80, "NEUTRAL": 50, "BEARISH": 20}[macd]
    # 거래량 점수: 1.0 기준, 높으면 가산
    vol_score = min(vol_ratio * 50, 100)
    # 상대강도 점수
    rs_score = min(max(50 + rs_vs_spy * 500, 0), 100)

    score = round(rsi_score * 0.30 + macd_score * 0.30 + vol_score * 0.20 + rs_score * 0.20, 1)
    signal = "BULLISH" if score >= 60 else "BEARISH" if score < 40 else "NEUTRAL"

    return SectorResult(name=name, ticker=ticker, score=score, signal=signal,
                        price=round(price, 2), change_1d=change_1d, rsi=rsi, rs_vs_spy=rs_vs_spy)


def run_market_gate(session=None) -> USMarketGateResult:
    # SPY 데이터 수집
    spy_hist = _fetch_history("SPY", period="6mo", session=session)
    spy_close = spy_hist["Close"] if not spy_hist.empty else None

    # 11개 섹터 분석
    sectors = []
    for name, ticker in SECTORS.items():
        result = analyze_sector(name, ticker, spy_close, session=session)
        sectors.append(result)
        logger.info("%s(%s): 점수=%.1f, 신호=%s", name, ticker, result.score, result.signal)
        time.sleep(0.5)

    # 평균 점수 → 게이트 판정
    avg_score = round(sum(s.score for s in sectors) / len(sectors), 1)
    reasons = []

    if avg_score >= 70:
        gate = "GO"
        reasons.append(f"섹터 평균 점수 {avg_score}점 — 강세 시장")
    elif avg_score >= 40:
        gate = "CAUTION"
        reasons.append(f"섹터 평균 점수 {avg_score}점 — 혼조세")
    else:
        gate = "STOP"
        reasons.append(f"섹터 평균 점수 {avg_score}점 — 약세 시장")

    bullish = sum(1 for s in sectors if s.signal == "BULLISH")
    bearish = sum(1 for s in sectors if s.signal == "BEARISH")
    reasons.append(f"강세 {bullish}개 / 약세 {bearish}개 섹터")

    # SPY 거래량-가격 다이버전스 감지
    divergence = detect_volume_price_divergence(spy_hist) if not spy_hist.empty else "insufficient_data"
    divergence_warning = divergence in ["bearish_div", "volume_decline_bear"]
    if divergence_warning:
        reasons.append(f"SPY 다이버전스 경고: {divergence}")

    metrics = {
        "avg_score": avg_score,
        "bullish_sectors": bullish,
        "bearish_sectors": bearish,
        "top_sector": max(sectors, key=lambda s: s.score).name,
        "bottom_sector": min(sectors, key=lambda s: s.score).name,
        "divergence": divergence,
        "divergence_warning": divergence_warning,
    }

    return USMarketGateResult(gate=gate, score=avg_score, reasons=reasons,
                              sectors=sectors, metrics=metrics)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    session = None
    try:
        from curl_cffi import requests as curl_requests
        session = curl_requests.Session(impersonate="chrome")
    except ImportError:
        pass

    result = run_market_gate(session=session)

    print(f"\n{'=' * 55}")
    print(f"  시장 게이트: {result.gate} (점수: {result.score})")
    print(f"{'=' * 55}")
    for r in result.reasons:
        print(f"  {r}")

    print(f"\n  {'섹터':<15} {'티커':>5} {'점수':>6} {'신호':<8} {'RSI':>6} {'RS':>8} {'1D':>7}")
    print(f"  {'-' * 55}")
    for s in sorted(result.sectors, key=lambda x: x.score, reverse=True):
        print(f"  {s.name:<15} {s.ticker:>5} {s.score:>6.1f} {s.signal:<8} {s.rsi:>6.1f} {s.rs_vs_spy:>+8.4f} {s.change_1d:>+6.2f}%")
