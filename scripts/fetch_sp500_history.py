#!/usr/bin/env python3
"""
S&P 500 전종목 OHLCV 역사 데이터 배치 다운로드.

백테스팅용 Parquet 저장 (long format: date, ticker, Open, High, Low, Close, Volume).
yf.download() 내부 멀티스레딩 활용 — 배치당 100종목, 배치 간 3초 대기.

Usage:
    # 전체 (lead가 병렬 실행 시)
    .venv/bin/python3 scripts/fetch_sp500_history.py \
        --start 20250101 --end 20260417 \
        --tickers-start 0 --tickers-end 100 \
        --output data/sp500_history/batch_0_100.parquet

    # 단독 전체 실행
    .venv/bin/python3 scripts/fetch_sp500_history.py --start 20250101 --end 20260417
"""
import argparse
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent


def parse_args():
    today = date.today().strftime("%Y%m%d")
    p = argparse.ArgumentParser(description="S&P 500 OHLCV 역사 데이터 다운로드")
    p.add_argument("--start", default="20250101", help="시작일 YYYYMMDD")
    p.add_argument("--end", default=today, help="종료일 YYYYMMDD")
    p.add_argument("--tickers-file", default=str(ROOT / "data" / "sp500_list.csv"))
    p.add_argument("--tickers-start", type=int, default=0, help="종목 인덱스 시작 (포함)")
    p.add_argument("--tickers-end", type=int, default=-1, help="종목 인덱스 끝 (미포함, -1=전체)")
    p.add_argument("--output", default="", help="출력 parquet 경로 (기본: data/sp500_history/batch_N_M.parquet)")
    p.add_argument("--batch-size", type=int, default=100, help="yf.download() 호출당 종목 수")
    p.add_argument("--pause", type=float, default=3.0, help="배치 간 대기 시간(초)")
    return p.parse_args()


def fmt_date(d: str) -> str:
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}"


def download_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """yf.download()로 배치 다운로드 → long format DataFrame 반환."""
    df = yf.download(
        tickers=tickers,
        start=start,
        end=end,
        group_by="ticker",
        auto_adjust=True,
        threads=True,
        progress=False,
    )

    if df.empty:
        return pd.DataFrame()

    rows = []
    if isinstance(df.columns, pd.MultiIndex):
        available = df.columns.get_level_values(0).unique().tolist()
        for ticker in tickers:
            if ticker not in available:
                continue
            tdf = df[ticker].dropna(how="all").copy()
            tdf["ticker"] = ticker
            rows.append(tdf)
    else:
        # 단일 종목
        df["ticker"] = tickers[0]
        rows.append(df)

    if not rows:
        return pd.DataFrame()

    combined = pd.concat(rows)
    combined.index.name = "date"
    combined.reset_index(inplace=True)
    # 컬럼 통일
    combined.columns = [c.lower() for c in combined.columns]
    return combined


def main():
    args = parse_args()

    start_str = fmt_date(args.start)
    end_str = fmt_date(args.end)

    # 종목 목록 로드
    sp500 = pd.read_csv(args.tickers_file)
    all_tickers = sp500["Symbol"].tolist()

    end_idx = args.tickers_end if args.tickers_end > 0 else len(all_tickers)
    tickers = all_tickers[args.tickers_start:end_idx]

    print(f"[S&P 500 History Downloader]")
    print(f"  종목: {args.tickers_start}~{end_idx} ({len(tickers)}개)")
    print(f"  기간: {start_str} ~ {end_str}")

    # 출력 경로
    output_path = args.output
    if not output_path:
        out_dir = ROOT / "data" / "sp500_history"
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(out_dir / f"batch_{args.tickers_start}_{end_idx}.parquet")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # 배치 다운로드
    all_data: list[pd.DataFrame] = []
    batch_size = args.batch_size
    n_batches = (len(tickers) + batch_size - 1) // batch_size

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        batch_num = i // batch_size + 1
        print(f"  배치 {batch_num}/{n_batches}: {batch[0]}~{batch[-1]} ({len(batch)}개) 다운로드 중...")

        result = download_batch(batch, start_str, end_str)
        if result.empty:
            print(f"    [WARN] 배치 {batch_num} 데이터 없음 — 건너뜀")
        else:
            all_data.append(result)
            print(f"    ✓ {len(result):,}행 수집")

        if i + batch_size < len(tickers):
            time.sleep(args.pause)

    if not all_data:
        print("[ERROR] 수집된 데이터 없음")
        sys.exit(1)

    final = pd.concat(all_data, ignore_index=True)
    final["date"] = pd.to_datetime(final["date"])
    final.sort_values(["ticker", "date"], inplace=True)
    final.to_parquet(output_path, index=False)

    print(f"\n✓ 저장 완료: {output_path}")
    print(f"  행 수: {len(final):,}")
    print(f"  종목 수: {final['ticker'].nunique()}")
    print(f"  기간: {final['date'].min().date()} ~ {final['date'].max().date()}")


if __name__ == "__main__":
    main()
