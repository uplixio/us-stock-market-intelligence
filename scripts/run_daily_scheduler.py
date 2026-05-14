"""US Stock Market — 일일 스케줄러
사용법:
  python run_daily_scheduler.py              # 1회 즉시 실행
  python run_daily_scheduler.py --status     # 마지막 실행 상태 확인
  python run_daily_scheduler.py --install-cron              # macOS cron 설치 (기본 06:00)
  python run_daily_scheduler.py --install-cron --time 07:00 # 시간 지정
"""
import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent  # scripts/ dir
ROOT = BASE_DIR.parent  # project root
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(BASE_DIR))  # for cross-script imports
REPORTS_DIR = ROOT / "output" / "reports"
LOGS_DIR = ROOT / "logs"


def run_once():
    """run_integrated_analysis.py 1회 실행."""
    from run_integrated_analysis import run_integrated_analysis
    return run_integrated_analysis()


def show_status():
    """마지막 실행 상태 표시."""
    latest = REPORTS_DIR / "latest_report.json"
    if not latest.exists():
        print("아직 실행된 기록이 없습니다.")
        print(f"  python {Path(__file__).name} 으로 첫 실행을 해보세요.")
        return

    with open(latest, encoding="utf-8") as f:
        report = json.load(f)

    print(f"\n{'=' * 50}")
    print(f"  마지막 실행 상태")
    print(f"{'=' * 50}")
    print(f"  실행 시각: {report.get('generated_at', 'N/A')}")
    print(f"  데이터 날짜: {report.get('data_date', 'N/A')}")
    print(f"  Verdict: {report.get('verdict', 'N/A')}")

    timing = report.get("market_timing", {})
    print(f"  Regime: {timing.get('regime', 'N/A')} (score={timing.get('regime_score', 0):.2f})")
    print(f"  Gate: {timing.get('gate', 'N/A')} (score={timing.get('gate_score', 0):.0f})")

    summary = report.get("summary", {})
    print(f"  종목 수: {summary.get('total_screened', 0)}")
    print(f"  등급 분포: {summary.get('grade_distribution', {})}")
    print(f"  Action 분포: {summary.get('action_distribution', {})}")

    # 최근 로그 파일
    log_files = sorted(LOGS_DIR.glob("daily_run_*.log"), reverse=True)
    if log_files:
        print(f"  최근 로그: {log_files[0]}")

    print(f"{'=' * 50}\n")


def install_cron(time_str: str = "06:00"):
    """macOS crontab에 일일 실행 등록."""
    parts = time_str.split(":")
    if len(parts) != 2:
        print(f"시간 형식 오류: {time_str} (HH:MM 형식 사용)")
        sys.exit(1)

    hour, minute = parts[0], parts[1]
    python_path = sys.executable
    script_path = BASE_DIR / "run_integrated_analysis.py"

    cron_line = f"{minute} {hour} * * 1-5 cd {ROOT} && {python_path} {script_path} >> {LOGS_DIR}/cron_output.log 2>&1"

    # 기존 crontab 읽기
    try:
        result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
        existing = result.stdout if result.returncode == 0 else ""
    except FileNotFoundError:
        existing = ""

    # 이미 등록되어 있는지 확인
    marker = "run_integrated_analysis.py"
    lines = [l for l in existing.strip().split("\n") if l and marker not in l]
    lines.append(cron_line)

    new_crontab = "\n".join(lines) + "\n"

    proc = subprocess.run(["crontab", "-"], input=new_crontab, capture_output=True, text=True)
    if proc.returncode == 0:
        print(f"Cron 등록 완료!")
        print(f"  스케줄: 매일 {time_str} (월-금)")
        print(f"  명령: {cron_line}")
        print(f"\n  확인: crontab -l")
        print(f"  제거: crontab -e 에서 해당 줄 삭제")
    else:
        print(f"Cron 등록 실패: {proc.stderr}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="US Stock Market 일일 스케줄러")
    parser.add_argument("--status", action="store_true", help="마지막 실행 상태 확인")
    parser.add_argument("--install-cron", action="store_true", help="macOS cron 등록")
    parser.add_argument("--time", default="06:00", help="cron 실행 시간 (기본: 06:00)")

    args = parser.parse_args()

    if args.status:
        show_status()
    elif args.install_cron:
        install_cron(args.time)
    else:
        run_once()


if __name__ == "__main__":
    main()
