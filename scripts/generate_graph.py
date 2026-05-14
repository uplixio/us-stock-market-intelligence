#!/usr/bin/env python3
"""
Knowledge Graph 데이터 생성.

두 가지 그래프를 생성한다:
  1. system_graph: 시스템 아키텍처 (데이터소스 → 수집 → 분석 → 신호 → 출력 → 페이지)
  2. stock_graph: 종목 네트워크 (상관관계 + 섹터 그룹)

Usage:
    .venv/bin/python3 scripts/generate_graph.py
"""
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DATA = ROOT / "frontend" / "public" / "data"

sys.path.insert(0, str(ROOT / "src"))
from db.data_store import get_db, upsert_graph

RISK_ALERTS_PATH = FRONTEND_DATA / "risk_alerts.json"
TOP10_PATH = ROOT / "output" / "final_top10_report.json"


# ── 시스템 아키텍처 그래프 ────────────────────────────────────────

SYSTEM_NODES = [
    # data_source
    {"id": "yahoo_finance", "name": "Yahoo Finance", "type": "data_source",
     "description": "주가·재무 OHLCV 데이터 (yfinance)"},
    {"id": "fred", "name": "FRED", "type": "data_source",
     "description": "연준 거시경제 지표 (금리, CPI 등)"},
    {"id": "vix", "name": "VIX Index", "type": "data_source",
     "description": "공포지수 — ^VIX (CBOE)"},
    {"id": "finnhub", "name": "Finnhub", "type": "data_source",
     "description": "애널리스트 의견 + 뉴스 피드"},
    {"id": "wikipedia", "name": "Wikipedia", "type": "data_source",
     "description": "S&P 500 종목 목록 (HTML 파싱)"},
    # collector
    {"id": "us_price_fetcher", "name": "USPriceFetcher", "type": "collector",
     "description": "S&P500 503종목 일별 OHLCV 수집 (curl_cffi)"},
    {"id": "macro_collector", "name": "MacroCollector", "type": "collector",
     "description": "VIX, FRED, Fear&Greed 거시 데이터 수집"},
    {"id": "sp500_list", "name": "SP500List", "type": "collector",
     "description": "Wikipedia에서 S&P500 종목+섹터 목록"},
    # analyzer
    {"id": "market_regime", "name": "MarketRegime", "type": "analyzer",
     "description": "5-Sensor 가중투표: VIX(30%) + Trend(25%) + Breadth(18%) + Credit(15%) + YieldCurve(12%)"},
    {"id": "market_gate", "name": "MarketGate", "type": "analyzer",
     "description": "11개 섹터 ETF 분석 → GO/CAUTION/STOP"},
    {"id": "smart_money", "name": "SmartMoney", "type": "analyzer",
     "description": "기술(25%) + 펀더멘털(20%) + 애널리스트(15%) + RS(15%) + 볼륨(15%) + 13F(10%)"},
    {"id": "ai_analysis", "name": "AIAnalysis", "type": "analyzer",
     "description": "Gemini/GPT/Perplexity 멀티 AI 분석 + 폴백"},
    {"id": "ml_predictor", "name": "MLPredictor (GBM)", "type": "analyzer",
     "description": "LightGBM — SPY/QQQ 5일 방향 예측 (bullish/bearish)"},
    {"id": "final_report_gen", "name": "FinalReportGen", "type": "analyzer",
     "description": "Quant + AI 점수 결합 → 최종 Top10 랭킹"},
    {"id": "risk_alert_engine", "name": "RiskAlertEngine", "type": "analyzer",
     "description": "Stop-loss / VaR / CDaR / 집중도 / 스트레스 테스트"},
    # signal
    {"id": "sig_regime", "name": "Regime Signal", "type": "signal",
     "description": "risk_on / neutral / risk_off / crisis"},
    {"id": "sig_gate", "name": "Gate Signal", "type": "signal",
     "description": "GO / CAUTION / STOP"},
    {"id": "sig_ml", "name": "ML Signal", "type": "signal",
     "description": "bullish / bearish + confidence %"},
    {"id": "sig_verdict", "name": "Verdict", "type": "signal",
     "description": "최종 진입 판정: GO / CAUTION / STOP"},
    # output
    {"id": "out_top_picks", "name": "TopPicks JSON", "type": "output",
     "description": "final_top10_report.json — 최종 추천 10종목"},
    {"id": "out_risk_alerts", "name": "RiskAlerts JSON", "type": "output",
     "description": "risk_alerts.json — 포지션·리스크 경보"},
    {"id": "out_performance", "name": "Performance JSON", "type": "output",
     "description": "performance.json — 전략 백테스트 시뮬레이션"},
    {"id": "out_daily_report", "name": "DailyReport JSON", "type": "output",
     "description": "daily_report_YYYYMMDD.json — 43개 일별 리포트"},
    # page
    {"id": "page_overview", "name": "Overview", "type": "page", "href": "/",
     "description": "메인 대시보드 — 시장 요약"},
    {"id": "page_regime", "name": "Market Regime", "type": "page", "href": "/regime",
     "description": "5-Sensor 레짐 분석"},
    {"id": "page_risk", "name": "Risk Monitor", "type": "page", "href": "/risk",
     "description": "포지션 리스크 + 스트레스 테스트"},
    {"id": "page_top_picks", "name": "Top Picks", "type": "page", "href": "/top-picks",
     "description": "Smart Money Top 10 종목"},
    {"id": "page_ai", "name": "AI Analysis", "type": "page", "href": "/ai",
     "description": "AI 종목별 투자 논리"},
    {"id": "page_forecast", "name": "Index Forecast", "type": "page", "href": "/forecast",
     "description": "SPY/QQQ 방향 예측"},
    {"id": "page_ml", "name": "ML Rankings", "type": "page", "href": "/ml",
     "description": "GBM 모델 종목 랭킹"},
    {"id": "page_performance", "name": "Performance", "type": "page", "href": "/performance",
     "description": "전략 백테스트 시뮬레이션"},
    {"id": "page_graph", "name": "System Graph", "type": "page", "href": "/graph",
     "description": "시스템 아키텍처 지식 그래프"},
]

