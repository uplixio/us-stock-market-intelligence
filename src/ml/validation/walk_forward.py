"""Walk-forward validation + PBO/DSR (walk-forward-validator 구현).

사용:
    python -m ml.validation.walk_forward
"""
from __future__ import annotations

import json
import logging
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm, spearmanr

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
EQUITY_DIR = REPO_ROOT / "ml" / "features" / "equity"
VALIDATION_DIR = REPO_ROOT / "ml" / "validation"

SEED = 42


def make_walk_forward_folds(
    dates: pd.DatetimeIndex,
    train_dates: int = 90,
    test_dates: int = 20,
    embargo_dates: int = 10,
    step_dates: int = 20,
) -> list[dict]:
    """Walk-forward folds 생성 (소규모 데이터셋 맞춤).

    Returns:
        [{"train_idx": slice, "test_idx": slice, "train_period": ..., "test_period": ...}, ...]
    """
    folds = []
    n = len(dates)
    start = 0
    fold_id = 0

    while start + train_dates + embargo_dates + test_dates <= n:
        train_end = start + train_dates
        test_start = train_end + embargo_dates
        test_end = test_start + test_dates

        folds.append({
            "fold_id": fold_id,
            "train_start_idx": start,
            "train_end_idx": train_end,
            "test_start_idx": test_start,
            "test_end_idx": test_end,
            "train_start": str(dates[start].date()),
            "train_end": str(dates[train_end - 1].date()),
            "test_start": str(dates[test_start].date()),
            "test_end": str(dates[test_end - 1].date()),
        })
        start += step_dates
        fold_id += 1

    return folds


def train_fold(
    X_train: pd.DataFrame, y_train: pd.Series,
    X_test: pd.DataFrame, y_test: pd.Series,
    params: dict,
) -> tuple[float, float, "lgb.Booster"]:
    """단일 fold 학습 + test Rank IC 측정."""
    import lightgbm as lgb

    train_set = lgb.Dataset(X_train, y_train)
    model = lgb.train(
        params, train_set,
        num_boost_round=200,
        valid_sets=[train_set],
        valid_names=["train"],
        callbacks=[lgb.log_evaluation(0)],
    )
    preds = model.predict(X_test)

    # Daily Rank IC
    eval_df = pd.DataFrame({"pred": preds, "y": y_test.values}, index=X_test.index)
    daily_ic = eval_df.groupby(level="date").apply(
        lambda g: spearmanr(g["pred"], g["y"]).correlation if len(g) >= 5 and g["pred"].std() > 0 else np.nan
    ).dropna()

    mean_ic = float(daily_ic.mean())
    # Sharpe 근사: 평균 IC / IC std (IR)
    sharpe = float(daily_ic.mean() / daily_ic.std()) if daily_ic.std() > 0 else 0.0
    return mean_ic, sharpe, model


def probability_of_backtest_overfitting(sharpe_matrix: np.ndarray) -> float:
    """López de Prado PBO.

    Args:
        sharpe_matrix: shape (n_trials, n_folds)

    Returns:
        PBO: 0 = no overfitting, 1 = full overfitting
    """
    n_trials, n_folds = sharpe_matrix.shape
    if n_folds < 2 or n_trials < 2:
        return np.nan

    n_subsets = n_folds // 2
    combos = list(combinations(range(n_folds), n_subsets))

    logits = []
    for fold_subset in combos:
        complement = [i for i in range(n_folds) if i not in fold_subset]
        is_perf = sharpe_matrix[:, fold_subset].mean(axis=1)
        best_strat = int(np.argmax(is_perf))

        oos_perf = sharpe_matrix[:, complement].mean(axis=1)
        # best_strat의 OOS 순위 (rank in ascending order)
        oos_rank = (oos_perf < oos_perf[best_strat]).sum() / n_trials
        oos_rank = np.clip(oos_rank, 1e-4, 1 - 1e-4)
        logits.append(np.log(oos_rank / (1 - oos_rank)))

    return float((np.array(logits) < 0).mean())


