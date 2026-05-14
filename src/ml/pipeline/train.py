"""GBM 학습 엔트리포인트 — LightGBM rank objective (gbm-trainer 구현).

사용:
    python -m ml.pipeline.train
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

SEED = 42
REPO_ROOT = Path(__file__).resolve().parents[2]
EQUITY_DIR = REPO_ROOT / "ml" / "features" / "equity"
MODELS_DIR = REPO_ROOT / "ml" / "models"

TARGET_COLUMNS = ["fwd_5d_return", "fwd_20d_return", "fwd_60d_return",
                  "fwd_5d_rank", "fwd_20d_rank"]

DEFAULT_LGBM_PARAMS = {
    # target is percentile-normalized rank (0.0-1.0) so regression+rmse is appropriate
    "objective": "regression",
    "metric": "rmse",
    "learning_rate": 0.05,
    "num_leaves": 31,
    "max_depth": 6,
    "min_data_in_leaf": 20,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "lambda_l1": 0.1,
    "lambda_l2": 0.1,
    "verbose": -1,
    "seed": SEED,
    "deterministic": True,
    "force_col_wise": True,
}


def load_latest_equity_features() -> pd.DataFrame:
    """가장 최근 equity_features parquet 로드."""
    files = sorted(EQUITY_DIR.glob("equity_features_*.parquet"))
    assert files, f"equity features not found in {EQUITY_DIR}"
    path = files[-1]
    logger.info("로드: %s", path.name)
    return pd.read_parquet(path)


def prepare_training_data(
    df: pd.DataFrame,
    target: str = "fwd_20d_rank",
    label_horizon: int = 20,
) -> tuple[pd.DataFrame, pd.Series, np.ndarray, pd.DatetimeIndex]:
    """학습 데이터 준비.

    Returns:
        X: features (no target cols)
        y: target (integer rank for lgbm rank objective, 0=worst, 49=best)
        group: 각 date의 종목 수 (cross-section)
        dates: sorted unique dates
    """
    # 타겟 컬럼과 NaN 행 제거
    feature_cols = [c for c in df.columns if c not in TARGET_COLUMNS]
    df = df[feature_cols + [target]].dropna(subset=[target])

    # embargo: 마지막 label_horizon 일은 label이 실현되지 않음 → 제외
    max_date = df.index.get_level_values("date").max()
    cutoff = max_date - pd.Timedelta(days=label_horizon + 5)
    df = df[df.index.get_level_values("date") <= cutoff]

    # Date 정렬 필수
    df = df.sort_index(level="date")
    dates = df.index.get_level_values("date").unique().sort_values()

    X = df[feature_cols]
    y = df[target]

    # Normalize rank to continuous percentile [0, 1] for regression
    # fwd_20d_rank is 0 (worst) to N-1 (best) integer → convert to 0.0-1.0
    if target.endswith("_rank"):
        n_unique = y.nunique()
        if n_unique > 1:
            # 날짜별 cross-sectional percentile rank — 미래 정보 누출 없음
            if hasattr(y.index, "levels"):
                y = y.groupby(level="date").rank(pct=True)
            else:
                y = y.rank(pct=True)

    # Group: 각 date의 종목 수
    group = df.groupby(level="date").size().sort_index().values

    logger.info("학습 데이터: %d 샘플, %d 피처, %d 그룹(dates), 기간 %s ~ %s",
                len(X), X.shape[1], len(group), dates[0].date(), dates[-1].date())
    return X, y, group, dates


def time_series_split(
    group: np.ndarray,
    dates: pd.DatetimeIndex,
    test_ratio: float = 0.3,
    embargo_days: int = 20,
) -> tuple[slice, slice, dict]:
    """시계열 train/test split + embargo.

    Returns:
        train_idx: 학습 샘플 slice
        test_idx: 테스트 샘플 slice
        info: {train_start, train_end, test_start, test_end}
    """
    n_dates = len(group)
    n_test = int(n_dates * test_ratio)
    n_train_dates = n_dates - n_test

    # Embargo: train 마지막 부분 제거 (fwd_20d label leak 방지)
    embargo_date_count = min(embargo_days, n_train_dates // 4)
    n_train_dates -= embargo_date_count

    cum_group = np.cumsum(group)
    train_end_sample = cum_group[n_train_dates - 1] if n_train_dates > 0 else 0
    test_start_date_idx = n_train_dates + embargo_date_count

    test_start_sample = cum_group[test_start_date_idx - 1] if test_start_date_idx > 0 else 0
    test_end_sample = cum_group[-1]

    train_slice = slice(0, train_end_sample)
    test_slice = slice(test_start_sample, test_end_sample)

    train_group = group[:n_train_dates]
    test_group = group[test_start_date_idx:]

    info = {
        "train_dates": int(n_train_dates),
        "test_dates": int(len(test_group)),
        "train_start": str(dates[0].date()),
        "train_end": str(dates[n_train_dates - 1].date()),
        "embargo_days": embargo_date_count,
        "test_start": str(dates[test_start_date_idx].date()) if test_start_date_idx < len(dates) else None,
        "test_end": str(dates[-1].date()),
        "train_samples": int(train_end_sample),
        "test_samples": int(test_end_sample - test_start_sample),
    }
    return train_slice, test_slice, info, train_group, test_group


def train_lgbm_rank(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    group_train: np.ndarray = None,
    X_val: pd.DataFrame = None,
    y_val: pd.Series = None,
    group_val: np.ndarray = None,
    params: dict = None,
    num_boost_round: int = 500,
) -> lgb.Booster:
    """LightGBM regression 학습 (target은 cross-sectional percentile rank)."""
    params = {**DEFAULT_LGBM_PARAMS, **(params or {})}

    train_set = lgb.Dataset(X_train, y_train)
    val_sets = [train_set]
    val_names = ["train"]
    callbacks = [lgb.log_evaluation(100)]

    if X_val is not None:
        val_set = lgb.Dataset(X_val, y_val, reference=train_set)
        val_sets.append(val_set)
        val_names.append("val")
        callbacks.append(lgb.early_stopping(50))

    model = lgb.train(
        params,
        train_set,
        num_boost_round=num_boost_round,
        valid_sets=val_sets,
        valid_names=val_names,
        callbacks=callbacks,
    )
    return model


def evaluate_model(model: lgb.Booster, X: pd.DataFrame, y: pd.Series, dates: pd.DatetimeIndex) -> dict:
    """샘플 밖 성능 평가: Rank IC."""
    from scipy.stats import spearmanr

    preds = model.predict(X)
    eval_df = pd.DataFrame({"pred": preds, "y": y.values}, index=X.index)

    # 날짜별 Spearman rank correlation
    daily_ic = eval_df.groupby(level="date").apply(
        lambda g: spearmanr(g["pred"], g["y"]).correlation if len(g) >= 5 else np.nan
    )
    daily_ic = daily_ic.dropna()

    return {
        "rank_ic_mean": float(daily_ic.mean()),
        "rank_ic_std": float(daily_ic.std()),
        "rank_ic_ir": float(daily_ic.mean() / daily_ic.std()) if daily_ic.std() > 0 else 0,
        "n_dates": int(len(daily_ic)),
        "best_iter": model.best_iteration,
    }


def save_model(model: lgb.Booster, X_train: pd.DataFrame, target: str,
               split_info: dict, eval_train: dict, eval_test: dict) -> tuple[Path, Path]:
    """모델 + metadata 저장."""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    today = pd.Timestamp.today().strftime("%Y-%m-%d")
    model_path = MODELS_DIR / f"lgbm_{target}_{today}.pkl"
    joblib.dump(model, model_path)

    meta = {
        "algo": "lightgbm",
        "target": target,
        "trained_at": pd.Timestamp.now().isoformat(),
        "n_features": X_train.shape[1],
        "feature_list": list(X_train.columns),
        "params": DEFAULT_LGBM_PARAMS,
        "seed": SEED,
        "best_iteration": model.best_iteration,
        "split": split_info,
        "eval_train": eval_train,
        "eval_test": eval_test,
    }
    meta_path = model_path.with_suffix(".json")
    meta_path.write_text(json.dumps(meta, indent=2, default=str))
    logger.info("저장: %s + %s", model_path.name, meta_path.name)
    return model_path, meta_path


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    # 1. 로드
    df = load_latest_equity_features()

    # 2. 학습 데이터 준비
    X, y, group, dates = prepare_training_data(df, target="fwd_20d_rank", label_horizon=20)

    # 3. Train/Test split
    train_slice, test_slice, info, group_train, group_test = time_series_split(
        group, dates, test_ratio=0.3, embargo_days=20
    )
    X_train, y_train = X.iloc[train_slice], y.iloc[train_slice]
    X_test, y_test = X.iloc[test_slice], y.iloc[test_slice]

    logger.info("Train: %d 샘플, Test: %d 샘플", len(X_train), len(X_test))
    logger.info("Split info: %s", info)

    # 4. 학습
    model = train_lgbm_rank(
        X_train, y_train, group_train,
        X_test, y_test, group_test,
        num_boost_round=500,
    )

    # 5. 평가
    eval_train = evaluate_model(model, X_train, y_train, dates)
    eval_test = evaluate_model(model, X_test, y_test, dates)
    logger.info("Train Rank IC: %.4f (IR=%.3f)", eval_train["rank_ic_mean"], eval_train["rank_ic_ir"])
    logger.info("Test  Rank IC: %.4f (IR=%.3f)", eval_test["rank_ic_mean"], eval_test["rank_ic_ir"])

    # 6. 저장
    model_path, meta_path = save_model(model, X_train, "fwd_20d_rank", info, eval_train, eval_test)

    # 7. 피처 중요도 상위 10
    importance = pd.Series(model.feature_importance(importance_type="gain"),
                          index=X_train.columns).sort_values(ascending=False).head(10)
    print("\n=== Top 10 Feature Importance (gain) ===")
    for name, val in importance.items():
        print(f"  {name:30s}: {val:10.1f}")

    print(f"\n✅ 모델 저장 완료: {model_path.relative_to(REPO_ROOT)}")
    print(f"   Test Rank IC: {eval_test['rank_ic_mean']:+.4f} (IR={eval_test['rank_ic_ir']:+.3f})")


if __name__ == "__main__":
    main()