SYSTEM_EDGES = [
    # data_source → collector
    {"source": "yahoo_finance", "target": "us_price_fetcher", "type": "feeds"},
    {"source": "yahoo_finance", "target": "macro_collector", "type": "feeds"},
    {"source": "fred", "target": "macro_collector", "type": "feeds"},
    {"source": "vix", "target": "macro_collector", "type": "feeds"},
    {"source": "finnhub", "target": "us_price_fetcher", "type": "feeds"},
    {"source": "wikipedia", "target": "sp500_list", "type": "feeds"},
    # collector → analyzer
    {"source": "us_price_fetcher", "target": "market_regime", "type": "feeds"},
    {"source": "us_price_fetcher", "target": "market_gate", "type": "feeds"},
    {"source": "us_price_fetcher", "target": "smart_money", "type": "feeds"},
    {"source": "us_price_fetcher", "target": "ml_predictor", "type": "feeds"},
    {"source": "macro_collector", "target": "market_regime", "type": "feeds"},
    {"source": "sp500_list", "target": "smart_money", "type": "feeds"},
    {"source": "sp500_list", "target": "us_price_fetcher", "type": "feeds"},
    # analyzer chain
    {"source": "smart_money", "target": "ai_analysis", "type": "feeds"},
    {"source": "smart_money", "target": "final_report_gen", "type": "feeds"},
    {"source": "ai_analysis", "target": "final_report_gen", "type": "enhances"},
    {"source": "final_report_gen", "target": "out_top_picks", "type": "produces"},
    {"source": "out_top_picks", "target": "risk_alert_engine", "type": "feeds"},
    {"source": "market_regime", "target": "risk_alert_engine", "type": "feeds"},
    # analyzer → signal
    {"source": "market_regime", "target": "sig_regime", "type": "produces"},
    {"source": "market_gate", "target": "sig_gate", "type": "produces"},
    {"source": "ml_predictor", "target": "sig_ml", "type": "produces"},
    # signal → verdict
    {"source": "sig_regime", "target": "sig_verdict", "type": "determines"},
    {"source": "sig_gate", "target": "sig_verdict", "type": "determines"},
    {"source": "sig_ml", "target": "sig_verdict", "type": "determines"},
    # verdict → output
    {"source": "sig_verdict", "target": "out_daily_report", "type": "gates"},
    {"source": "out_top_picks", "target": "out_daily_report", "type": "feeds"},
    {"source": "sig_regime", "target": "out_daily_report", "type": "feeds"},
    {"source": "risk_alert_engine", "target": "out_risk_alerts", "type": "produces"},
    {"source": "out_top_picks", "target": "out_performance", "type": "feeds"},
    {"source": "sig_verdict", "target": "out_performance", "type": "feeds"},
    # output → page
    {"source": "out_daily_report", "target": "page_overview", "type": "displays"},
    {"source": "sig_regime", "target": "page_regime", "type": "displays"},
    {"source": "sig_gate", "target": "page_regime", "type": "displays"},
    {"source": "out_risk_alerts", "target": "page_risk", "type": "displays"},
    {"source": "out_top_picks", "target": "page_top_picks", "type": "displays"},
    {"source": "ai_analysis", "target": "page_ai", "type": "displays"},
    {"source": "sig_ml", "target": "page_forecast", "type": "displays"},
    {"source": "ml_predictor", "target": "page_ml", "type": "displays"},
    {"source": "out_performance", "target": "page_performance", "type": "displays"},
    {"source": "out_top_picks", "target": "page_graph", "type": "displays"},
    {"source": "out_risk_alerts", "target": "page_graph", "type": "displays"},
]


