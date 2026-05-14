import argparse
import logging
from datetime import datetime

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.us_data_pipeline import USDataPipeline


def main():
    parser = argparse.ArgumentParser(description="US Stock Data Pipeline")
    parser.add_argument("--top-n", type=int, default=50, help="수집할 종목 수 (기본값: 50)")
    parser.add_argument("--period", type=str, default="1y", help="데이터 기간 (기본값: 1y)")
    parser.add_argument("--output-dir", type=str, default="./data", help="출력 디렉토리 (기본값: ./data)")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger(__name__)

    start_time = datetime.now()
    logger.info("파이프라인 시작: %s", start_time.strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("설정: top_n=%d, period=%s, output_dir=%s", args.top_n, args.period, args.output_dir)

    pipeline = USDataPipeline()
    result = pipeline.run_full_collection(top_n=args.top_n, period=args.period, output_dir=args.output_dir)

    end_time = datetime.now()
    elapsed = (end_time - start_time).total_seconds()

    logger.info("파이프라인 종료: %s", end_time.strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("총 소요 시간: %.1f초", elapsed)


if __name__ == "__main__":
    main()
