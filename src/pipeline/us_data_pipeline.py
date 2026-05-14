from __future__ import annotations

import logging
import os
import time
from io import StringIO

import pandas as pd
import requests

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from collectors.us_price_fetcher import USPriceFetcher
from analyzers.technical_indicators import add_all_indicators
from collectors.macro_collector import MacroDataCollector
from analyzers.sector_analyzer import SectorAnalyzer

logger = logging.getLogger(__name__)


class USDataPipeline:
    def __init__(self):
        self.price_fetcher = USPriceFetcher()
        self.macro_collector = MacroDataCollector()
        self.sector_analyzer = SectorAnalyzer()

    def fetch_sp500_list(self) -> pd.DataFrame:
        url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        tables = pd.read_html(StringIO(resp.text))
        df = tables[0][["Symbol", "Security", "GICS Sector", "GICS Sub-Industry"]].copy()
        df["Symbol"] = df["Symbol"].str.replace(".", "-", regex=False)
        df.to_csv(os.path.join(self._output_dir, "sp500_list.csv"), index=False, encoding="utf-8-sig")
        logger.info("S&P 500 목록: %d개 종목 → sp500_list.csv", len(df))
        return df

    def validate_data(self, df: pd.DataFrame) -> dict:
        total = len(df)
        missing = {}
        for col in df.columns:
            rate = df[col].isna().sum() / total * 100
            if rate > 0:
                missing[col] = round(rate, 2)

        anomalies = 0
        if "Close" in df.columns:
            anomalies = int((df["Close"] <= 0).sum())

        result = {"total_rows": total, "missing_pct": missing, "close_anomalies": anomalies}
        if missing:
            logger.warning("결측치: %s", missing)
        if anomalies:
            logger.warning("이상치 (Close <= 0): %d건", anomalies)
        if not missing and not anomalies:
            logger.info("데이터 검증 통과 (결측치 0, 이상치 0)")
        return result

    def is_data_stale(self, output_dir: str = ".") -> bool:
        """us_daily_prices.parquet가 오늘 날짜인지 확인. 오늘이 아니면 stale."""
        from datetime import datetime
        parquet_path = os.path.join(output_dir, "us_daily_prices.parquet")
        if not os.path.exists(parquet_path):
            return True
        mtime = os.path.getmtime(parquet_path)
        file_date = datetime.fromtimestamp(mtime).date()
        return file_date < datetime.now().date()

    def incremental_update(self, top_n: int = 50, output_dir: str = ".") -> dict | None:
        """기존 Parquet의 마지막 날짜부터 오늘까지만 다운로드하여 append."""
        parquet_path = os.path.join(output_dir, "us_daily_prices.parquet")
        if not os.path.exists(parquet_path):
            logger.info("Parquet 파일 없음 — 전체 수집으로 전환")
            return None

        existing = pd.read_parquet(parquet_path)
        last_date = existing.index.get_level_values("Date").max()
        logger.info("기존 데이터 마지막 날짜: %s — 증분 업데이트 시작", last_date)

        # S&P 500 목록 로드
        sp500_path = os.path.join(output_dir, "sp500_list.csv")
        if not os.path.exists(sp500_path):
            logger.info("sp500_list.csv 없음 — 전체 수집으로 전환")
            return None

        sp500 = pd.read_csv(sp500_path)
        symbols = sp500["Symbol"].tolist()[:top_n]

        new_frames = []
        success = 0
        for i, symbol in enumerate(symbols):
            df = self.price_fetcher.fetch_ohlcv(symbol, period="5d")
            if not df.empty:
                df = add_all_indicators(df)
                df.index = df.index.tz_localize(None)
                df.index = df.index.strftime("%Y-%m-%d")
                df.index.name = "Date"
                df = df[df.index > last_date]
                if not df.empty:
                    df.insert(0, "Symbol", symbol)
                    new_frames.append(df)
                    success += 1
            if i < len(symbols) - 1:
                time.sleep(0.5)

        if not new_frames:
            logger.info("새로운 데이터 없음 — 업데이트 불필요")
            return {"updated": 0, "new_rows": 0}

        new_df = pd.concat(new_frames)
        new_df = new_df.set_index(["Symbol", new_df.index])
        new_df.index.names = ["Symbol", "Date"]

        float_cols = new_df.select_dtypes(include="float").columns
        new_df[float_cols] = new_df[float_cols].round(4)

        combined = pd.concat([existing, new_df])
        combined = combined[~combined.index.duplicated(keep="last")]
        combined.to_parquet(parquet_path)
        logger.info("증분 업데이트 완료: %d종목, %d행 추가", success, len(new_df))
        return {"updated": success, "new_rows": len(new_df)}

    def run_full_collection(self, top_n: int = 50, period: str = "1y", output_dir: str = ".") -> dict:
        self._output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

        # incremental update: 오늘 데이터가 이미 있으면 신선도 확인 후 건너뜀
        if not self.is_data_stale(output_dir):
            logger.info("데이터 신선함 — 가격 수집 건너뜀 (incremental mode)")
            return {"skipped": True, "reason": "data_fresh"}

        start = time.time()
        summary = {}

        # 1. S&P 500 목록
        logger.info("=" * 50)
        logger.info("[1/4] S&P 500 목록 수집")
        sp500 = self.fetch_sp500_list()
        symbols = sp500["Symbol"].tolist()[:top_n]
        summary["sp500_total"] = len(sp500)
        summary["target_count"] = len(symbols)

        # 2. OHLCV + 기술적 지표
        logger.info("=" * 50)
        logger.info("[2/4] 상위 50개 종목 OHLCV + 지표 수집")
        all_frames = []
        success = 0
        for i, symbol in enumerate(symbols):
            df = self.price_fetcher.fetch_ohlcv(symbol, period=period)
            if not df.empty:
                df = add_all_indicators(df)
                df.index = df.index.tz_localize(None)
                df.index = df.index.strftime("%Y-%m-%d")
                df.index.name = "Date"
                df.insert(0, "Symbol", symbol)
                all_frames.append(df)
                success += 1
            if i < len(symbols) - 1:
                time.sleep(1)
            if (i + 1) % 10 == 0:
                logger.info("  진행: %d/%d", i + 1, len(symbols))

        prices_df = pd.concat(all_frames)
        prices_df = prices_df.set_index(["Symbol", prices_df.index])
        prices_df.index.names = ["Symbol", "Date"]

        # float 소수점 4자리
        float_cols = prices_df.select_dtypes(include="float").columns
        prices_df[float_cols] = prices_df[float_cols].round(4)

        # 검증
        validation = self.validate_data(prices_df.reset_index())
        summary["validation"] = validation

        # 저장
        prices_df.to_parquet(os.path.join(output_dir, "us_daily_prices.parquet"))
        logger.info("가격 데이터: %d종목, %d행 → us_daily_prices.parquet", success, len(prices_df))
        summary["price_rows"] = len(prices_df)
        summary["price_success"] = success

        # 3. 매크로 데이터
        logger.info("=" * 50)
        logger.info("[3/4] 매크로 데이터 수집")
        macro = self.macro_collector.get_macro_summary()
        macro_df = pd.DataFrame([macro])
        macro_df.to_csv(os.path.join(output_dir, "us_macro.csv"), index=False, encoding="utf-8-sig")
        logger.info("매크로 데이터 → us_macro.csv")
        summary["macro"] = macro

        # 4. 섹터 데이터
        logger.info("=" * 50)
        logger.info("[4/4] 섹터 데이터 수집")
        self.sector_analyzer.fetch_all_sectors(period=period)
        sector_returns = self.sector_analyzer.calculate_returns()
        rotation = self.sector_analyzer.get_rotation_signal()

        sector_df = sector_returns.copy()
        for col in ["1D", "5D", "20D", "60D"]:
            sector_df[col] = (sector_df[col] * 100).round(2)
        sector_df.to_csv(os.path.join(output_dir, "us_sectors.csv"), encoding="utf-8-sig")
        logger.info("섹터 데이터 → us_sectors.csv")
        summary["rotation"] = rotation

        elapsed = time.time() - start
        summary["elapsed_sec"] = round(elapsed, 1)

        # 결과 요약
        logger.info("=" * 50)
        logger.info("수집 완료 (%.1f초)", elapsed)
        logger.info("  S&P 500: %d개 종목", summary["sp500_total"])
        logger.info("  가격 수집: %d/%d 성공, %d행", success, len(symbols), len(prices_df))
        logger.info("  매크로: VIX=%.2f (%s)", macro.get("VIX", {}).get("value", 0), macro.get("regime", "N/A"))
        logger.info("  섹터 로테이션: %s", rotation.get("signal", "N/A"))
        logger.info("  출력 파일: sp500_list.csv, us_daily_prices.parquet, us_macro.csv, us_sectors.csv")

        return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    pipeline = USDataPipeline()
    result = pipeline.run_full_collection()
