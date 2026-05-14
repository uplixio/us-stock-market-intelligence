#!/usr/bin/env python3
"""
Smart Money Strategy Backtester

43개 daily_report를 읽어 3가지 전략의 백테스트 시뮬레이션을 생성한다.
각 진입일에 당일 Top10 종목 균등 매수, 5거래일 후 청산.
SPY 벤치마크와 비교.

전략:
  A: 항상 투자 (baseline) — 매 리포트일 진입
  B: STOP 신호 제외 — Verdict=STOP인 날 제외
  C: Risk-On + 비STOP — Regime=risk_on AND Verdict≠STOP

Usage:
    .venv/bin/python3 scripts/generate_performance.py
"""
from __future__ import annotations

import json
import math
import statistics
import sys
import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "output" / "reports"
FRONTEND_DATA = ROOT / "frontend" / "public" / "data"

sys.path.insert(0, str(ROOT / "src"))
from db.data_store import get_db, upsert_performance


def load_all_reports(reports_dir: Path) -> list[dict]:
    """daily_report_YYYYMMDD.json 전체 로드, 날짜순 정렬"""
    reports = []
    for f in sorted(reports_dir.glob("daily_report_2*.json")):
        if f.name == "latest_report.json":
            continue
        try:
            d = json.loads(f.read_text(encoding="utf-8"))
            stem = f.stem.replace("daily_report_", "")  # "20260217"
            date_str = f"{stem[:4]}-{stem[4:6]}-{stem[6:]}"
            d["_date"] = date_str
            reports.append(d)
        except Exception as e:
            print(f"[WARN] {f.name} 로드 실패: {e}")
    return sorted(reports, key=lambda x: x["_date"])


def get_all_tickers(reports: list[dict]) -> set[str]:
    tickers = {"SPY"}
    for r in reports:
        for p in r.get("stock_picks", [])[:5]:
            t = p.get("ticker", "")
            if t:
                tickers.add(t)
    return tickers


def find_trading_day_idx(trading_days: list, target_str: str) -> int:
    """target_str 이전/당일 마지막 유효 거래일 인덱스 반환. 없으면 -1."""
    import pandas as pd
    target_ts = pd.Timestamp(target_str)
    for i in range(len(trading_days) - 1, -1, -1):
        if trading_days[i] <= target_ts:
            return i
    return -1


SLIPPAGE_PCT = 0.10  # 왕복 슬리피지 10bps (진입 5bps + 청산 5bps)
HOLD_PERIOD = 5      # 보유 거래일 수


def calc_return(
    entry_date_str: str,
    tickers: list[str],
    close_df,
    trading_days: list,
    hold_period: int = 5,
) -> tuple[float, float]:
    """
    entry_date_str 스크리닝 신호 → T+1 Close 매수, hold_period 거래일 후 청산.
    Returns: (portfolio_return_pct, spy_return_pct)
    """
    import pandas as pd

    entry_idx = find_trading_day_idx(trading_days, entry_date_str)
    if entry_idx < 0:
        return 0.0, 0.0

    t1_idx = min(entry_idx + 1, len(trading_days) - 1)  # T+1: 실제 매수 가능일
    exit_idx = min(t1_idx + hold_period, len(trading_days) - 1)
    if t1_idx == exit_idx:
        return 0.0, 0.0

    entry_day = trading_days[t1_idx]
    exit_day = trading_days[exit_idx]

    # SPY 수익률
    spy_ret = 0.0
    if "SPY" in close_df.columns:
        spy_buy = float(close_df["SPY"].get(entry_day, float("nan")))
        spy_sell = float(close_df["SPY"].get(exit_day, float("nan")))
        if not (math.isnan(spy_buy) or math.isnan(spy_sell) or spy_buy == 0):
            spy_ret = (spy_sell - spy_buy) / spy_buy * 100

    # 포트폴리오 수익률
    returns = []
    for ticker in tickers:
        if ticker not in close_df.columns:
            continue
        buy_p = close_df[ticker].get(entry_day, None)
        sell_p = close_df[ticker].get(exit_day, None)
        if buy_p is None or sell_p is None:
            continue
        buy_p = float(buy_p)
        sell_p = float(sell_p)
        if math.isnan(buy_p) or math.isnan(sell_p) or buy_p == 0:
            continue
        returns.append((sell_p - buy_p) / buy_p * 100 - SLIPPAGE_PCT)

    if not returns:
        return 0.0, round(spy_ret, 4)
    return round(sum(returns) / len(returns), 4), round(spy_ret, 4)


