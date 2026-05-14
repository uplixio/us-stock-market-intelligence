"""GBM 추론 엔트리포인트 — 최신 모델로 Top N 종목 예측 (ml-pipeline-architect 구현).

사용:
    python -m ml.pipeline.predict
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
EQUITY_DIR = REPO_ROOT / "ml" / "features" / "equity"
MODELS_DIR = REPO_ROOT / "ml" / "models"
OUTPUT_DIR = REPO_ROOT / "output"


def load_latest_model(target: str = "fwd_20d_rank") -> tuple["lgb.Booster", dict]:
    """최신 모델 + metadata 로드."""
    files = sorted(MODELS_DIR.glob(f"lgbm_{target}_*.pkl"))
    if not files:
        raise FileNotFoundError(
            f"모델 파일 없음: {target} in {MODELS_DIR}. 먼저 학습을 실행하세요. "
            f"(python -m ml.pipeline.train)"
        )
    model_path = files[-1]
    meta_path = model_path.with_suffix(".json")

    model = joblib.load(model_path)
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    logger.info("모델 로드: %s (trained %s)", model_path.name, meta.get("trained_at", "?"))
    return model, meta


def load_latest_features() -> pd.DataFrame:
    """최신 equity features parquet 로드."""
    files = sorted(EQUITY_DIR.glob("equity_features_*.parquet"))
    if not files:
        raise FileNotFoundError(
            f"피처 파일 없음: {EQUITY_DIR}. 먼저 피처 빌드를 실행하세요. "
            f"(python -m ml.features.equity.build_equity_features)"
        )
    df = pd.read_parquet(files[-1])
    logger.info("피처 로드: %s (%d rows)", files[-1].name, len(df))
    return df


def predict_top_candidates(top_n: int = 20, target: str = "fwd_20d_rank") -> pd.DataFrame:
    """최신 피처 + 최신 모델 → Top N 종목 예측 저장.

    Returns:
        DataFrame: [ticker, gbm_score, rank]
    """
    model, meta = load_latest_model(target)
    df = load_latest_features()

    feature_list = meta.get("feature_list", [])
    target_cols = ["fwd_5d_return", "fwd_20d_return", "fwd_60d_return",
                   "fwd_5d_rank", "fwd_20d_rank"]
    feature_cols = [c for c in df.columns if c not in target_cols]

    # 예측용: 가장 최근 날짜의 모든 종목
    max_date = df.index.get_level_values("date").max()
    today_df = df[df.index.get_level_values("date") == max_date].copy()

    if today_df.empty:
        logger.error("예측용 데이터 없음 (max_date=%s)", max_date)
        return pd.DataFrame()

    logger.info("예측 대상: %s, %d 종목", max_date, len(today_df))

    # 피처 정합성 체크
    if feature_list:
        missing = [c for c in feature_list if c not in today_df.columns]
        if missing:
            logger.warning("누락 피처 %d개: %s", len(missing), missing[:5])
        feature_cols = [c for c in feature_list if c in today_df.columns]

    X = today_df[feature_cols]
    preds = model.predict(X)

    result = pd.DataFrame({
        "ticker": today_df.index.get_level_values("symbol"),
        "gbm_score": preds,
    })
    result["gbm_rank"] = result["gbm_score"].rank(ascending=False, method="first").astype(int)
    result = result.sort_values("gbm_rank").head(top_n).reset_index(drop=True)

    # 저장
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / "gbm_predictions.parquet"
    result.to_parquet(path, engine="pyarrow")
    csv_path = OUTPUT_DIR / "gbm_predictions.csv"
    result.to_csv(csv_path, index=False)
    logger.info("저장: %s", path)

    return result


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = predict_top_candidates(top_n=20)

    print("\n" + "=" * 60)
    print("  GBM Top 20 예측 (fwd_20d_rank)")
    print("=" * 60)
    print(f"  {'순위':>4}  {'티커':>6}  {'GBM score':>12}")
    print("  " + "-" * 40)
    for _, row in result.iterrows():
        print(f"  {row['gbm_rank']:>4}  {row['ticker']:>6}  {row['gbm_score']:>+12.4f}")
    print("=" * 60)
    print(f"  저장: output/gbm_predictions.{{parquet,csv}}")


if __name__ == "__main__":
    main()
