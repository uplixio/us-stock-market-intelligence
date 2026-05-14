"""피처 스토어 (버저닝 / look-ahead 방지)

train.py, predict.py가 공통으로 사용하는 equity feature 로드 유틸.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

EQUITY_DIR = Path(__file__).resolve().parents[3] / "data" / "ml" / "features" / "equity"


def load_latest(data_dir: Path | None = None) -> pd.DataFrame:
    """최신 equity_features_*.parquet 로드."""
    d = data_dir or EQUITY_DIR
    files = sorted(d.glob("equity_features_*.parquet"))
    if not files:
        raise FileNotFoundError(f"No equity_features_*.parquet in {d}")
    df = pd.read_parquet(files[-1])
    logger.info("피처 로드: %s (%d rows)", files[-1].name, len(df))
    return df


def load_as_of(cutoff_date: str, data_dir: Path | None = None) -> pd.DataFrame:
    """cutoff_date(YYYYMMDD 또는 YYYY-MM-DD) 이하의 가장 최신 피처 파일 로드.

    look-ahead bias 방지: 미래 날짜 파일 제외.
    """
    d = data_dir or EQUITY_DIR
    cutoff = cutoff_date.replace("-", "")
    files = sorted(
        f for f in d.glob("equity_features_*.parquet")
        if f.stem.split("_")[-1] <= cutoff
    )
    if not files:
        raise FileNotFoundError(f"No features as of {cutoff_date} in {d}")
    df = pd.read_parquet(files[-1])
    logger.info("피처 로드 (as-of %s): %s (%d rows)", cutoff_date, files[-1].name, len(df))
    return df


def list_versions(data_dir: Path | None = None) -> list[str]:
    """저장된 피처 파일 버전 목록 반환."""
    d = data_dir or EQUITY_DIR
    return [f.stem.split("_")[-1] for f in sorted(d.glob("equity_features_*.parquet"))]
