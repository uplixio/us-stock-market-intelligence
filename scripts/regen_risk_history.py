"""scripts/regen_risk_history.py

output/reports/daily_report_YYYYMMDD.json (20260217~) 를 읽어서
날짜별 risk_alerts_YYYYMMDD.json 을 생성한다.

사용법:
    python3 scripts/regen_risk_history.py            # 없는 날짜만 생성
    python3 scripts/regen_risk_history.py --force    # 모두 재생성
    python3 scripts/regen_risk_history.py --date 20260301  # 특정 날짜만
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# src 패키지 경로 추가
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from us_market.risk_alert import RiskAlertSystem  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

START_DATE = "20260217"


def load_sector_map() -> dict[str, str]:
    """data/sp500_list.csv → {ticker: sector}"""
    csv = ROOT / "data" / "sp500_list.csv"
    if not csv.exists():
        logger.warning("sp500_list.csv 없음 — sector 정보 생략")
        return {}
    import csv as csv_mod
    result = {}
    with open(csv, encoding="utf-8") as f:
        reader = csv_mod.DictReader(f)
        for row in reader:
            ticker = row.get("Symbol", row.get("symbol", "")).strip()
            sector = row.get("GICS Sector", row.get("sector", "Unknown")).strip()
            if ticker:
                result[ticker] = sector
    return result


def picks_from_report(report: dict, sector_map: dict[str, str]) -> list[dict]:
    """daily_report의 stock_picks → RiskAlertSystem이 소비할 picks 형태."""
    raw = report.get("stock_picks", [])
    picks = []
    for p in raw:
        ticker = p.get("ticker", "")
        if not ticker:
            continue
        picks.append({
            "ticker": ticker,
            "company_name": p.get("company_name", ""),
            "grade": p.get("grade", "C"),
            "sector": sector_map.get(ticker, p.get("sector", "Unknown")),
            # entry_price/peak_price/current_price 없음 → stop_loss 스킵됨
        })
    return picks


def regen_date(date_str: str, sector_map: dict, force: bool = False) -> bool:
    """단일 날짜 처리. 성공 시 True."""
    report_file = ROOT / "output" / "reports" / f"daily_report_{date_str}.json"
    if not report_file.exists():
        logger.debug("리포트 없음: %s", date_str)
        return False

    fe_data = ROOT / "frontend" / "public" / "data"
    out_fe = fe_data / f"risk_alerts_{date_str}.json"
    out_local = ROOT / "output" / f"risk_alerts_{date_str}.json"

    if not force and out_fe.exists():
        logger.debug("이미 존재, 스킵: %s", date_str)
        return False

    try:
        report = json.loads(report_file.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error("리포트 파싱 실패 %s: %s", date_str, e)
        return False

    picks = picks_from_report(report, sector_map)
    if not picks:
        logger.warning("picks 없음 — 스킵: %s", date_str)
        return False

    market_timing = report.get("market_timing", {})
    regime = market_timing.get("regime", "neutral")
    verdict = report.get("verdict", "CAUTION")

    ras = RiskAlertSystem()
    ras.regime_config = {"regime": regime}
    ras.verdict_data = {"verdict": verdict}

    try:
        ras.generate_alerts(
            picks_override=picks,
            output_date=date_str,
        )
        logger.info("생성 완료: %s (picks=%d, regime=%s, verdict=%s)",
                    date_str, len(picks), regime, verdict)
        return True
    except Exception as e:
        logger.error("generate_alerts 실패 %s: %s", date_str, e)
        return False


def update_manifest(fe_data: Path) -> None:
    """frontend/public/data/risk_dates_manifest.json 갱신."""
    existing = sorted(fe_data.glob("risk_alerts_????????.json"))
    dates = [f.stem.replace("risk_alerts_", "") for f in existing]
    dates = [d for d in dates if d >= START_DATE]
    manifest = {"dates": sorted(set(dates))}
    manifest_path = fe_data / "risk_dates_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    logger.info("risk_dates_manifest.json 갱신: %d개 날짜", len(manifest["dates"]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Risk 히스토리 재생성")
    parser.add_argument("--force", action="store_true", help="이미 존재해도 재생성")
    parser.add_argument("--date", help="특정 날짜만 처리 (YYYYMMDD)")
    args = parser.parse_args()

    sector_map = load_sector_map()
    fe_data = ROOT / "frontend" / "public" / "data"

    if args.date:
        dates = [args.date]
    else:
        reports_dir = ROOT / "output" / "reports"
        all_reports = sorted(reports_dir.glob("daily_report_????????.json"))
        dates = [
            f.stem.replace("daily_report_", "")
            for f in all_reports
            if f.stem.replace("daily_report_", "") >= START_DATE
        ]

    logger.info("처리할 날짜: %d개", len(dates))
    success = 0
    skipped = 0
    for d in dates:
        result = regen_date(d, sector_map, force=args.force)
        if result:
            success += 1
        else:
            skipped += 1

    logger.info("완료: 생성 %d개, 스킵 %d개", success, skipped)

    # 매니페스트 갱신
    update_manifest(fe_data)


if __name__ == "__main__":
    main()