# ── 종목 네트워크 그래프 ──────────────────────────────────────────

SECTOR_COLORS: dict[str, str] = {
    "Information Technology": "#60a5fa",
    "Health Care": "#4ade80",
    "Financials": "#facc15",
    "Consumer Discretionary": "#fb923c",
    "Communication Services": "#a78bfa",
    "Industrials": "#22d3ee",
    "Consumer Staples": "#f472b6",
    "Energy": "#fbbf24",
    "Utilities": "#86efac",
    "Real Estate": "#c084fc",
    "Materials": "#34d399",
    "Unknown": "#94a3b8",
}


def build_stock_graph() -> dict:
    nodes: list[dict] = []
    edges: list[dict] = []

    # position_sizes에서 티커 + 가중치 추출
    tickers_info: dict[str, dict] = {}
    if RISK_ALERTS_PATH.exists():
        try:
            ra = json.loads(RISK_ALERTS_PATH.read_text(encoding="utf-8"))
            for pos in ra.get("position_sizes", []):
                ticker = pos.get("ticker", "")
                if ticker:
                    tickers_info[ticker] = {
                        "final_pct": pos.get("final_pct", 10),
                        "grade": pos.get("grade", "?"),
                    }
        except Exception as e:
            print(f"[WARN] risk_alerts.json 파싱 실패: {e}")

    # sector 정보 추가
    sector_map: dict[str, str] = {}
    if TOP10_PATH.exists():
        try:
            t10 = json.loads(TOP10_PATH.read_text(encoding="utf-8"))
            for pick in t10.get("top10", []):
                ticker = pick.get("ticker", "")
                sector = pick.get("sector", "Unknown")
                if ticker:
                    sector_map[ticker] = sector
        except Exception as e:
            print(f"[WARN] final_top10_report.json 파싱 실패: {e}")

    # 섹터 노드 (존재하는 섹터만)
    present_sectors: set[str] = set()
    for ticker, info in tickers_info.items():
        sector = sector_map.get(ticker, "Unknown")
        present_sectors.add(sector)

    for sector in sorted(present_sectors):
        nodes.append({
            "id": f"sector_{sector.replace(' ', '_')}",
            "name": sector,
            "type": "sector",
            "description": f"{sector} 섹터",
            "color": SECTOR_COLORS.get(sector, "#94a3b8"),
        })

    # 티커 노드
    for ticker, info in tickers_info.items():
        sector = sector_map.get(ticker, "Unknown")
        nodes.append({
            "id": ticker,
            "name": ticker,
            "type": "ticker",
            "description": f"Grade {info['grade']} · {info['final_pct']:.1f}% 비중",
            "sector": sector,
            "weight": info["final_pct"],
        })
        # 섹터 연결 엣지
        edges.append({
            "source": f"sector_{sector.replace(' ', '_')}",
            "target": ticker,
            "type": "sector_peer",
        })

    # 상관관계 엣지 (risk_alerts.json의 high_correlation_pairs)
    if RISK_ALERTS_PATH.exists():
        try:
            ra = json.loads(RISK_ALERTS_PATH.read_text(encoding="utf-8"))
            concentration = ra.get("concentration", {})
            corr_pairs = concentration.get("high_correlation_pairs", [])
            for item in corr_pairs:
                pair = item.get("pair", [])
                corr = item.get("corr", 0)
                if len(pair) == 2 and abs(corr) >= 0.3:
                    t1, t2 = pair[0], pair[1]
                    if t1 in tickers_info and t2 in tickers_info:
                        edges.append({
                            "source": t1,
                            "target": t2,
                            "type": "correlation",
                            "value": round(abs(corr), 3),
                            "label": f"r={corr:.2f}",
                        })
        except Exception as e:
            print(f"[WARN] 상관관계 파싱 실패: {e}")

    return {"nodes": nodes, "edges": edges}


