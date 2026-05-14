#!/usr/bin/env python3
"""Regenerate dashboard JSON files from current pipeline outputs + fresh market gate.

Produces three files for the dashboard:
  - output/market_gate.json        (11 sectors GO/CAUTION/STOP + SPY divergence)
  - output/gbm_predictions.json    (cross-sectional ML ranking, top 20)
  - output/final_top10_report.json (enriched in-place with company_name + sector)

Callable standalone, or import save_* functions from run_full_pipeline.py.
"""
from __future__ import annotations

import csv
import json
import logging
import sys
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "output"
DATA_DIR = ROOT / "data"


def _make_session():
    try:
        from curl_cffi import requests as curl_requests
        return curl_requests.Session(impersonate="chrome")
    except ImportError:
        return None


def _divergence_label(signal: str) -> str:
    return {
        "bullish_climax": "강세 클라이맥스 — 바닥에서 거래량 폭발 + 가격↓. 매수 신호.",
        "bearish_climax": "약세 클라이맥스 — 고점에서 거래량 폭발 + 가격↑. 매도 신호.",
        "bullish_div": "강세 다이버전스 — 가격↓ + 거래량↓. 매도 압력 약화.",
        "bearish_div": "약세 다이버전스 — 가격↑ + 거래량↓. 상승 동력 약화.",
        "volume_surge": "거래량 급증 — 가격↑ + 거래량↑. 강한 상승 추세.",
        "volume_decline_bear": "강한 매도 — 가격↓ + 거래량↑. 매도 압력 지속.",
        "normal": "특이 신호 없음",
        "none": "특이 신호 없음",
        "insufficient_data": "데이터 부족",
    }.get(signal, "unknown")


def _divergence_severity(signal: str) -> str:
    return {
        "bullish_climax": "opportunity",
        "bearish_climax": "warning",
        "bullish_div": "opportunity",
        "bearish_div": "warning",
        "volume_surge": "opportunity",
        "volume_decline_bear": "warning",
        "normal": "neutral",
        "none": "neutral",
        "insufficient_data": "neutral",
    }.get(signal, "neutral")


def save_market_gate_json(gate=None, session=None) -> Path:
    """Compute SPY divergence + persist gate result to output/market_gate.json.

    If ``gate`` is None, runs run_market_gate() fresh (network calls).
    """
    from analyzers.market_gate import (
        _fetch_history,
        detect_volume_price_divergence,
        run_market_gate,
    )

    session = session or _make_session()

    if gate is None:
        gate = run_market_gate(session=session)

    # SPY divergence (separate fetch — run_market_gate doesn't expose SPY data)
    spy_hist = _fetch_history("SPY", period="6mo", session=session)
    divergence = "none"
    spy_metrics: dict = {}
    if not spy_hist.empty:
        close = spy_hist["Close"]
        volume = spy_hist["Volume"]
        divergence = detect_volume_price_divergence(spy_hist)
        if len(close) >= 11 and len(volume) >= 20:
            vol_avg20 = float(volume.rolling(20).mean().iloc[-1])
            vol_recent_2d = float(volume.iloc[-2:].mean())
            spy_metrics = {
                "spy_price": round(float(close.iloc[-1]), 2),
                "change_10d_pct": round(float((close.iloc[-1] / close.iloc[-11] - 1) * 100), 2),
                "vol_ratio_2d_vs_20d_avg": round(vol_recent_2d / vol_avg20, 2) if vol_avg20 else None,
            }

    payload = {
        "gate": gate.gate,
        "score": gate.score,
        "reasons": gate.reasons,
        "metrics": gate.metrics,
        "sectors": [asdict(s) for s in gate.sectors],
        "spy_divergence": {
            "signal": divergence,
            "label": _divergence_label(divergence),
            "severity": _divergence_severity(divergence),
            **spy_metrics,
        },
    }

    out = OUTPUT_DIR / "market_gate.json"
    OUTPUT_DIR.mkdir(exist_ok=True)
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info("saved %s (gate=%s, sectors=%d, div=%s)", out, gate.gate, len(gate.sectors), divergence)
    try:
        from db import data_store as _ds
        _conn = _ds.get_db()
        _ds.upsert_market_gate_snapshot(_conn, payload)
        _conn.close()
    except Exception as _e:
        logger.warning("SQLite market_gate 쓰기 실패: %s", _e)
    return out


def save_gbm_json(gbm_df=None) -> Path | None:
    """Convert GBM predictions (CSV or dataframe) → output/gbm_predictions.json.

    If ``gbm_df`` is None, reads existing output/gbm_predictions.csv.
    """
    rows: list[dict] = []

    if gbm_df is not None:
        for _, r in gbm_df.iterrows():
            rows.append({
                "ticker": str(r["ticker"]),
                "gbm_score": round(float(r["gbm_score"]), 4),
                "gbm_rank": int(r["gbm_rank"]),
            })
    else:
        src = OUTPUT_DIR / "gbm_predictions.csv"
        if not src.exists():
            logger.warning("no gbm_predictions.csv found — skipping")
            return None
        with src.open() as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append({
                    "ticker": row["ticker"],
                    "gbm_score": round(float(row["gbm_score"]), 4),
                    "gbm_rank": int(row["gbm_rank"]),
                })

    # Enrich with company name + sector
    lookup = _load_sp500_names()
    for r in rows:
        meta = lookup.get(r["ticker"], {})
        r["company_name"] = meta.get("name", "")
        r["sector"] = meta.get("sector", "")

    payload = {
        "total": len(rows),
        "top": rows,
        "model": "GradientBoosting (cross-sectional, 20-day horizon)",
        "generated_from": "output/gbm_predictions.csv",
    }

    out = OUTPUT_DIR / "gbm_predictions.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    logger.info("saved %s (top %d)", out, len(rows))
    try:
        from db import data_store as _ds
        _conn = _ds.get_db()
        _ds.upsert_gbm_predictions(_conn, payload)
        _conn.close()
    except Exception as _e:
        logger.warning("SQLite gbm_predictions 쓰기 실패: %s", _e)
    return out


def enrich_top10_with_company_names() -> Path | None:
    """Add company_name + sector fields to each entry in final_top10_report.json."""
    src = OUTPUT_DIR / "final_top10_report.json"
    if not src.exists():
        logger.warning("no final_top10_report.json found — skipping")
        return None

    data = json.loads(src.read_text())
    lookup = _load_sp500_names()
    for entry in data.get("top10", []):
        meta = lookup.get(entry.get("ticker", ""), {})
        entry.setdefault("company_name", meta.get("name", ""))
        entry.setdefault("sector", meta.get("sector", ""))

    src.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    logger.info("enriched %s with company_name (top10=%d)", src, len(data.get("top10", [])))
    return src


def _load_sp500_names() -> dict:
    src = DATA_DIR / "sp500_list.csv"
    lookup: dict = {}
    if not src.exists():
        return lookup
    with src.open(encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            sym = (row.get("Symbol") or "").strip()
            if sym:
                lookup[sym] = {
                    "name": (row.get("Security") or "").strip(),
                    "sector": (row.get("GICS Sector") or "").strip(),
                }
    return lookup


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    save_market_gate_json()
    save_gbm_json()
    enrich_top10_with_company_names()
    print("\n✓ Dashboard JSONs regenerated.")


if __name__ == "__main__":
    main()
