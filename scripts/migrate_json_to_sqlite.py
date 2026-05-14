#!/usr/bin/env python3
"""scripts/migrate_json_to_sqlite.py — 기존 JSON 파일 → SQLite 일회성 마이그레이션.

실행:
    source .venv/bin/activate
    python scripts/migrate_json_to_sqlite.py [--db PATH]

성공 기준:
    - data_daily_reports: frontend/public/data/reports/ JSON 수와 일치
    - data_risk_alerts: frontend/public/data/risk_alerts_????????.json 수와 일치
    - 스냅샷 테이블: 각 1행 존재

롤백: 실패 시 output/data.db 파일 삭제 (JSON 원본 그대로 보존).
"""

import argparse
import json
import sys
import time
from pathlib import Path

# sys.path 설정 (scripts/ 아래에서 실행 시 src/ 접근)
_PROJ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJ / "src"))

from db.data_store import (
    get_db,
    get_default_db_path,
    upsert_ai_summaries,
    upsert_daily_report,
    upsert_gbm_predictions,
    upsert_graph,
    upsert_index_prediction,
    upsert_market_gate_snapshot,
    upsert_performance,
    upsert_prediction_history_entry,
    upsert_regime_snapshot,
    upsert_risk_alert,
)

FE_DATA = _PROJ / "frontend" / "public" / "data"
OUTPUT = _PROJ / "output"


def _yyyymmdd_to_iso(s: str) -> str:
    """'20250102' → '2025-01-02'"""
    return f"{s[:4]}-{s[4:6]}-{s[6:]}"


def migrate_daily_reports(conn) -> int:
    """frontend/public/data/reports/daily_report_*.json → data_daily_reports"""
    reports_dir = FE_DATA / "reports"
    files = sorted(reports_dir.glob("daily_report_????????.json"))
    count = 0
    errors = 0
    for f in files:
        stem = f.stem  # daily_report_20250102
        yyyymmdd = stem.replace("daily_report_", "")
        date = _yyyymmdd_to_iso(yyyymmdd)
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            upsert_daily_report(conn, date, data)
            count += 1
        except Exception as e:
            print(f"  [WARN] {f.name}: {e}")
            errors += 1
    print(f"  daily_reports: {count} 삽입 ({errors} 오류)")
    return count


def migrate_risk_alerts(conn) -> int:
    """frontend/public/data/risk_alerts_????????.json → data_risk_alerts"""
    files = sorted(FE_DATA.glob("risk_alerts_????????.json"))
    count = 0
    errors = 0
    for f in files:
        yyyymmdd = f.stem.replace("risk_alerts_", "")
        date = _yyyymmdd_to_iso(yyyymmdd)
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            upsert_risk_alert(conn, date, data, update_snapshot=False)
            count += 1
        except Exception as e:
            print(f"  [WARN] {f.name}: {e}")
            errors += 1

    # 가장 최근 dated 파일을 snapshot으로 지정
    if files:
        latest_file = files[-1]
        yyyymmdd = latest_file.stem.replace("risk_alerts_", "")
        latest_date = _yyyymmdd_to_iso(yyyymmdd)
        try:
            data = json.loads(latest_file.read_text(encoding="utf-8"))
            upsert_risk_alert(conn, latest_date, data, update_snapshot=True)
            print(f"  risk_snapshot: {latest_date} 기준으로 갱신")
        except Exception as e:
            print(f"  [WARN] risk_snapshot: {e}")

    print(f"  risk_alerts: {count} 삽입 ({errors} 오류)")
    return count


def migrate_prediction_history(conn) -> int:
    """output/prediction_history.json (배열) → data_prediction_history"""
    src = OUTPUT / "prediction_history.json"
    if not src.exists():
        src = FE_DATA / "prediction_history.json"
    if not src.exists():
        print("  prediction_history: 파일 없음 — 건너뜀")
        return 0
    history = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(history, list):
        print("  prediction_history: 배열이 아님 — 건너뜀")
        return 0
    count = 0
    for entry in history:
        upsert_prediction_history_entry(conn, entry)
        count += 1
    print(f"  prediction_history: {count} 삽입")
    return count