# ── 종목-시장 관계 그래프 ─────────────────────────────────────────

LATEST_REPORT_PATH = ROOT / "output" / "reports" / "latest_report.json"


def _signal_color(val: str) -> str:
    v = str(val).lower()
    if v in ("risk_on", "bullish", "go", "bull"):
        return "#4ade80"
    if v in ("risk_off", "crisis", "bearish", "stop", "bear"):
        return "#f87171"
    return "#facc15"  # neutral / caution


def _grade_color(grade: str) -> str:
    return {
        "A": "#4ade80",
        "B": "#86efac",
        "C": "#facc15",
        "D": "#fb923c",
        "F": "#f87171",
    }.get(grade, "#94a3b8")


def build_stock_market_graph(report_data: dict) -> dict:
    """종목-시장 관계 그래프: 시장 신호 + 종목 + 페이지 + AI Builder"""
    nodes: list[dict] = []
    edges: list[dict] = []

    mt = report_data.get("market_timing", {})
    spy_pred = mt.get("ml_predictor", {}).get("spy", {})
    qqq_pred = mt.get("ml_predictor", {}).get("qqq", {})
    regime = mt.get("regime", "neutral")
    gate = mt.get("gate", "CAUTION")
    signals = mt.get("signals", {})

    regime_color = _signal_color(regime)
    gate_color = _signal_color(gate)

    spy_dir = spy_pred.get("direction", "neutral")
    spy_color = _signal_color(spy_dir)
    qqq_dir = qqq_pred.get("direction", "neutral")
    qqq_color = _signal_color(qqq_dir)

    # ── 시장 신호 노드 ────────────────────────────────────────────
    spy_conf_pct = float(spy_pred.get("confidence_pct", 0) or 0)
    qqq_conf_pct = float(qqq_pred.get("confidence_pct", 0) or 0)
    spy_ret = float(spy_pred.get("predicted_return", 0) or 0)
    qqq_ret = float(qqq_pred.get("predicted_return", 0) or 0)
    regime_conf = float(mt.get("regime_confidence", 0) or 0)

    nodes.append({
        "id": "mkt_spy",
        "name": f"SPY {spy_dir.upper()}",
        "type": "signal",
        "color": spy_color,
        "description": f"5일 예측 {spy_ret:+.2f}% · 신뢰도 {spy_conf_pct:.0f}%",
    })
    nodes.append({
        "id": "mkt_qqq",
        "name": f"QQQ {qqq_dir.upper()}",
        "type": "signal",
        "color": qqq_color,
        "description": f"5일 예측 {qqq_ret:+.2f}% · 신뢰도 {qqq_conf_pct:.0f}%",
    })
    nodes.append({
        "id": "mkt_regime",
        "name": f"REGIME\n{regime.upper()}",
        "type": "signal",
        "color": regime_color,
        "description": f"신뢰도 {regime_conf:.0f}%",
    })
    nodes.append({
        "id": "mkt_gate",
        "name": f"GATE\n{gate}",
        "type": "signal",
        "color": gate_color,
        "description": "시장 진입 게이트",
    })

    # 센서 노드 (VIX, TREND, BREADTH, CREDIT, YIELD_CURVE)
    sensor_label = {
        "vix": "VIX",
        "trend": "TREND",
        "breadth": "BREADTH",
        "credit": "CREDIT",
        "yield_curve": "YIELD CURVE",
    }
    sensor_desc: dict[str, dict[str, str]] = {
        "vix": {
            "risk_on":  "VIX 낮음 — 시장 공포 없음, 투자 우호적",
            "neutral":  "VIX 보통 — 경계 수준",
            "risk_off": "VIX 높음 — 시장 공포 극심",
            "crisis":   "VIX 위험 — 시장 위기 상태",
        },
        "trend": {
            "risk_on":  "SPY 이동평균선 위 — 강한 상승 추세",
            "neutral":  "SPY 추세 중립 — 방향 불명확",
            "risk_off": "SPY 이동평균선 아래 — 하락 추세",
        },
        "breadth": {
            "risk_on":  "S&P500 종목 전반 상승 — 건강한 시장",
            "neutral":  "시장 폭 중립 — 혼조세",
            "risk_off": "대형주만 오르는 중 — 시장 폭 좁음",
        },
        "credit": {
            "risk_on":  "하이일드 채권 강세 — 투자자 위험 선호",
            "neutral":  "신용 시장 중립",
            "risk_off": "국채 선호 — 안전 자산으로 이동",
        },
        "yield_curve": {
            "risk_on":  "장단기 금리차 정상 — 경기 건강",
            "neutral":  "수익률 곡선 평탄화 중",
            "risk_off": "장단기 금리 역전 — 경기침체 경고",
        },
    }
    for sensor_key, sensor_val in signals.items():
        sc = _signal_color(sensor_val)
        desc = sensor_desc.get(sensor_key, {}).get(str(sensor_val).lower(), sensor_val)
        nodes.append({
            "id": f"mkt_{sensor_key}",
            "name": sensor_label.get(sensor_key, sensor_key.upper()),
            "type": "signal",
            "color": sc,
            "description": desc,
        })
        edges.append({
            "source": f"mkt_{sensor_key}",
            "target": "mkt_regime",
            "type": "determines",
            "color": sc,
        })

    # REGIME + GATE → Verdict 관계
    edges.append({
        "source": "mkt_regime",
        "target": "mkt_gate",
        "type": "determines",
        "color": regime_color,
    })

    # ── 페이지 노드 ───────────────────────────────────────────────
    page_defs = [
        {"id": "page_risk_m",     "name": "Risk Monitor",    "href": "/risk"},
        {"id": "page_ai_m",       "name": "AI Analysis",     "href": "/ai"},
        {"id": "page_ml_m",       "name": "ML Rankings",     "href": "/ml"},
        {"id": "page_forecast_m", "name": "Index Forecast",  "href": "/forecast"},
        {"id": "page_regime_m",   "name": "Market Regime",   "href": "/regime"},
    ]
    for p in page_defs:
        nodes.append({"id": p["id"], "name": p["name"], "type": "page", "href": p["href"]})

    # SPY/QQQ → Index Forecast 페이지
    edges.append({"source": "mkt_spy", "target": "page_forecast_m", "type": "displays", "color": spy_color})
    edges.append({"source": "mkt_qqq", "target": "page_forecast_m", "type": "displays", "color": qqq_color})
    # REGIME → regime 페이지
    edges.append({"source": "mkt_regime", "target": "page_regime_m", "type": "displays", "color": regime_color})

    # ── AI Builder 노드 ───────────────────────────────────────────
    nodes.append({
        "id": "ai_builder",
        "name": "AI Builder",
        "type": "agent",
        "color": "#a78bfa",
        "href": "/ai-builder",
        "description": "Claude Code 에이전트 실행 포털",
    })
    for p in page_defs:
        edges.append({
            "source": "ai_builder",
            "target": p["id"],
            "type": "enhances",
            "color": "#a78bfa",
        })

    # ── 종목 노드 ─────────────────────────────────────────────────
    stock_picks = report_data.get("stock_picks", [])[:10]
    for pick in stock_picks:
        ticker = pick.get("ticker", "")
        if not ticker:
            continue
        grade = pick.get("grade", "C")
        action = pick.get("action", "WATCH")
        score = float(pick.get("composite_score", 0) or 0)
        ticker_color = _grade_color(grade)

        nodes.append({
            "id": f"t_{ticker}",
            "name": ticker,
            "type": "ticker",
            "color": ticker_color,
            "description": f"Grade {grade} | {action} | Score {score:.1f}",
        })

        # 시장 신호 → 종목
        edges.append({"source": "mkt_regime", "target": f"t_{ticker}", "type": "determines", "color": regime_color})
        edges.append({"source": "mkt_gate",   "target": f"t_{ticker}", "type": "gates",      "color": gate_color})
        edges.append({"source": "mkt_spy",    "target": f"t_{ticker}", "type": "correlation", "color": spy_color})

        # 종목 → 페이지
        edges.append({"source": f"t_{ticker}", "target": "page_ai_m",   "type": "displays", "color": ticker_color})
        edges.append({"source": f"t_{ticker}", "target": "page_ml_m",   "type": "displays", "color": ticker_color})
        edges.append({"source": f"t_{ticker}", "target": "page_risk_m", "type": "displays", "color": ticker_color})

        # AI Builder → 종목
        edges.append({"source": "ai_builder", "target": f"t_{ticker}", "type": "enhances", "color": "#a78bfa50"})

    return {"nodes": nodes, "edges": edges}


