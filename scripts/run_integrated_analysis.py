"""US Stock Market — 통합 분석 파이프라인
Phase 0: 데이터 수집 (incremental)
Phase 1: 시장 분석 (Market Timing) — regime + gate + ML predictor
Phase 2: 종목 선별 (Stock Selection) — volume + smart money screening
Phase 3: 종합 리포트 — verdict + action 매핑
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent  # project root
REPORTS_DIR = BASE_DIR / "output" / "reports"
LOGS_DIR = BASE_DIR / "logs"
OUTPUT_DIR = BASE_DIR / "output"
DATA_DIR = BASE_DIR / "data"
MARKET_TZ = ZoneInfo("America/New_York")


def setup_dirs():
    for d in [REPORTS_DIR, LOGS_DIR, OUTPUT_DIR, DATA_DIR]:
        d.mkdir(exist_ok=True)


def setup_file_logger(log_path: Path):
    """파일 로거 설정."""
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logging.getLogger().addHandler(fh)
    return fh


def current_us_market_datetime() -> datetime:
    """Return the US market calendar date/time.

    The app is usually run from Korea. During US after-hours this is already
    the next KST day, but the market report should still be dated by New York.
    """
    return datetime.now(MARKET_TZ).replace(tzinfo=None)


# ── Phase 0: 데이터 수집 ──────────────────────────────────────────

def phase0_data_collection() -> dict:
    """데이터 수집 — stale이면 incremental, 없으면 full collection."""
    logger.info("=" * 60)
    logger.info("[Phase 0] 데이터 수집")
    t0 = time.time()

    from pipeline.us_data_pipeline import USDataPipeline
    pipeline = USDataPipeline()

    result = {}
    if pipeline.is_data_stale(str(DATA_DIR)):
        # incremental 시도
        inc = pipeline.incremental_update(top_n=50, output_dir=str(DATA_DIR))
        if inc is None:
            # CSV 없으면 전체 수집
            result = pipeline.run_full_collection(top_n=10, period="1y", output_dir=str(DATA_DIR))
            result["method"] = "full"
        else:
            result = inc
            result["method"] = "incremental"
    else:
        logger.info("데이터가 최신 상태 — 수집 건너뜀")
        result = {"method": "skipped"}

    logger.info("[Phase 0] 완료 (%.1f초) — %s", time.time() - t0, result.get("method", ""))
    return result


# ── Phase 1: 시장 분석 (Market Timing) ────────────────────────────

def phase1_market_timing() -> dict:
    """시장 체제 + 게이트 + ML 지수 예측 → verdict 결정."""
    logger.info("=" * 60)
    logger.info("[Phase 1] 시장 분석 (Market Timing)")
    t0 = time.time()

    timing = {}

    # 1/3: Market Regime Detection
    try:
        from analyzers.market_regime import MarketRegimeDetector
        detector = MarketRegimeDetector()
        regime_result = detector.detect()
        detector.save_result(regime_result)
        detector.save_config(regime_result)
        timing["regime"] = regime_result["final_regime"]
        timing["regime_score"] = regime_result["weighted_score"]
        timing["regime_confidence"] = regime_result["confidence"]
        timing["signals"] = regime_result.get("signals", {})
        _ap = detector.ADAPTIVE_PARAMS.get(timing["regime"], detector.ADAPTIVE_PARAMS["neutral"])
        timing["adaptive_params"] = {
            "stop_loss": f"{_ap['stop_loss']:.0%}",
            "max_drawdown_warning": f"{_ap['max_drawdown_warning']:.0%}",
        }
        logger.info("  Regime: %s (score=%.2f, confidence=%.0f%%)",
                     timing["regime"], timing["regime_score"], timing["regime_confidence"])
    except Exception as e:
        logger.error("  Regime 감지 실패: %s", e)
        timing["regime"] = "neutral"
        timing["regime_score"] = 1.5
        timing["regime_confidence"] = 50
        timing["signals"] = {}
        timing["adaptive_params"] = {"stop_loss": "-8%", "max_drawdown_warning": "-10%"}

    # 2/3: Sector Gate Signal
    try:
        from analyzers.market_gate import run_market_gate
        gate_result = run_market_gate()
        timing["gate"] = gate_result.gate
        timing["gate_score"] = gate_result.score
        logger.info("  Gate: %s (score=%.0f)", timing["gate"], timing["gate_score"])
    except Exception as e:
        logger.error("  Gate 분석 실패: %s", e)
        timing["gate"] = "CAUTION"
        timing["gate_score"] = 50

    # 3/3: Index Predictor ML
    try:
        from us_market.index_predictor import IndexPredictor
        predictor = IndexPredictor(data_dir=".")
        idx_pred = predictor.predict_next_week()
        timing["ml_predictor"] = idx_pred.get("predictions", {})
        spy_pred = timing["ml_predictor"].get("spy", {})
        qqq_pred = timing["ml_predictor"].get("qqq", {})
        logger.info("  ML SPY: %s (%.1f%%), QQQ: %s (%.1f%%)",
                     spy_pred.get("direction", "N/A"), spy_pred.get("probability", 0) * 100,
                     qqq_pred.get("direction", "N/A"), qqq_pred.get("probability", 0) * 100)
    except Exception as e:
        logger.error("  ML 예측 실패: %s", e)
        timing["ml_predictor"] = {}

    # Verdict 판정
    regime = timing["regime"]
    gate = timing["gate"]
    spy_pred = timing.get("ml_predictor", {}).get("spy", {})
    spy_dir = spy_pred.get("direction", "")
    spy_accuracy = spy_pred.get("model_accuracy", 0.0)

    regime_ok = regime in ("risk_on", "neutral")
    gate_go = gate == "GO"
    # Only trust ML if accuracy >= 55% (random-level = ~52% currently)
    ml_bullish = spy_dir == "bullish" and spy_accuracy >= 0.55

    if regime in ("crisis", "risk_off") or gate == "STOP":
        verdict = "STOP"
    elif regime_ok and gate_go and ml_bullish:
        verdict = "GO"
    else:
        verdict = "CAUTION"

    timing["verdict"] = verdict
    logger.info("  Verdict: %s (regime=%s, gate=%s, ml=%s)", verdict, regime, gate, spy_dir)
    logger.info("[Phase 1] 완료 (%.1f초)", time.time() - t0)
    return timing


# ── Phase 2: 종목 선별 (Stock Selection) ──────────────────────────

def phase2_stock_selection(
    target_date: datetime | None = None,
    screening_limit: int | None = None,
) -> list[dict]:
    """Volume Analysis + Smart Money Screening."""
    logger.info("=" * 60)
    logger.info("[Phase 2] 종목 선별 (Stock Selection)")
    t0 = time.time()

    import pandas as pd

    # volume 데이터 준비
    sp500_path = DATA_DIR / "sp500_list.csv"
    if sp500_path.exists():
        sp500 = pd.read_csv(sp500_path)
        OUTPUT_DIR.mkdir(exist_ok=True)

    from analyzers.smart_money_screener_v2 import EnhancedSmartMoneyScreener
    screener = EnhancedSmartMoneyScreener(data_dir=str(OUTPUT_DIR))
    top20 = screener.run_screening(max_tickers=screening_limit)

    picks = []
    if top20 is not None:
        for _, row in top20.iterrows():
            picks.append(row.to_dict())
        logger.info("  선별 종목: %d개", len(picks))

        # 날짜별 CSV 저장
        result_dir = BASE_DIR / "result"
        result_dir.mkdir(exist_ok=True)
        ref = (target_date or datetime.now()).strftime("%Y%m%d")
        top20.to_csv(result_dir / f"smart_money_picks_{ref}.csv", index=False, encoding="utf-8-sig")

    logger.info("[Phase 2] 완료 (%.1f초)", time.time() - t0)
    return picks


# ── Phase 3: 종합 리포트 ──────────────────────────────────────────

def _assign_action(verdict: str, grade: str) -> str:
    """Verdict + Grade → Action 매핑."""
    if verdict == "GO":
        if grade in ("A", "B"):
            return "BUY"
        return "WATCH"
    elif verdict == "CAUTION":
        if grade == "A":
            return "SMALL BUY"
        return "WATCH"
    else:  # STOP
        return "HOLD"


def phase3_report(timing: dict, picks: list[dict], target_date: datetime | None = None) -> dict:
    """종합 리포트 생성 — daily_report_YYYYMMDD.json."""
    logger.info("=" * 60)
    logger.info("[Phase 3] 종합 리포트 생성")
    t0 = time.time()

    verdict = timing.get("verdict", "CAUTION")
    now = target_date or datetime.now()

    # Action 매핑
    for pick in picks:
        grade = pick.get("grade", "C")
        pick["action"] = _assign_action(verdict, grade)

    # 분포 계산
    grade_dist = {}
    strategy_dist = {}
    action_dist = {}
    for pick in picks:
        g = pick.get("grade", "?")
        grade_dist[g] = grade_dist.get(g, 0) + 1
        s = pick.get("strategy", "Unknown")
        strategy_dist[s] = strategy_dist.get(s, 0) + 1
        a = pick.get("action", "?")
        action_dist[a] = action_dist.get(a, 0) + 1

    report = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "data_date": now.strftime("%Y-%m-%d"),
        "market_timing": {
            "regime": timing.get("regime", "neutral"),
            "regime_score": timing.get("regime_score", 0),
            "regime_confidence": timing.get("regime_confidence", 0),
            "signals": timing.get("signals", {}),
            "gate": timing.get("gate", "CAUTION"),
            "gate_score": timing.get("gate_score", 0),
            "ml_predictor": timing.get("ml_predictor", {}),
            "adaptive_params": timing.get("adaptive_params", {}),
        },
        "verdict": verdict,
        "stock_picks": picks,
        "summary": {
            "total_screened": len(picks),
            "grade_distribution": grade_dist,
            "strategy_distribution": strategy_dist,
            "action_distribution": action_dist,
        },
    }

    today = now.strftime("%Y%m%d")

    # SQLite 저장 (primary — 프론트엔드는 /api/data/reports 통해 읽음)
    try:
        from db import data_store as _ds
        _conn = _ds.get_db()
        _ds.upsert_daily_report(_conn, now.strftime("%Y-%m-%d"), report)
        _conn.close()
        logger.info("  SQLite daily_report 저장: %s", now.strftime("%Y-%m-%d"))
    except Exception as _e:
        logger.warning("SQLite daily_report 쓰기 실패: %s", _e)

    # latest_report.json (risk_alert.py가 verdict 로드용으로 읽음)
    latest_path = REPORTS_DIR / "latest_report.json"
    with open(latest_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info("  최신 리포트: %s", latest_path)
    out_latest = OUTPUT_DIR / "latest_report.json"
    shutil.copy2(latest_path, out_latest)

    logger.info("[Phase 3] 완료 (%.1f초)", time.time() - t0)
    return report


# ── Phase 4: 리스크 알림 ─────────────────────────────────────────

def phase4_risk_alert(portfolio_value: float = 100_000) -> dict | None:
    """리스크 알림 생성 — stop-loss, VaR, 포지션 사이징."""
    logger.info("=" * 60)
    logger.info("[Phase 4] 리스크 알림")
    t0 = time.time()

    try:
        from us_market.risk_alert import RiskAlertSystem

        risk = RiskAlertSystem(data_dir=str(BASE_DIR))
        result = risk.generate_alerts(portfolio_value=portfolio_value)

        ps = result.get("portfolio_summary", {})
        alerts = result.get("alerts", [])
        critical = sum(1 for a in alerts if a["level"] == "CRITICAL")
        warning = sum(1 for a in alerts if a["level"] == "WARNING")

        print(f"\n  {'━' * 40}")
        print(f"  Phase 4: Risk Alert")
        print(f"  {'━' * 40}")
        print(f"  Regime: {result.get('regime', 'N/A')} | Verdict: {result.get('verdict', 'N/A')}")
        print(f"  CRITICAL: {critical}건 | WARNING: {warning}건")
        print(f"  투자 비중: {ps.get('invested_pct', 0):.0f}% | 현금: {ps.get('cash_pct', 100):.0f}%")
        print(f"  VaR(5일): ${ps.get('total_var_dollar', 0):,.0f} ({ps.get('risk_budget_status', 'N/A')})")

        # 텔레그램 메시지 생성 (전송은 별도)
        msg = risk.format_telegram_message()
        logger.debug("텔레그램 메시지:\n%s", msg)

        logger.info("[Phase 4] 완료 (%.1f초)", time.time() - t0)
        return result
    except Exception as e:
        logger.error("[Phase 4] 리스크 알림 실패: %s", e)
        return None


# ── 메인 ──────────────────────────────────────────────────────────

def run_integrated_analysis(
    target_date: datetime | None = None,
    skip_ai: bool = False,
    portfolio_value: float = 100_000,
    screening_limit: int | None = None,
) -> dict:
    """전체 통합 분석 실행.

    Args:
        target_date: 백필 날짜. None이면 오늘 날짜로 실행.
        skip_ai: AI 요약 스킵 여부 (현재 이 스크립트에선 no-op).
        portfolio_value: 포트폴리오 총 가치 (기본: $100,000).
    """
    setup_dirs()

    start = datetime.now()
    report_date = target_date or current_us_market_datetime()
    ref = report_date
    today = ref.strftime("%Y%m%d")
    log_path = LOGS_DIR / f"daily_run_{today}.log"
    fh = setup_file_logger(log_path)

    print()
    print("=" * 65)
    print("  US Stock Market — Integrated Analysis")
    print(f"  실행: {start.strftime('%Y-%m-%d %H:%M:%S')}", end="")
    if target_date:
        print(f"  (백필 날짜: {today})")
    else:
        print()
    print("=" * 65)

    try:
        # Phase 0: 데이터 수집 (백필 모드에서는 스킵)
        if target_date is None:
            data_result = phase0_data_collection()
        else:
            logger.info("[Phase 0] 백필 모드 — 데이터 수집 스킵 (날짜: %s)", today)
            data_result = {"method": "skipped (backfill)"}

        # Phase 1: 시장 분석
        timing = phase1_market_timing()

        # Phase 2: 종목 선별
        picks = phase2_stock_selection(target_date=report_date, screening_limit=screening_limit)

        # Phase 3: 종합 리포트
        report = phase3_report(timing, picks, target_date=report_date)

        # Phase 4: 리스크 알림
        risk_result = phase4_risk_alert(portfolio_value=portfolio_value)
        if risk_result:
            report["risk_alerts_summary"] = {
                "critical_count": sum(1 for a in risk_result.get("alerts", []) if a["level"] == "CRITICAL"),
                "warning_count": sum(1 for a in risk_result.get("alerts", []) if a["level"] == "WARNING"),
                "info_count": sum(1 for a in risk_result.get("alerts", []) if a["level"] == "INFO"),
                "risk_budget_status": risk_result.get("portfolio_summary", {}).get("risk_budget_status", "N/A"),
                "invested_pct": risk_result.get("portfolio_summary", {}).get("invested_pct", 0),
                "cash_pct": risk_result.get("portfolio_summary", {}).get("cash_pct", 100),
            }

        # 종합 요약
        elapsed = (datetime.now() - start).total_seconds()
        print(f"\n{'=' * 65}")
        print(f"  종합 요약")
        print(f"{'=' * 65}")
        print(f"  Verdict: {report['verdict']}")
        print(f"  Regime: {timing.get('regime', 'N/A').upper()} "
              f"(score={timing.get('regime_score', 0):.2f}, "
              f"confidence={timing.get('regime_confidence', 0):.0f}%)")
        print(f"  Gate: {timing.get('gate', 'N/A')} (score={timing.get('gate_score', 0):.0f})")

        spy_pred = timing.get("ml_predictor", {}).get("spy", {})
        qqq_pred = timing.get("ml_predictor", {}).get("qqq", {})
        if spy_pred:
            print(f"  ML SPY: {spy_pred.get('direction', 'N/A').upper()} "
                  f"({spy_pred.get('predicted_return', 0):+.2f}%, "
                  f"신뢰도 {spy_pred.get('confidence_pct', 0):.0f}%)")
        if qqq_pred:
            print(f"  ML QQQ: {qqq_pred.get('direction', 'N/A').upper()} "
                  f"({qqq_pred.get('predicted_return', 0):+.2f}%, "
                  f"신뢰도 {qqq_pred.get('confidence_pct', 0):.0f}%)")

        if picks:
            print(f"\n  Top Picks ({len(picks)}종목):")
            for i, p in enumerate(picks[:10], 1):
                print(f"    {i:>2}. {p.get('ticker', '?'):>6} — "
                      f"{p.get('composite_score', 0):.1f}점 [{p.get('grade', '?')}] "
                      f"{p.get('strategy', '')}/{p.get('setup', '')} → {p.get('action', '?')}")

        print(f"\n  리포트: SQLite data_daily_reports ({report_date.strftime('%Y-%m-%d')})")
        print(f"  로그: {log_path}")
        print(f"  총 소요 시간: {elapsed:.1f}초")
        print(f"{'=' * 65}")

        return report

    finally:
        logging.getLogger().removeHandler(fh)
        fh.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="US Stock 통합 분석")
    parser.add_argument("--date", help="백필 날짜 YYYYMMDD (미입력 시 오늘 날짜로 실행)")
    parser.add_argument("--skip-ai", action="store_true", help="AI 요약 스킵 (현재 no-op)")
    parser.add_argument("--portfolio-value", type=float, default=100000,
                        help="포트폴리오 총 가치 (기본: $100,000)")
    parser.add_argument("--screening-limit", type=int, default=None,
                        help="빠른 갱신용 스크리닝 종목 수 제한 (예: 80)")
    args = parser.parse_args()

    _target = None
    if args.date:
        _target = datetime.strptime(args.date, "%Y%m%d")

    run_integrated_analysis(
        target_date=_target,
        skip_ai=args.skip_ai,
        portfolio_value=args.portfolio_value,
        screening_limit=args.screening_limit,
    )
