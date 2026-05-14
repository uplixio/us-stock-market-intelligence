"""US Stock Market Analysis - 전체 파이프라인 실행"""
import logging
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    start = datetime.now()
    logger.info("=" * 60)
    logger.info("  US Stock Market Analysis — 전체 파이프라인")
    logger.info("  시작: %s", start.strftime("%Y-%m-%d %H:%M:%S"))
    logger.info("=" * 60)

    # ========== Part 1: 데이터 수집 ==========
    logger.info("\n[Part 1] 데이터 수집")
    from pipeline.us_data_pipeline import USDataPipeline
    pipeline = USDataPipeline()
    pipeline.run_full_collection(top_n=10, period="6mo", output_dir="data")
    logger.info("[Part 1] 완료")

    # ========== Part 2: 시장 체제 감지 ==========
    logger.info("\n[Part 2] 시장 체제 감지")
    from analyzers.market_regime import MarketRegimeDetector
    detector = MarketRegimeDetector()
    regime = detector.detect()
    detector.save_result(regime)
    detector.save_config(regime)
    logger.info("  체제: %s (점수: %.3f, 신뢰도: %.1f%%)",
                regime["final_regime"], regime["weighted_score"], regime["confidence"])

    # ========== Part 2: 시장 게이트 ==========
    logger.info("\n[Part 2] 시장 게이트")
    from analyzers.market_gate import run_market_gate
    session = detector.yf_session
    gate = run_market_gate(session=session)
    logger.info("  게이트: %s (점수: %.1f)", gate.gate, gate.score)

    # ========== Part 3: Smart Money 스크리닝 ==========
    logger.info("\n[Part 3] Smart Money 스크리닝")
    from analyzers.smart_money_screener_v2 import EnhancedSmartMoneyScreener
    screener = EnhancedSmartMoneyScreener(data_dir="output")
    result = screener.run_screening()
    if result is not None:
        screener.validate_results()

    # ========== 종합 리포트 ==========
    elapsed = (datetime.now() - start).total_seconds()
    params = detector.ADAPTIVE_PARAMS[regime["final_regime"]]

    print(f"\n{'=' * 60}")
    print(f"  종합 리포트 ({datetime.now().strftime('%Y-%m-%d')})")
    print(f"{'=' * 60}")
    print(f"  시장 체제: {regime['final_regime'].upper()} (점수: {regime['weighted_score']})")
    print(f"  시장 게이트: {gate.gate} (점수: {gate.score})")
    print(f"  적응형 파라미터: stop_loss={params['stop_loss']:.0%}, mdd={params['max_drawdown_warning']:.0%}")
    print(f"\n  개별 신호:")
    for k, v in regime["signals"].items():
        print(f"    {k}: {v}")

    if result is not None and len(result) > 0:
        print(f"\n  Smart Money Top 5:")
        for _, row in result.head(5).iterrows():
            print(f"    {row['ticker']:6} {row['company_name']:<25} {row['composite_score']:.1f}점 [{row['grade']}]")

    print(f"\n  총 소요 시간: {elapsed:.1f}초")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
