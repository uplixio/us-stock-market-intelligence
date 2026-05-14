"""종목 피처 빌더 — OHLCV + 기존 지표 → GBM 피처 (equity-factor-builder 구현).

사용:
    python -m ml.features.equity.build_equity_features
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
PRICES_CSV = REPO_ROOT / "ml" / "datasets" / "us_daily_prices_50tickers.csv"  # 50종목 × 251일
OUTPUT_DIR = REPO_ROOT / "ml" / "features" / "equity"


def build_features_per_ticker(df: pd.DataFrame) -> pd.DataFrame:
    """단일 종목의 OHLCV + 지표 → 40+ technical 피처.

    Args:
        df: Symbol, Date 정렬된 단일 종목 DataFrame

    Returns:
        Date 인덱스의 피처 DataFrame
    """
    df = df.sort_values("Date").reset_index(drop=True)
    f = pd.DataFrame(index=pd.Index(df["Date"].values, name="Date"))

    close = df["Close"]
    volume = df["Volume"]
    high = df["High"]
    low = df["Low"]

    # === Momentum (6) ===
    for n in [5, 20, 60]:
        f[f"mom_{n}d"] = close.pct_change(n).shift(1).values
    f["mom_accel"] = (close.pct_change(20) - close.pct_change(60)).shift(1).values
    f["mom_60d_vs_20d"] = (close.pct_change(60) - close.pct_change(20)).shift(1).values
    f["mom_positive_streak"] = (close.pct_change() > 0).rolling(20).sum().shift(1).values

    # === Mean Reversion (5) ===
    f["rsi_14"] = df["RSI"].shift(1).values
    f["rsi_divergence"] = (df["RSI"] - df["RSI"].rolling(20).mean()).shift(1).values
    f["bb_pct_b"] = ((close - df["BB_Lower"]) / (df["BB_Upper"] - df["BB_Lower"])).shift(1).values
    f["price_sma20_ratio"] = (close / df["SMA_20"]).shift(1).values
    f["price_sma200_ratio"] = (close / df["SMA_200"]).shift(1).values

    # === Volatility (6) ===
    f["atr_raw"] = df["ATR"].shift(1).values
    f["atr_pct"] = (df["ATR"] / close).shift(1).values
    f["realized_vol_20d"] = close.pct_change().rolling(20).std().shift(1).values
    f["realized_vol_60d"] = close.pct_change().rolling(60).std().shift(1).values
    f["vol_ratio_20_60"] = (close.pct_change().rolling(20).std()
                             / close.pct_change().rolling(60).std()).shift(1).values
    f["downside_vol_20d"] = close.pct_change().clip(upper=0).rolling(20).std().shift(1).values

    # === Volume (5) ===
    vol_mean_60 = volume.rolling(60).mean()
    vol_std_60 = volume.rolling(60).std()
    f["vol_zscore_60d"] = ((volume - vol_mean_60) / vol_std_60).shift(1).values
    f["vol_change_5d"] = volume.pct_change(5).shift(1).values
    f["dollar_vol"] = (close * volume).shift(1).values
    f["dollar_vol_ratio_20d"] = ((close * volume) / (close * volume).rolling(20).mean()).shift(1).values
    obv = (np.sign(close.diff()) * volume).cumsum()
    f["obv_slope_20d"] = (obv.diff(20) / volume.rolling(20).mean()).shift(1).values

    # === Trend (5) ===
    f["sma20_sma50_spread"] = ((df["SMA_20"] - df["SMA_50"]) / df["SMA_50"]).shift(1).values
    f["sma50_sma200_spread"] = ((df["SMA_50"] - df["SMA_200"]) / df["SMA_200"]).shift(1).values
    f["price_above_sma50"] = (close > df["SMA_50"]).astype(int).shift(1).values
    f["price_above_sma200"] = (close > df["SMA_200"]).astype(int).shift(1).values
    f["trend_strength"] = ((close - df["SMA_50"]) / df["ATR"]).shift(1).values

    # === Price Range (3) ===
    f["range_20d_pct"] = ((high.rolling(20).max() - low.rolling(20).min())
                           / close).shift(1).values
    f["high_52w_ratio"] = (close / high.rolling(252).max()).shift(1).values
    f["low_52w_ratio"] = (close / low.rolling(252).min()).shift(1).values

    return f


def add_cross_sectional_ranks(all_features: pd.DataFrame) -> pd.DataFrame:
    """같은 날짜 내 종목 cross-sectional rank 추가.

    Args:
        all_features: MultiIndex [date, symbol]의 피처 DataFrame
    """
    rank_cols = ["mom_20d", "rsi_14", "realized_vol_20d", "dollar_vol",
                 "price_sma200_ratio", "trend_strength"]

    for col in rank_cols:
        if col in all_features.columns:
            all_features[f"{col}_xs_rank"] = (
                all_features.groupby(level="date")[col]
                .rank(pct=True, method="average")
            )
    return all_features


def build_targets(df: pd.DataFrame, horizons: list[int] = [5, 20, 60]) -> pd.DataFrame:
    """forward return 타겟 생성 (multi-task).

    Args:
        df: Symbol, Date 정렬된 단일 종목
    """
    df = df.sort_values("Date").reset_index(drop=True)
    close = df["Close"]

    targets = pd.DataFrame(index=pd.Index(df["Date"].values, name="Date"))
    for h in horizons:
        # T → T+h 수익률, numpy array 할당으로 index 정렬 문제 회피
        fwd = (close.shift(-h) / close - 1).values
        targets[f"fwd_{h}d_return"] = fwd
    return targets


def build_equity_features(
    prices_csv: Path = PRICES_CSV,
    output_dir: Path = OUTPUT_DIR,
) -> pd.DataFrame:
    """503 종목 (또는 가용 종목) × 시계열 → 35+ 피처 + 3 타겟."""
    logger.info("prices 로드: %s", prices_csv)
    df = pd.read_csv(prices_csv, parse_dates=["Date"])
    logger.info("원본: %d 행, %d 종목, 기간 %s ~ %s",
                len(df), df["Symbol"].nunique(), df["Date"].min(), df["Date"].max())

    all_features = []
    all_targets = []

    for symbol, group in df.groupby("Symbol"):
        feats = build_features_per_ticker(group)
        feats["symbol"] = symbol
        targets = build_targets(group)
        targets["symbol"] = symbol

        all_features.append(feats)
        all_targets.append(targets)

    features = pd.concat(all_features, axis=0)
    targets = pd.concat(all_targets, axis=0)

    # MultiIndex [date, symbol]
    features = features.reset_index().set_index(["Date", "symbol"])
    features.index.names = ["date", "symbol"]
    targets = targets.reset_index().set_index(["Date", "symbol"])
    targets.index.names = ["date", "symbol"]

    # Cross-sectional ranks
    features = add_cross_sectional_ranks(features)

    # Target: cross-sectional rank of fwd_20d_return
    targets["fwd_20d_rank"] = targets.groupby(level="date")["fwd_20d_return"].rank(pct=True)
    targets["fwd_5d_rank"] = targets.groupby(level="date")["fwd_5d_return"].rank(pct=True)

    logger.info("features: %d rows × %d cols", features.shape[0], features.shape[1])
    logger.info("targets: %d rows × %d cols", targets.shape[0], targets.shape[1])

    # Join features + targets
    merged = features.join(targets, how="inner")

    # 저장
    output_dir.mkdir(parents=True, exist_ok=True)
    today = pd.Timestamp.today().strftime("%Y%m%d")
    path = output_dir / f"equity_features_{today}.parquet"
    merged.to_parquet(path, engine="pyarrow", compression="snappy")
    logger.info("saved: %s (%d 피처 + %d 타겟)", path, features.shape[1], targets.shape[1])

    return merged


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    merged = build_equity_features()
    n_targets = sum(1 for c in merged.columns if c.startswith("fwd_"))
    n_features = merged.shape[1] - n_targets
    print(f"✅ {n_features} 피처 + {n_targets} 타겟, {merged.shape[0]:,} 행 (date × symbol)")
    print(f"   NaN 비율: {merged.isna().mean().mean() * 100:.1f}%")


if __name__ == "__main__":
    main()