def main():
    print("=== Knowledge Graph Generator ===")

    stock_graph = build_stock_graph()

    # latest_report.json 로드 (stock_market_graph용)
    stock_market_graph: dict = {"nodes": [], "edges": []}
    if LATEST_REPORT_PATH.exists():
        try:
            report_data = json.loads(LATEST_REPORT_PATH.read_text(encoding="utf-8"))
            stock_market_graph = build_stock_market_graph(report_data)
        except Exception as e:
            print(f"[WARN] latest_report.json 파싱 실패: {e}")
    else:
        print(f"[WARN] {LATEST_REPORT_PATH} 없음 — stock_market_graph 생략")

    payload = {
        "generated_at": date.today().isoformat(),
        "system_graph": {
            "nodes": SYSTEM_NODES,
            "edges": SYSTEM_EDGES,
        },
        "stock_graph": stock_graph,
        "stock_market_graph": stock_market_graph,
    }

    FRONTEND_DATA.mkdir(parents=True, exist_ok=True)
    out = FRONTEND_DATA / "graph.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"✓ system_graph: {len(SYSTEM_NODES)}개 노드, {len(SYSTEM_EDGES)}개 엣지")
    print(f"✓ stock_graph: {len(stock_graph['nodes'])}개 노드, {len(stock_graph['edges'])}개 엣지")
    print(f"✓ stock_market_graph: {len(stock_market_graph['nodes'])}개 노드, {len(stock_market_graph['edges'])}개 엣지")
    print(f"✓ {out} 저장 완료")

    try:
        conn = get_db()
        upsert_graph(conn, payload)
        conn.close()
        print("✓ SQLite data_graph 갱신 완료")
    except Exception as e:
        print(f"[WARN] SQLite 쓰기 실패: {e}")


if __name__ == "__main__":
    main()