def deflated_sharpe_ratio(
    observed_sharpe: float, n_trials: int, skewness: float, kurtosis: float, T: int,
) -> float:
    """Deflated Sharpe Ratio."""
    if n_trials <= 1 or T <= 1:
        return np.nan
    euler = 0.5772156649
    e_max = (1 - euler) * norm.ppf(1 - 1 / n_trials) + euler * norm.ppf(1 - 1 / (n_trials * np.e))
    denom = np.sqrt(1 - skewness * observed_sharpe + (kurtosis - 1) / 4 * observed_sharpe**2)
    if denom <= 0:
        return np.nan
    z = (observed_sharpe - e_max) * np.sqrt(T - 1) / denom
    return float(norm.cdf(z))


def run_walk_forward(
    target: str = "fwd_20d_rank",
    n_hp_trials: int = 8,
) -> dict:
    """Walk-forward 전체 실행."""
    from ml.pipeline.train import (
        DEFAULT_LGBM_PARAMS, TARGET_COLUMNS, load_latest_equity_features
    )

    df = load_latest_equity_features()
    feature_cols = [c for c in df.columns if c not in TARGET_COLUMNS]
    df = df[feature_cols + [target]].dropna(subset=[target])
    df = df.sort_index(level="date")

    # embargo
    max_date = df.index.get_level_values("date").max()
    df = df[df.index.get_level_values("date") <= max_date - pd.Timedelta(days=25)]

    dates = df.index.get_level_values("date").unique().sort_values()
    logger.info("데이터 기간: %s ~ %s (%d dates)", dates[0].date(), dates[-1].date(), len(dates))

    # Walk-forward folds
    folds = make_walk_forward_folds(dates, train_dates=90, test_dates=20, embargo_dates=10, step_dates=20)
    logger.info("Walk-forward folds: %d", len(folds))

    if len(folds) < 2:
        logger.warning("folds 부족 (<2), PBO 계산 불가")

    # HP 변형 (PBO용 n_trials)
    hp_variants = [
        {**DEFAULT_LGBM_PARAMS},
        {**DEFAULT_LGBM_PARAMS, "learning_rate": 0.03},
        {**DEFAULT_LGBM_PARAMS, "learning_rate": 0.08},
        {**DEFAULT_LGBM_PARAMS, "num_leaves": 15},
        {**DEFAULT_LGBM_PARAMS, "num_leaves": 63},
        {**DEFAULT_LGBM_PARAMS, "max_depth": 4},
        {**DEFAULT_LGBM_PARAMS, "max_depth": 8},
        {**DEFAULT_LGBM_PARAMS, "feature_fraction": 0.6},
    ][:n_hp_trials]

    # Sharpe matrix (n_trials x n_folds)
    sharpe_matrix = np.zeros((len(hp_variants), len(folds)))
    ic_matrix = np.zeros((len(hp_variants), len(folds)))
    fold_results = []

    for t, params in enumerate(hp_variants):
        for f, fold in enumerate(folds):
            train_dates_slice = dates[fold["train_start_idx"]:fold["train_end_idx"]]
            test_dates_slice = dates[fold["test_start_idx"]:fold["test_end_idx"]]

            train_mask = df.index.get_level_values("date").isin(train_dates_slice)
            test_mask = df.index.get_level_values("date").isin(test_dates_slice)

            X_train = df.loc[train_mask, feature_cols]
            y_train = df.loc[train_mask, target]
            X_test = df.loc[test_mask, feature_cols]
            y_test = df.loc[test_mask, target]

            if len(X_test) < 10 or len(X_train) < 50:
                continue

            mean_ic, sharpe, _ = train_fold(X_train, y_train, X_test, y_test, params)
            sharpe_matrix[t, f] = sharpe
            ic_matrix[t, f] = mean_ic

            if t == 0:  # baseline 모델 fold별 기록
                fold_results.append({
                    **fold,
                    "rank_ic": round(mean_ic, 4),
                    "ic_ir": round(sharpe, 3),
                    "n_train": len(X_train),
                    "n_test": len(X_test),
                })

    # Aggregate metrics (baseline 모델 기준)
    baseline_ics = ic_matrix[0]
    baseline_sharpes = sharpe_matrix[0]
    baseline_sharpes_clean = baseline_sharpes[baseline_sharpes != 0]

    summary = {
        "n_folds": len(folds),
        "n_hp_trials": len(hp_variants),
        "oos_sharpe_median": float(np.median(baseline_sharpes_clean)) if len(baseline_sharpes_clean) > 0 else 0,
        "oos_sharpe_mean": float(np.mean(baseline_sharpes_clean)) if len(baseline_sharpes_clean) > 0 else 0,
        "oos_sharpe_std": float(np.std(baseline_sharpes_clean)) if len(baseline_sharpes_clean) > 0 else 0,
        "rank_ic_mean": float(baseline_ics.mean()),
        "rank_ic_ir": float(baseline_ics.mean() / baseline_ics.std()) if baseline_ics.std() > 0 else 0,
        "pbo": probability_of_backtest_overfitting(sharpe_matrix),
        "dsr": deflated_sharpe_ratio(
            observed_sharpe=float(np.mean(baseline_sharpes_clean)) if len(baseline_sharpes_clean) > 0 else 0,
            n_trials=len(hp_variants),
            skewness=float(pd.Series(baseline_sharpes_clean).skew()) if len(baseline_sharpes_clean) > 2 else 0,
            kurtosis=float(pd.Series(baseline_sharpes_clean).kurt()) if len(baseline_sharpes_clean) > 3 else 3,
            T=len(baseline_sharpes_clean),
        ),
    }

    # 승격 조건 평가
    gate = {
        "rank_ic_gte_0.05": summary["rank_ic_mean"] >= 0.05,
        "ic_ir_gte_0.5": summary["rank_ic_ir"] >= 0.5,
        "pbo_lte_0.5": (summary["pbo"] or 1) <= 0.5,
        "dsr_gte_0.95": (summary["dsr"] or 0) >= 0.95,
        "n_folds_gte_3": len(folds) >= 3,
    }
    verdict = "PASS" if all(gate.values()) else "FAIL"

    result = {
        "model_id": f"lgbm_{target}_{pd.Timestamp.today().strftime('%Y-%m-%d')}",
        "target": target,
        "summary": summary,
        "gate": gate,
        "verdict": verdict,
        "fold_results": fold_results,
    }

    # 저장
    VALIDATION_DIR.mkdir(parents=True, exist_ok=True)
    today = pd.Timestamp.today().strftime("%Y%m%d")
    path = VALIDATION_DIR / f"walk_forward_{target}_{today}.json"
    path.write_text(json.dumps(result, indent=2, default=str))
    logger.info("saved: %s", path)

    return result


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = run_walk_forward(target="fwd_20d_rank", n_hp_trials=8)

    s = result["summary"]
    g = result["gate"]

    print("\n" + "=" * 60)
    print(f"  Walk-Forward Validation: {result['model_id']}")
    print("=" * 60)
    print(f"  n_folds: {s['n_folds']}, n_hp_trials: {s['n_hp_trials']}")
    print(f"  Rank IC mean   : {s['rank_ic_mean']:+.4f}  {'✅' if g['rank_ic_gte_0.05'] else '❌'} (>= 0.05)")
    print(f"  Rank IC IR     : {s['rank_ic_ir']:+.3f}    {'✅' if g['ic_ir_gte_0.5'] else '❌'} (>= 0.5)")
    print(f"  OOS IR median  : {s['oos_sharpe_median']:+.3f}")
    print(f"  OOS IR std     : {s['oos_sharpe_std']:.3f}")
    print(f"  PBO            : {s['pbo']:.3f}      {'✅' if g['pbo_lte_0.5'] else '❌'} (<= 0.5)")
    print(f"  DSR            : {s['dsr']:.3f}      {'✅' if g['dsr_gte_0.95'] else '❌'} (>= 0.95)")
    print("=" * 60)
    print(f"  VERDICT: {result['verdict']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
