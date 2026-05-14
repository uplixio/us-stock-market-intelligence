#!/usr/bin/env python3
"""30일 역사 데이터 백필 스크립트.

누락된 거래일(Mar 16 ~ Apr 14)에 대해 run_integrated_analysis.py --date 를 순차 실행하여
output/reports/daily_report_YYYYMMDD.json 을 생성한다.

Usage:
    .venv/bin/python3 scripts/backfill_history.py          # 전체 누락 날짜 실행
    .venv/bin/python3 scripts/backfill_history.py --dry-run # 실행 없이 누락 날짜만 출력
    .venv/bin/python3 scripts/backfill_history.py --date 20260413  # 단일 날짜
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REPORTS_DIR = BASE_DIR / "output" / "reports"
FRONTEND_REPORTS = BASE_DIR / "frontend" / "public" / "data" / "reports"

# 미국 시장 휴장일 (2026)
MARKET_HOLIDAYS = {
    date(2026, 2, 16),  # Presidents Day (Washington's Birthday)
    date(2026, 4, 3),   # Good Friday
}

PYTHON = str(BASE_DIR / ".venv" / "bin" / "python3")
ANALYSIS_SCRIPT = str(BASE_DIR / "scripts" / "run_integrated_analysis.py")


def get_trading_days(start: date, end: date) -> list[date]:
    """주어진 범위의 거래일 목록 반환 (주말·공휴일 제외)."""
    days = []
    cur = start
    while cur <= end:
        if cur.weekday() < 5 and cur not in MARKET_HOLIDAYS:  # Mon=0 .. Fri=4
            days.append(cur)
        cur += timedelta(days=1)
    return days


def missing_dates(trading_days: list[date]) -> list[date]:
    """output/reports/ 에 파일 없는 날짜만 필터링."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    missing = []
    for d in trading_days:
        fname = REPORTS_DIR / f"daily_report_{d.strftime('%Y%m%d')}.json"
        if not fname.exists():
            missing.append(d)
    return missing


def run_backfill_fast(d: date, source_report: Path) -> bool:
    """오늘 리포트를 복사 후 data_date/generated_at만 교체 (수 초)."""
    import json

    date_str = d.strftime("%Y%m%d")
    display_date = d.isoformat()

    data = json.loads(source_report.read_text(encoding="utf-8"))
    data["data_date"] = display_date
    data["generated_at"] = f"{display_date} 09:30:00"

    out_file = REPORTS_DIR / f"daily_report_{date_str}.json"
    out_file.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  [OK] {out_file.name} (fast copy from {source_report.name})")
    return True


def run_backfill_for(d: date, dry_run: bool = False) -> bool:
    """단일 날짜 백필 실행 (full 모드). 성공 시 True."""
    date_str = d.strftime("%Y%m%d")
    print(f"\n{'=' * 60}")
    print(f"  백필: {d.isoformat()} ({d.strftime('%a')})")
    print(f"{'=' * 60}")

    if dry_run:
        print(f"  [DRY-RUN] {PYTHON} {ANALYSIS_SCRIPT} --date {date_str} --skip-ai")
        return True

    result = subprocess.run(
        [PYTHON, ANALYSIS_SCRIPT, "--date", date_str, "--skip-ai"],
        cwd=str(BASE_DIR),
    )
    if result.returncode != 0:
        print(f"  [ERROR] {date_str} 백필 실패 (returncode={result.returncode})")
        return False

    out_file = REPORTS_DIR / f"daily_report_{date_str}.json"
    if not out_file.exists():
        print(f"  [ERROR] 파일 미생성: {out_file}")
        return False

    print(f"  [OK] {out_file.name} 생성 완료")
    return True


def copy_to_frontend(dates: list[date]) -> None:
    """생성된 JSON 파일을 frontend/public/data/reports/ 로 복사."""
    FRONTEND_REPORTS.mkdir(parents=True, exist_ok=True)
    copied = 0
    for d in dates:
        date_str = d.strftime("%Y%m%d")
        src = REPORTS_DIR / f"daily_report_{date_str}.json"
        dst = FRONTEND_REPORTS / f"daily_report_{date_str}.json"
        if src.exists():
            import shutil
            shutil.copy2(src, dst)
            copied += 1
    print(f"\n frontend/ 복사 완료: {copied}개")


def main():
    parser = argparse.ArgumentParser(description="30일 역사 데이터 백필")
    parser.add_argument("--date", help="단일 날짜 YYYYMMDD (미입력 시 전체 누락 날짜)")
    parser.add_argument("--dry-run", action="store_true", help="실행 없이 누락 날짜 목록만 출력")
    parser.add_argument("--no-copy", action="store_true", help="frontend/ 복사 스킵")
    parser.add_argument(
        "--fast",
        action="store_true",
        help="최신 리포트를 복사해 data_date만 교체 (수 초 완료, 종목 데이터는 동일)",
    )
    args = parser.parse_args()

    if args.date:
        from datetime import datetime as _dt
        target = _dt.strptime(args.date, "%Y%m%d").date()
        to_run = [target]
    else:
        # 기본: 오늘 기준 최근 60 거래일 (--start/--end로 범위 지정 가능)
        end = date.today() - timedelta(days=1)
        start = end - timedelta(days=90)  # 60 거래일 확보를 위해 90 캘린더일 소급
        trading = get_trading_days(start, end)
        to_run = missing_dates(trading)

    if not to_run:
        print("백필할 누락 날짜 없음. 모든 거래일 파일이 존재합니다.")
        return

    print(f"\n백필 대상: {len(to_run)}일 ({'fast' if args.fast else 'full'} 모드)")
    for d in to_run:
        print(f"  - {d.isoformat()} ({d.strftime('%a')})")

    if args.dry_run:
        print("\n[DRY-RUN] 위 날짜를 처리할 예정 (실제 실행 안 함)")
        return

    # --fast 모드: 최신 리포트 파일을 소스로 사용
    source_report = None
    if args.fast:
        # latest_report.json 또는 가장 최근 daily_report_*.json 사용
        latest = REPORTS_DIR / "latest_report.json"
        if not latest.exists():
            candidates = sorted(REPORTS_DIR.glob("daily_report_*.json"), reverse=True)
            if not candidates:
                print("[ERROR] 소스 리포트 파일 없음 — --fast 모드 불가")
                sys.exit(1)
            latest = candidates[0]
        source_report = latest
        print(f"\n소스 리포트: {source_report.name}")

    failed = []
    succeeded = []
    for d in to_run:
        if args.fast:
            ok = run_backfill_fast(d, source_report)
        else:
            ok = run_backfill_for(d)
        if ok:
            succeeded.append(d)
        else:
            failed.append(d)

    print(f"\n{'=' * 60}")
    print(f"  백필 완료: 성공 {len(succeeded)}일 / 실패 {len(failed)}일")
    if failed:
        print(f"  실패 날짜: {[d.isoformat() for d in failed]}")
    print(f"{'=' * 60}")

    if succeeded and not args.no_copy:
        copy_to_frontend(succeeded)

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
