"""거시 피처 빌더 — FRED/VIX/Fear&Greed → GBM 피처 (macro-feature-engineer 구현).

사용:
    python -m ml.features.macro.build_macro_features
"""
from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
MACRO_CSV = REPO_ROOT / "data" / "us_macro.csv"
OUTPUT_DIR = REPO_ROOT / "ml" / "features" / "macro"


def z_score(series: pd.Series, window: int = 60) -> pd.Series:
    """shift(1) 후 rolling z-score. look-ahead 방지."""
    s = series.shift(1)
    mean = s.rolling(window, min_periods=max(5, window // 3)).mean()
    std = s.rolling(window, min_periods=max(5, window // 3)).std()
    return (s - mean) / std


def momentum(series: pd.Series, lookback: int) -> pd.Series:
    """변화율 (T-1 vs T-1-lookback)."""
    return series.shift(1).pct_change(lookback)


def build_macro_features(macro_csv: Path = MACRO_CSV) -> pd.DataFrame:
    """거시 지표 → 19개 GBM 피처 DataFrame.

    입력 us_macro.csv는 snapshot(1행)이므로 실제 학습에는 시계열 확장이 필요.
    본 MVP 구현은 피처 엔지니어링 로직을 증명하는 목적.
    """
    df = pd.read_csv(macro_csv)
    logger.info("macro data loaded: %d rows, cols=%s", len(df), list(df.columns))

    # VIX와 fear_greed는 stringified dict로 저장됨 → 정규식 파싱
    import re

    def extract_number(s: str, key: str) -> float | None:
        m = re.search(rf"'{key}':\s*(?:np\.float64\()?([\d.]+)", str(s))
        return float(m.group(1)) if m else None

    if "VIX" in df.columns:
        df["VIX"] = df["VIX"].apply(lambda x: extract_number(x, "value") if pd.notna(x) else None)
    if "fear_greed" in df.columns:
        df["fear_greed"] = df["fear_greed"].apply(lambda x: extract_number(x, "score") if pd.notna(x) else None)

    # MVP: 단일 snapshot을 시계열로 시뮬레이션 (실제 운영 시 축적된 시계열 사용)
    # 실제 구조 증명용
    features = pd.DataFrame(index=df.index)

    # Rates (Category A)
    features["fedfunds"] = df.get("FEDFUNDS", np.nan)
    features["dgs10"] = df.get("DGS10", np.nan)
    features["dgs2"] = df.get("DGS2", np.nan)
    features["yield_spread_10y_2y"] = df.get("yield_spread_10y_2y", np.nan)
    features["yield_curve_inverted"] = (features["yield_spread_10y_2y"] < 0).astype(int)

    # Volatility & Sentiment (Category B)
    features["vix_raw"] = df.get("VIX", np.nan)
    features["vix_regime_low"] = (features["vix_raw"] < 16).astype(int)
    features["vix_regime_mid"] = ((features["vix_raw"] >= 16) & (features["vix_raw"] < 22)).astype(int)
    features["vix_regime_high"] = (features["vix_raw"] >= 22).astype(int)
    features["fear_greed"] = df.get("fear_greed", np.nan)
    features["fear_greed_extreme_fear"] = (features["fear_greed"] < 25).astype(int)
    features["fear_greed_extreme_greed"] = (features["fear_greed"] > 75).astype(int)

    # Regime indicators (Category C - from current rule)
    regime_map = {"risk_on": 0, "neutral": 1, "risk_off": 2, "crisis": 3}
    features["regime_label"] = df.get("regime", "neutral").map(regime_map).fillna(1)
    features["regime_risk_on"] = (features["regime_label"] == 0).astype(int)
    features["regime_neutral"] = (features["regime_label"] == 1).astype(int)
    features["regime_risk_off"] = (features["regime_label"] == 2).astype(int)
    features["regime_crisis"] = (features["regime_label"] == 3).astype(int)

    # Composite stress indicator
    features["macro_stress"] = (
        features["vix_regime_high"] * 0.4
        + features["fear_greed_extreme_fear"] * 0.3
        + features["yield_curve_inverted"] * 0.3
    )

    logger.info("macro features: %d features × %d rows", features.shape[1], features.shape[0])
    return features


def save_features(features: pd.DataFrame, output_dir: Path = OUTPUT_DIR) -> Path:
    """parquet 저장."""
    output_dir.mkdir(parents=True, exist_ok=True)
    today = pd.Timestamp.today().strftime("%Y%m%d")
    path = output_dir / f"macro_features_{today}.parquet"
    features.to_parquet(path, engine="pyarrow", compression="snappy")
    logger.info("saved: %s", path)
    return path


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    features = build_macro_features()
    path = save_features(features)
    print(f"✅ {features.shape[1]} 피처, {features.shape[0]} 행 → {path.relative_to(REPO_ROOT)}")
    print(f"   피처 목록: {list(features.columns)}")


if __name__ == "__main__":
    main()
