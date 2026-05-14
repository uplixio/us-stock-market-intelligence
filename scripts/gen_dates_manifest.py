"""
gen_dates_manifest.py — reports/ 폴더 스캔 → dates_manifest.json 생성
파이프라인 후 또는 독립 실행 가능
"""
import os
import json
import re
from datetime import datetime

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "../frontend/public/data/reports")
OUT = os.path.join(os.path.dirname(__file__), "../frontend/public/data/dates_manifest.json")


def main():
    dates = []
    for f in sorted(os.listdir(REPORTS_DIR)):
        m = re.search(r"daily_report_(\d{4})(\d{2})(\d{2})\.json", f)
        if m:
            dates.append(f"{m.group(1)}-{m.group(2)}-{m.group(3)}")

    manifest = {
        "dates": dates,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(dates),
    }
    with open(OUT, "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, indent=2)
    print(f"✓ {len(dates)}개 날짜 → {OUT}")
    if dates:
        print(f"  범위: {dates[0]} ~ {dates[-1]}")


if __name__ == "__main__":
    main()