def simulate_strategy(
    reports: list[dict],
    close_df,
    trading_days: list,
    filter_fn,
    picks_count: int = 5,
    grade_filter: list[str] | None = None,
) -> dict:
    capital = 10_000.0
    equity_curve = []
    signal_log = []
    trade_returns: list[float] = []
    last_exit_idx = -1  # 마지막 청산 거래일 인덱스 (포지션 겹침 방지)

    running = capital
    for report in reports:
        date_str = report["_date"]
        mt = report.get("market_timing", {})
        regime = mt.get("regime", "unknown")
        gate = mt.get("gate", "unknown")
        verdict = report.get("verdict", "unknown")
        picks = report.get("stock_picks", [])[:picks_count]
        if grade_filter:
            picks = [p for p in picks if p.get("grade", "") in grade_filter]
        tickers = [p["ticker"] for p in picks if p.get("ticker")]

        # T+1 진입일이 이전 포지션 청산일 이후여야만 진입 가능 (비겹침 원칙)
        entry_idx = find_trading_day_idx(trading_days, date_str)
        t1_idx = min(entry_idx + 1, len(trading_days) - 1) if entry_idx >= 0 else -1
        in_position = t1_idx >= 0 and t1_idx <= last_exit_idx

        invested = filter_fn(report) and bool(tickers) and not in_position
        daily_ret = 0.0

        if invested:
            port_ret, _ = calc_return(date_str, tickers, close_df, trading_days)
            daily_ret = port_ret
            running *= (1 + daily_ret / 100)
            trade_returns.append(daily_ret)
            if t1_idx >= 0:
                last_exit_idx = min(t1_idx + HOLD_PERIOD, len(trading_days) - 1)

        equity_curve.append({
            "date": date_str,
            "value": round(running, 2),
            "invested": invested,
        })
        signal_log.append({
            "date": date_str,
            "regime": regime,
            "gate": gate,
            "verdict": verdict,
            "invested": invested,
            "daily_return_pct": round(daily_ret, 2),
            "tickers": tickers,
        })

    metrics = _calc_metrics(trade_returns, running, capital, len(reports))
    return {
        "equity_curve": equity_curve,
        "signal_log": signal_log,
        "metrics": metrics,
        "trade_count": len(trade_returns),
    }


def _calc_metrics(
    trade_returns: list[float],
    final_capital: float,
    initial_capital: float,
    total_days: int,
) -> dict:
    cum_ret = (final_capital / initial_capital - 1) * 100
    n = max(total_days, 1)
    ann_ret = ((final_capital / initial_capital) ** (252 / n) - 1) * 100

    if len(trade_returns) >= 2:
        mean_r = statistics.mean(trade_returns)
        std_r = statistics.stdev(trade_returns)
        sharpe = (mean_r / std_r * (252 ** 0.5)) if std_r > 0 else 0.0
    else:
        sharpe = 0.0

    wins = sum(1 for r in trade_returns if r > 0)
    win_rate = (wins / len(trade_returns) * 100) if trade_returns else 0.0

    peak = initial_capital
    running = initial_capital
    mdd = 0.0
    for r in trade_returns:
        running *= (1 + r / 100)
        if running > peak:
            peak = running
        dd = (running - peak) / peak * 100
        if dd < mdd:
            mdd = dd

    return {
        "cumulative_return": round(cum_ret, 2),
        "annualized_return": round(ann_ret, 2),
        "sharpe": round(sharpe, 3),
        "max_drawdown": round(mdd, 2),
        "win_rate": round(win_rate, 1),
    }


def build_spy_curve(close_df, start_date_str: str) -> list[dict]:
    import pandas as pd
    if "SPY" not in close_df.columns:
        return []
    spy = close_df["SPY"].dropna()
    start_ts = pd.Timestamp(start_date_str)
    spy = spy[spy.index >= start_ts]
    if spy.empty:
        return []
    base = float(spy.iloc[0])
    if base == 0:
        return []
    return [
        {"date": ts.strftime("%Y-%m-%d"), "value": round(10_000 * float(p) / base, 2)}
        for ts, p in spy.items()
        if not math.isnan(float(p))
    ]


