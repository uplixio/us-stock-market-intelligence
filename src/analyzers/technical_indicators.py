import pandas as pd
import numpy as np


def add_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["SMA_20"] = df["Close"].rolling(20).mean()
    df["SMA_50"] = df["Close"].rolling(50).mean()
    df["SMA_200"] = df["Close"].rolling(200).mean()
    return df


def add_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    df = df.copy()
    delta = df["Close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    # Wilder's smoothing: first value is SMA, then EWM
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss
    df["RSI"] = 100 - (100 / (1 + rs))
    return df


def add_atr(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    df = df.copy()
    high = df["High"]
    low = df["Low"]
    prev_close = df["Close"].shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low - prev_close).abs(),
    ], axis=1).max(axis=1)

    df["ATR"] = tr.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    return df


def add_bollinger_bands(df: pd.DataFrame, period: int = 20, std_dev: int = 2) -> pd.DataFrame:
    df = df.copy()
    df["BB_Middle"] = df["Close"].rolling(period).mean()
    rolling_std = df["Close"].rolling(period).std()
    df["BB_Upper"] = df["BB_Middle"] + std_dev * rolling_std
    df["BB_Lower"] = df["BB_Middle"] - std_dev * rolling_std
    df["BB_Width"] = (df["BB_Upper"] - df["BB_Lower"]) / df["BB_Middle"]
    return df


def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = add_moving_averages(df)
    df = add_rsi(df)
    df = add_atr(df)
    df = add_bollinger_bands(df)
    return df


def calculate_anchored_vwap(df: pd.DataFrame, anchor_lookback: int = 252) -> pd.Series:
    """앵커드 VWAP — 52주 저점일부터 누적 VWAP 계산.

    Args:
        df: OHLCV DataFrame with columns Close, High, Low, Volume
        anchor_lookback: 앵커 탐색 윈도우 (기본 252일 = 1년)

    Returns:
        pd.Series — 앵커일부터의 AVWAP (앵커일 이전은 NaN)
    """
    if df.empty or "Low" not in df.columns or "Volume" not in df.columns:
        return pd.Series(dtype=float, index=df.index)

    close = df["Close"].dropna()
    low = df["Low"].dropna()
    volume = df["Volume"].dropna()

    if len(close) < 20:
        return pd.Series(dtype=float, index=df.index)

    # 52주 저점일 탐색
    lookback = min(anchor_lookback, len(low))
    anchor_idx = low.iloc[-lookback:].idxmin()

    # 앵커일 이후 누적 VWAP = sum(price * volume) / sum(volume)
    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3

    avwap = pd.Series(index=df.index, dtype=float)
    mask = df.index >= anchor_idx
    if mask.sum() < 1:
        return avwap

    tp_v = (typical_price[mask] * volume[mask]).cumsum()
    vol_cum = volume[mask].cumsum()
    avwap[mask] = tp_v / vol_cum

    return avwap.copy()


if __name__ == "__main__":
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from collectors.us_price_fetcher import USPriceFetcher
    import logging

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    fetcher = USPriceFetcher()
    df = fetcher.fetch_ohlcv("AAPL", period="1y")
    df = add_all_indicators(df)

    print(f"\n컬럼: {list(df.columns)}")
    print(f"\n최근 5일 지표:")
    print(df[["Close", "SMA_20", "RSI", "ATR", "BB_Upper", "BB_Lower", "BB_Width"]].tail().to_string())
