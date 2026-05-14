"""S&P 500 Smart Money 스크리닝 실행"""
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    import pandas as pd
    from analyzers.smart_money_screener_v2 import EnhancedSmartMoneyScreener

    start = datetime.now()
    print()
    print("=" * 70)
    print("  S&P 500 Smart Money 스크리닝")
    print(f"  시작: {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # 1. 전체 종목 volume 데이터 준비
    print("\n[1/4] 종목 리스트 준비...")
    sp500_path = Path("sp500_list.csv")
    if not sp500_path.exists():
        sp500_path = Path("data/sp500_list.csv")
    if not sp500_path.exists():
        print("  sp500_list.csv 없음. run_all.py를 먼저 실행하세요.")
        return

    sp500 = pd.read_csv(sp500_path)
    Path("output").mkdir(exist_ok=True)
    print(f"  {len(sp500)}개 종목 준비 완료 (Volume은 실시간 계산)")

    # 2. 스크리너 초기화 + 실행
    print("\n[2/4] 스크리닝 시작...")
    screener = EnhancedSmartMoneyScreener(data_dir="output")

    if not screener.load_data():
        print("  데이터 로드 실패")
        return

    tickers = screener.volume_df["ticker"].tolist()
    total = len(tickers)
    results = []
    t0 = time.time()

    for i, ticker in enumerate(tickers):
        try:
            score = screener.calculate_composite_score(ticker)
            results.append({
                "종목": score["ticker"],
                "전략 셋업": score["grade_label"],
                "점수": score["composite_score"],
                "등급": score["grade"],
                "SD": score["scores"]["volume"],
                "Tech": score["scores"]["technical"],
                "Fund": score["scores"]["fundamental"],
                "RS vs SPY": score["rs_vs_spy"],
            })
        except Exception:
            pass

        # 진행 상황 표시
        if (i + 1) % 50 == 0 or (i + 1) == total:
            elapsed = time.time() - t0
            pct = (i + 1) / total * 100
            eta = elapsed / (i + 1) * (total - i - 1)
            print(f"  [{i+1}/{total}] {pct:.0f}% 완료 ({elapsed:.0f}초 경과, 예상 잔여: {eta:.0f}초)")

    # 3. 결과 정리
    print("\n[3/4] 결과 정리...")
    today = datetime.now().strftime("%Y%m%d")
    df = pd.DataFrame(results).sort_values("점수", ascending=False)
    df.insert(0, "날짜", datetime.now().strftime("%Y-%m-%d"))
    top20 = df.head(20)

    result_dir = Path("result")
    result_dir.mkdir(exist_ok=True)
    out_path = result_dir / f"smart_money_picks_{today}.csv"
    df.to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"  전체 {len(df)}종목 → {out_path}")

    # 4. 파이널 결과 출력
    elapsed_total = (datetime.now() - start).total_seconds()
    print(f"\n[4/4] 파이널 결과")
    print()
    print("=" * 85)
    print(f"  S&P 500 Smart Money Picks — Top 20 ({datetime.now().strftime('%Y-%m-%d')})")
    print("=" * 85)
    print(f"  {'순위':>4}  {'종목':>6}  {'전략 셋업':<25} {'점수':>5} {'등급':>4}  {'SD':>5} {'Tech':>5} {'Fund':>5} {'RS':>8}")
    print(f"  {'-' * 80}")

    for rank, (_, row) in enumerate(top20.iterrows(), 1):
        print(f"  {rank:>4}  {row['종목']:>6}  {row['전략 셋업']:<25} {row['점수']:>5.1f}   {row['등급']:>2}  {row['SD']:>5.1f} {row['Tech']:>5} {row['Fund']:>5} {row['RS vs SPY']:>+7.1f}%")

    print(f"  {'-' * 80}")

    # 등급 분포
    grade_dist = df["등급"].value_counts().sort_index()
    dist_str = " | ".join(f"{g}: {c}개" for g, c in grade_dist.items())
    print(f"\n  등급 분포: {dist_str}")
    print(f"  총 스크리닝: {len(df)}종목 / 소요 시간: {elapsed_total:.1f}초")
    print("=" * 85)


if __name__ == "__main__":
    main()