def main():
    try:
        import yfinance as yf
        import pandas as pd
    except ImportError:
        print("[ERROR] yfinance / pandas 미설치")
        sys.exit(1)

    print("=== Smart Money Strategy Backtester ===")

    reports = load_all_reports(REPORTS_DIR)
    if not reports:
        print("[ERROR] daily_report 파일 없음")
        sys.exit(1)
    print(f"✓ {len(reports)}개 리포트 ({reports[0]['_date']} ~ {reports[-1]['_date']})")

    all_tickers = get_all_tickers(reports)
    print(f"✓ {len(all_tickers)}개 유니크 티커")

    start_dl = (
        datetime.date.fromisoformat(reports[0]["_date"]) - datetime.timedelta(days=10)
    ).isoformat()
    print(f"yfinance 다운로드 중... ({start_dl} ~ today)")

    raw = yf.download(list(all_tickers), start=start_dl, progress=False, auto_adjust=True)
    if raw.empty:
        print("[ERROR] yfinance 데이터 없음")
        sys.exit(1)

    close_df = raw["Close"] if "Close" in raw.columns else raw
    # Flatten MultiIndex columns if present
    if hasattr(close_df.columns, "levels"):
        close_df.columns = close_df.columns.get_level_values(0)

    trading_days = list(close_df.index)
    print(f"✓ {len(trading_days)}개 거래일")

    # SPY 벤치마크
    spy_curve = build_spy_curve(close_df, reports[0]["_date"])
    spy_final = spy_curve[-1]["value"] if spy_curve else 10_000
    spy_cum_ret = round((spy_final / 10_000 - 1) * 100, 2)
    spy_ann_ret = round(
        ((spy_final / 10_000) ** (252 / max(len(reports), 1)) - 1) * 100, 2
    )

    strategies_cfg = {
        "strategy_a": {
            "label": "항상 투자 (Baseline)",
            "description": "신호 무관, 매 리포트일 Top10 진입",
            "color": "#94a3b8",
            "filter": lambda r: True,
        },
        "strategy_b": {
            "label": "STOP 신호 제외",
            "description": "Verdict=STOP인 날 제외하고 투자",
            "color": "#60a5fa",
            "filter": lambda r: r.get("verdict", "") != "STOP",
        },
        "strategy_c": {
            "label": "Top 10 분산",
            "description": "Verdict≠STOP인 날 Top 10 종목 균등 분산. 집중 위험 최소화",
            "color": "#4ade80",
            "filter": lambda r: r.get("verdict", "") != "STOP",
            "picks_count": 10,
            "grade_filter": None,
        },
        "strategy_d": {
            "label": "Top 3 집중",
            "description": "상위 3종목만 균등 매수 + Verdict≠STOP. 집중 포트폴리오로 알파 극대화 시도",
            "color": "#a78bfa",
            "filter": lambda r: r.get("verdict", "") != "STOP",
            "picks_count": 3,
            "grade_filter": None,
        },
        "strategy_e": {
            "label": "Grade A 단독",
            "description": "당일 Grade A 종목만 편입 + Verdict≠STOP. 최우량 종목 집중 전략",
            "color": "#f472b6",
            "filter": lambda r: r.get("verdict", "") != "STOP",
            "picks_count": 5,
            "grade_filter": ["A"],
        },
    }

    result_strategies: dict = {}
    for key, cfg in strategies_cfg.items():
        print(f"\n{key} 시뮬레이션...")
        sim = simulate_strategy(
            reports, close_df, trading_days, cfg["filter"],
            picks_count=cfg.get("picks_count", 5),
            grade_filter=cfg.get("grade_filter"),
        )
        alpha = round(sim["metrics"]["annualized_return"] - spy_ann_ret, 2)
        sim["metrics"]["alpha_vs_spy"] = alpha
        result_strategies[key] = {
            "label": cfg["label"],
            "description": cfg["description"],
            "color": cfg["color"],
            "metrics": sim["metrics"],
            "equity_curve": sim["equity_curve"],
            "signal_log": sim["signal_log"],
            "trade_count": sim["trade_count"],
        }
        m = sim["metrics"]
        print(
            f"  투자일 {sim['trade_count']}/{len(reports)} | "
            f"누적 {m['cumulative_return']:+.1f}% | "
            f"Sharpe {m['sharpe']:.2f} | "
            f"Alpha {alpha:+.1f}% | "
            f"MDD {m['max_drawdown']:.1f}% | "
            f"Win {m['win_rate']:.0f}%"
        )

    payload = {
        "generated_at": reports[-1]["_date"],
        "date_range": {"start": reports[0]["_date"], "end": reports[-1]["_date"]},
        "spy_cumulative_return": spy_cum_ret,
        "spy_annualized_return": spy_ann_ret,
        "strategies": result_strategies,
        "spy_curve": spy_curve,
        "note": "T+1 Close 진입 · 5거래일 보유 후 청산 · 왕복 슬리피지 10bps 적용. 포지션 중복 허용 단순화 모델.",
    }

    FRONTEND_DATA.mkdir(parents=True, exist_ok=True)
    out = FRONTEND_DATA / "performance.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n✓ {out} 저장 완료")
    print(f"  SPY 기간 수익률: {spy_cum_ret:+.1f}%")

    try:
        conn = get_db()
        upsert_performance(conn, payload)
        conn.close()
        print("✓ SQLite data_performance 갱신 완료")
    except Exception as e:
        print(f"[WARN] SQLite 쓰기 실패: {e}")


if __name__ == "__main__":
    main()
