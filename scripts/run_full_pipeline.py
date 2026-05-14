"""US Stock Market — 전체 파이프라인 (데이터 수집 → 체제 감지 → 스크리닝 → AI 분석 → 최종 리포트)"""
import argparse
import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from pipeline.config import PipelineConfig

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def parse_args():
    parser = argparse.ArgumentParser(description="US Stock Full Pipeline")
    parser.add_argument("--steps", type=str, default=None,
                        help="실행할 단계 (예: --steps 4,5,6). 미지정 시 전체 실행")
    parser.add_argument("--dry-run", action="store_true",
                        help="실제 실행 없이 단계 목록만 출력")
    return parser.parse_args()


def timed(name):
    """단계별 소요 시간 측정 데코레이터"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            logger.info("=" * 60)
            logger.info("[%s] 시작", name)
            t0 = time.time()
            try:
                result = func(*args, **kwargs)
                elapsed = time.time() - t0
                logger.info("[%s] 완료 (%.1f초)", name, elapsed)
                return result
            except Exception as e:
                elapsed = time.time() - t0
                logger.error("[%s] 실패 (%.1f초): %s", name, elapsed, e)
                raise
        return wrapper
    return decorator


def _check_step(name, result):
    if result is None:
        logger.error("Step '%s' 실패 — 파이프라인 중단", name)
        sys.exit(1)
    return result


@timed("1. 데이터 수집")
def step_data_collection(cfg: PipelineConfig):
    from pipeline.us_data_pipeline import USDataPipeline
    pipeline = USDataPipeline()
    return pipeline.run_full_collection(top_n=cfg.top_n, period=cfg.period, output_dir=cfg.data_dir)


@timed("2. 시장 체제 감지")
def step_regime_detection():
    from analyzers.market_regime import MarketRegimeDetector
    detector = MarketRegimeDetector()
    result = detector.detect()
    detector.save_result(result)
    detector.save_config(result)
    return result


@timed("3. 시장 게이트")
def step_market_gate(session=None):
    from analyzers.market_gate import run_market_gate
    return run_market_gate(session=session)


@timed("9. 대시보드 JSON 내보내기")
def step_export_dashboard(gate=None, gbm_df=None):
    """Persist dashboard-facing JSONs (market_gate.json, gbm_predictions.json,
    enrich final_top10_report.json with company_name)."""
    from regen_dashboard_data import (
        save_market_gate_json,
        save_gbm_json,
        enrich_top10_with_company_names,
    )
    save_market_gate_json(gate=gate)
    save_gbm_json(gbm_df=gbm_df)
    enrich_top10_with_company_names()


@timed("4. 스마트머니 스크리닝")
def step_screening():
    from analyzers.smart_money_screener_v2 import EnhancedSmartMoneyScreener
    screener = EnhancedSmartMoneyScreener(data_dir="output")
    return screener.run_screening()


@timed("5. AI 분석")
def step_ai_analysis(cfg: PipelineConfig):
    import re
    import pandas as pd
    from analyzers.ai_summary_generator import NewsCollector, get_ai_provider

    csv_path = Path("output/smart_money_picks_v2.csv")
    if not csv_path.exists():
        logger.warning("스크리닝 결과 없음 — AI 분석 건너뜀")
        return None

    df = pd.read_csv(csv_path)
    col = "종목" if "종목" in df.columns else "ticker"
    tickers = df[col].head(cfg.ai_top_n).tolist()

    collector = NewsCollector()
    ai = get_ai_provider(cfg.ai_provider)

    # output/regime_config.json 로드
    regime_json_path = Path("output/regime_config.json")
    macro_context = None
    if regime_json_path.exists():
        try:
            with open(regime_json_path, encoding="utf-8") as f:
                macro_context = json.load(f)
        except Exception as e:
            logger.warning("regime_config.json 로드 실패: %s", e)

    def analyze_ticker(ticker_data):
        ticker, row_data = ticker_data
        news = collector.get_news_for_ticker(ticker)
        summary_str = ai.generate_summary(ticker, row_data, news, macro_context=macro_context)
        try:
            return ticker, json.loads(summary_str)
        except json.JSONDecodeError:
            m = re.search(r'"recommendation"\s*:\s*"([^"]+)"', summary_str)
            rec = m.group(1) if m else "N/A(parse-fail)"
            return ticker, {"raw": summary_str, "recommendation": rec}

    ticker_data_list = [
        (t, df[df[col] == t].iloc[0].to_dict() if not df[df[col] == t].empty else {})
        for t in tickers
    ]

    results = {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {executor.submit(analyze_ticker, td): td[0] for td in ticker_data_list}
        for i, future in enumerate(as_completed(futures)):
            ticker, result = future.result()
            results[ticker] = result
            logger.info("  [%d/%d] %s: %s", i + 1, len(tickers), ticker,
                        result.get("recommendation", "N/A"))

    out_path = Path("output/ai_summaries.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    return results


@timed("6. 최종 리포트")
def step_final_report():
    from analyzers.final_report_generator import FinalReportGenerator
    gen = FinalReportGenerator()
    return gen.generate_report()


@timed("7. GBM 예측 (ML)")
def step_gbm_inference(cfg: PipelineConfig):
    """LightGBM 기반 cross-sectional Top 예측 (ml-team 산출물)."""
    try:
        from ml.pipeline.predict import predict_top_candidates
        return predict_top_candidates(top_n=cfg.ml_top_n)
    except Exception as e:
        logger.warning("GBM 예측 실패 (모델 미학습 가능): %s", e)
        return None


@timed("8. 지수 방향 예측 (IndexPredictor ML)")
def step_index_prediction():
    """SPY/QQQ 5일 forward 방향 예측 (us_market/index_predictor.py 27 피처 GBM 재사용).

    2026-04-05 service-evolver cycle #2: 이미 존재하는 GBM 모듈을 파이프라인에 노출.
    """
    try:
        from us_market.index_predictor import IndexPredictor
        predictor = IndexPredictor(data_dir='.')
        return predictor.predict_next_week()
    except Exception as e:
        logger.warning("지수 예측 실패 (데이터/모델 부족 가능): %s", e)
        return None


def main():
    args = parse_args()

    # PipelineConfig 구성
    steps_list = None
    if args.steps:
        steps_list = [int(s.strip()) for s in args.steps.split(",")]
    cfg = PipelineConfig(steps=steps_list, dry_run=args.dry_run)

    if cfg.dry_run:
        all_steps = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        run_steps = [s for s in all_steps if cfg.should_run_step(s)]
        print(f"[dry-run] 실행 예정 단계: {run_steps}")
        return

    start = datetime.now()
    print()
    print("=" * 65)
    print("  US Stock Market Analysis — Full Pipeline")
    print(f"  {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    # 1. 데이터 수집
    if cfg.should_run_step(1):
        _check_step("1. 데이터 수집", step_data_collection(cfg))

    # 2. 시장 체제
    regime = None
    if cfg.should_run_step(2):
        regime = _check_step("2. 시장 체제 감지", step_regime_detection())

    # 3. 시장 게이트
    gate = None
    if cfg.should_run_step(3):
        gate = _check_step("3. 시장 게이트", step_market_gate())

    # 4. 스크리닝
    screening = None
    if cfg.should_run_step(4):
        screening = _check_step("4. 스마트머니 스크리닝", step_screening())

    # 5. AI 분석
    ai_results = None
    if cfg.should_run_step(5):
        ai_results = _check_step("5. AI 분석", step_ai_analysis(cfg))

    # 6. 최종 리포트
    top10 = None
    if cfg.should_run_step(6):
        top10 = _check_step("6. 최종 리포트", step_final_report())

    # 7. GBM 예측 (ML) — 실패해도 계속 진행
    gbm_top20 = None
    if cfg.should_run_step(7):
        gbm_top20 = step_gbm_inference(cfg)

    # 8. 지수 방향 예측 (SPY/QQQ) — 실패해도 계속 진행
    idx_pred = None
    if cfg.should_run_step(8):
        idx_pred = step_index_prediction()

    # 9. 대시보드 JSON 내보내기 — 실패해도 계속 진행
    if cfg.should_run_step(9):
        try:
            step_export_dashboard(gate=gate, gbm_df=gbm_top20)
        except Exception as e:
            logger.warning("대시보드 내보내기 실패 (계속 진행): %s", e)

    # 종합 요약
    elapsed = (datetime.now() - start).total_seconds()
    print(f"\n{'=' * 65}")
    print(f"  종합 요약")
    print(f"{'=' * 65}")

    if regime:
        params = {"risk_on": "-10%", "neutral": "-8%", "risk_off": "-5%", "crisis": "-3%"}
        print(f"  시장 체제: {regime['final_regime'].upper()} (점수: {regime['weighted_score']}, 신뢰도: {regime['confidence']}%)")
        print(f"  stop_loss: {params.get(regime['final_regime'], 'N/A')}")

    if gate:
        print(f"  시장 게이트: {gate.gate} (점수: {gate.score})")

    if screening is not None:
        print(f"  스크리닝: {len(screening)}종목 선별")

    if ai_results:
        print(f"  AI 분석: {len(ai_results)}종목 완료 (Gemini)")

    if top10:
        print(f"\n  Final Top 10:")
        for i, r in enumerate(top10, 1):
            print(f"    {i:>2}. {r['ticker']:>6} — 최종 {r['final_score']:.1f}점 [{r['grade']}] (AI: {r['ai_recommendation']})")

    if gbm_top20 is not None and not gbm_top20.empty:
        print(f"\n  GBM Top 10 (ML):")
        for _, r in gbm_top20.head(10).iterrows():
            print(f"    {r['gbm_rank']:>2}. {r['ticker']:>6} — GBM score {r['gbm_score']:+.4f}")

    if idx_pred and idx_pred.get("predictions"):
        print(f"\n  지수 5일 방향 예측 (IndexPredictor):")
        for ticker in ["spy", "qqq"]:
            p = idx_pred["predictions"].get(ticker, {})
            if p:
                print(f"    {ticker.upper()}: {p.get('direction', 'N/A').upper()} "
                      f"({p.get('predicted_return', 0):+.2f}%, "
                      f"신뢰도 {p.get('confidence_pct', 0):.0f}% / {p.get('confidence', '')})")

    print(f"\n  총 소요 시간: {elapsed:.1f}초")
    print(f"{'=' * 65}")

    # API 비용 요약
    from analyzers.ai_summary_generator import usage_tracker
    usage_tracker.print_summary()


if __name__ == "__main__":
    main()
