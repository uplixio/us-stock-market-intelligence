"""S&P 500 전 종목 가격 데이터 병렬 수집 (ThreadPoolExecutor)."""
import logging
import os
import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import pandas as pd

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from collectors.us_price_fetcher import USPriceFetcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MAX_WORKERS = 10
MAX_RETRIES = 3


def fetch_with_retry(fetcher: USPriceFetcher, symbol: str, output_dir: str, period: str = "1y"):
    """단일 종목 수집 with exponential backoff retry."""
    csv_path = Path(output_dir) / f"{symbol}.csv"
    if csv_path.exists():
        return symbol, "skip", None

    for attempt in range(MAX_RETRIES):
        try:
            df = fetcher.fetch_ohlcv(symbol, period=period)
            if not df.empty:
                df.to_csv(csv_path)
                return symbol, "success", None
            # empty DataFrame — 짧은 대기 후 재시도
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt + random.uniform(0, 0.5))
        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                wait = 2 ** attempt + random.uniform(0, 1)
                logger.debug("%s 실패 (시도 %d/%d), %.1fs 후 재시도: %s", symbol, attempt + 1, MAX_RETRIES, wait, e)
                time.sleep(wait)
            else:
                return symbol, "fail", str(e)

    return symbol, "fail", "max_retries"


def fetch_all(sp500_path: str = "sp500_list.csv", output_dir: str = "sp500_prices", period: str = "1y"):
    sp500 = pd.read_csv(sp500_path)
    symbols = sp500["Symbol"].tolist()
    logger.info("수집 대상: %d개 종목 (workers=%d)", len(symbols), MAX_WORKERS)

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    fetcher = USPriceFetcher()

    success, fail, skip = 0, 0, 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_with_retry, fetcher, sym, output_dir, period): sym
            for sym in symbols
        }
        for i, future in enumerate(as_completed(futures), 1):
            sym = futures[future]
            try:
                _, status, err = future.result()
            except Exception as e:
                status, err = "fail", str(e)

            if status == "success":
                success += 1
            elif status == "skip":
                skip += 1
            else:
                fail += 1
                logger.warning("수집 실패: %s — %s", sym, err)

            if i % 50 == 0:
                logger.info("진행: %d/%d (성공: %d, 스킵: %d, 실패: %d)", i, len(symbols), success, skip, fail)

    logger.info("수집 완료: 성공 %d, 스킵 %d, 실패 %d / 총 %d", success, skip, fail, len(symbols))
    return {"success": success, "skip": skip, "fail": fail, "total": len(symbols)}


if __name__ == "__main__":
    fetch_all()