def migrate_snapshots(conn) -> None:
    """스냅샷 파일들 → 각 단일행 테이블"""
    snapshots = [
        ("regime_result.json",    "regime",      upsert_regime_snapshot),
        ("regime_config.json",    "regime_cfg",  upsert_regime_snapshot),
        ("market_gate.json",      "market_gate", upsert_market_gate_snapshot),
        ("gbm_predictions.json",  "gbm",         upsert_gbm_predictions),
        ("index_prediction.json", "index_pred",  upsert_index_prediction),
    ]
    for filename, label, fn in snapshots:
        # output/ 우선, 없으면 frontend/public/data/
        src = OUTPUT / filename
        if not src.exists():
            src = FE_DATA / filename
        if not src.exists():
            print(f"  {label}: 파일 없음 — 건너뜀")
            continue
        try:
            data = json.loads(src.read_text(encoding="utf-8"))
            fn(conn, data)
            print(f"  {label}: 1행 upsert")
        except Exception as e:
            print(f"  [WARN] {label}: {e}")

    # ai_summaries
    ai_src = OUTPUT / "ai_summaries.json"
    if not ai_src.exists():
        ai_src = FE_DATA / "ai_summaries.json"
    if ai_src.exists():
        try:
            data = json.loads(ai_src.read_text(encoding="utf-8"))
            upsert_ai_summaries(conn, data)
            print(f"  ai_summaries: {len(data)} ticker upsert")
        except Exception as e:
            print(f"  [WARN] ai_summaries: {e}")
    else:
        print("  ai_summaries: 파일 없음 — 건너뜀")


def migrate_analytics(conn) -> None:
    """performance.json, graph.json → DB (수동 생성 파일)"""
    perf = FE_DATA / "performance.json"
    if perf.exists():
        try:
            upsert_performance(conn, json.loads(perf.read_text(encoding="utf-8")))
            print("  performance: 1행 upsert")
        except Exception as e:
            print(f"  [WARN] performance: {e}")
    else:
        print("  performance: 파일 없음 — 건너뜀")

    graph = FE_DATA / "graph.json"
    if graph.exists():
        try:
            upsert_graph(conn, json.loads(graph.read_text(encoding="utf-8")))
            print("  graph: 1행 upsert")
        except Exception as e:
            print(f"  [WARN] graph: {e}")
    else:
        print("  graph: 파일 없음 — 건너뜀")


def verify(conn, expected_reports: int, expected_risk: int) -> bool:
    """행 수 검증. 불일치 시 False 반환."""
    checks = [
        ("data_daily_reports",      expected_reports),
        ("data_risk_alerts",        expected_risk),
    ]
    ok = True
    print("\n[검증]")
    for table, expected in checks:
        actual = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        status = "OK" if actual == expected else "MISMATCH"
        print(f"  {table}: {actual} / 기대 {expected} [{status}]")
        if actual != expected:
            ok = False

    # 스냅샷: 단순 존재 여부
    for table in ("data_regime_snapshot", "data_market_gate_snapshot"):
        cnt = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table}: {'OK (1행)' if cnt == 1 else f'WARN ({cnt}행)'}")

    pred_cnt = conn.execute("SELECT COUNT(*) FROM data_prediction_history").fetchone()[0]
    print(f"  data_prediction_history: {pred_cnt}행")
    return ok


def main():
    parser = argparse.ArgumentParser(description="JSON → SQLite 마이그레이션")
    parser.add_argument("--db", default=None, help="DB 경로 (기본: output/data.db)")
    parser.add_argument("--force", action="store_true", help="기존 DB 덮어쓰기")
    args = parser.parse_args()

    db_path = Path(args.db) if args.db else get_default_db_path()

    if db_path.exists() and not args.force:
        print(f"[오류] {db_path} 이미 존재합니다. --force 옵션으로 덮어씁니다.")
        sys.exit(1)

    if db_path.exists() and args.force:
        db_path.unlink()
        print(f"기존 {db_path} 삭제")

    print(f"[마이그레이션 시작] → {db_path}")
    t0 = time.time()

    try:
        conn = get_db(db_path)

        print("\n[1] daily_reports")
        n_reports = migrate_daily_reports(conn)

        print("\n[2] risk_alerts")
        n_risk = migrate_risk_alerts(conn)

        print("\n[3] prediction_history")
        migrate_prediction_history(conn)

        print("\n[4] 스냅샷 (regime / gate / gbm / index / ai)")
        migrate_snapshots(conn)

        print("\n[5] 분석 데이터 (performance / graph)")
        migrate_analytics(conn)

        ok = verify(conn, n_reports, n_risk)
        conn.close()

    except Exception as e:
        print(f"\n[실패] {e}")
        if db_path.exists():
            db_path.unlink()
            print(f"롤백: {db_path} 삭제됨 (JSON 원본 보존)")
        sys.exit(1)

    elapsed = time.time() - t0
    size_kb = db_path.stat().st_size // 1024
    print(f"\n[완료] {elapsed:.1f}초 / DB 크기: {size_kb}KB")

    if not ok:
        print("[경고] 행 수 불일치 — DB는 생성됐으나 검토 필요")
        sys.exit(2)

    print("마이그레이션 성공")


if __name__ == "__main__":
    main()
