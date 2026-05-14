from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

import pandas as pd
import requests
import yfinance as yf
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

VIX_BOUNDARIES = {
    "risk_on": (0, 16),
    "neutral": (16, 22),
    "risk_off": (22, 30),
    "crisis": (30, 999),
}


class MacroDataCollector:
    def __init__(self):
        self.api_key = os.environ.get("FRED_API_KEY")
        if not self.api_key:
            logger.warning("FRED_API_KEY 환경변수 미설정 — FRED 기능 사용 불가")
        self.base_url = "https://api.stlouisfed.org/fred/series/observations"
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "Mozilla/5.0"})

        # yfinance 세션
        self.yf_session = None
        try:
            from curl_cffi import requests as curl_requests
            self.yf_session = curl_requests.Session(impersonate="chrome")
        except ImportError:
            pass

    def fetch_fred_series(self, series_id: str, start_date: str = None) -> pd.DataFrame:
        if not self.api_key:
            logger.error("FRED API 키 없음 — %s 수집 불가", series_id)
            return pd.DataFrame()

        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y-%m-%d")

        try:
            resp = self.session.get(self.base_url, params={
                "series_id": series_id,
                "api_key": self.api_key,
                "file_type": "json",
                "observation_start": start_date,
            }, timeout=30)
            resp.raise_for_status()
            data = resp.json()["observations"]
            df = pd.DataFrame(data)[["date", "value"]].copy()
            df["date"] = pd.to_datetime(df["date"])
            df["value"] = pd.to_numeric(df["value"], errors="coerce")
            df = df.set_index("date").rename(columns={"value": series_id})
            logger.info("FRED %s: %d행 수집", series_id, len(df))
            return df
        except Exception:
            logger.exception("FRED %s 수집 실패", series_id)
            return pd.DataFrame()

    def fetch_interest_rates(self) -> dict[str, pd.DataFrame]:
        series = {"FEDFUNDS": "연방기금금리", "DGS10": "10년물", "DGS2": "2년물"}
        results = {}
        for sid, name in series.items():
            df = self.fetch_fred_series(sid)
            if not df.empty:
                results[sid] = df
                logger.info("%s(%s) 최신값: %.2f%%", name, sid, df[sid].dropna().iloc[-1])
        return results

    def fetch_tips_10y_real_yield(self) -> float | None:
        """10년물 TIPS 실질금리 (DFII10) 최신값.

        2026-04-05 service-evolver: ERP 계산용 TIPS 실질금리 추가.
        근거: https://global.morningstar.com/en-nd/markets/this-simple-metric-could-predict-future-us-stock-market-returns
        """
        df = self.fetch_fred_series("DFII10")
        if df.empty or "DFII10" not in df.columns:
            return None
        latest = df["DFII10"].dropna()
        if latest.empty:
            return None
        val = float(latest.iloc[-1])
        logger.info("TIPS 10년 실질금리(DFII10): %.2f%%", val)
        return val

    def fetch_spy_earnings_yield(self) -> float | None:
        """SPY forward P/E의 역수 = forward earnings yield (%).

        2026-04-05 service-evolver: ERP 계산용. yfinance forwardPE 사용.
        """
        try:
            ticker = yf.Ticker("SPY", session=self.yf_session)
            info = ticker.info or {}
            fwd_pe = info.get("forwardPE") or info.get("trailingPE")
            if fwd_pe and fwd_pe > 0:
                yield_pct = (1.0 / fwd_pe) * 100
                logger.info("SPY forward earnings yield: %.2f%% (P/E=%.1f)", yield_pct, fwd_pe)
                return round(yield_pct, 2)
        except Exception:
            logger.exception("SPY earnings yield 수집 실패")
        return None

    def fetch_equity_risk_premium(self) -> dict | None:
        """Equity Risk Premium = earnings_yield − TIPS 10y real yield (%).

        2026-04-05 service-evolver: Morningstar 2025 — ERP가 장기 주식 수익률 예측력 최상위.
        ERP 높음 → 주식 저평가, 낮음 → 고평가.
        """
        ey = self.fetch_spy_earnings_yield()
        tips = self.fetch_tips_10y_real_yield()
        if ey is None or tips is None:
            logger.warning("ERP 계산 불가 (ey=%s, tips=%s)", ey, tips)
            return None
        erp = round(ey - tips, 2)
        # 역사적 평균 ~3-4%. <2% = 과열, >5% = 저평가 신호
        if erp < 2.0:
            valuation = "과열 (주식 고평가)"
        elif erp < 3.5:
            valuation = "중립"
        elif erp < 5.0:
            valuation = "우호 (저평가 진입)"
        else:
            valuation = "저평가 (매력적)"
        logger.info("ERP: %.2f%% → %s", erp, valuation)
        return {
            "erp_pct": erp,
            "earnings_yield_pct": ey,
            "tips_10y_real_pct": tips,
            "valuation": valuation,
        }

    def fetch_vix(self, period: str = "1y") -> pd.DataFrame:
        try:
            ticker = yf.Ticker("^VIX", session=self.yf_session)
            df = ticker.history(period=period)[["Close"]].rename(columns={"Close": "VIX"})
            if df.empty:
                logger.warning("VIX 데이터 없음")
                return pd.DataFrame()
            vix_now = df["VIX"].iloc[-1]
            regime = next(k for k, (lo, hi) in VIX_BOUNDARIES.items() if lo <= vix_now < hi)
            logger.info("VIX: %.2f (%s)", vix_now, regime)
            return df
        except Exception:
            logger.exception("VIX 수집 실패")
            return pd.DataFrame()

    def fetch_fear_greed(self) -> dict:
        urls = [
            "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
            "https://production.dataviz.cnn.io/index/fearandgreed/current",
        ]
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Referer": "https://edition.cnn.com/markets/fear-and-greed",
            "Accept": "application/json",
        }
        for url in urls:
            try:
                resp = requests.get(url, headers=headers, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                if "fear_and_greed" in data:
                    score = data["fear_and_greed"]["score"]
                    rating = data["fear_and_greed"]["rating"]
                elif "score" in data:
                    score = data["score"]
                    rating = data.get("rating", "unknown")
                else:
                    continue
                logger.info("Fear & Greed Index: %.1f (%s)", score, rating)
                return {"score": score, "rating": rating}
            except Exception:
                logger.debug("Fear & Greed URL 실패: %s", url)
                continue

        # VIX 기반 대체 추정
        logger.warning("Fear & Greed API 접근 불가 — VIX 기반 대체 추정 사용")
        vix_df = self.fetch_vix(period="5d")
        if not vix_df.empty:
            vix = vix_df["VIX"].iloc[-1]
            # VIX → Fear & Greed 대략 추정 (역상관)
            estimated = max(0, min(100, 100 - (vix - 12) * 3.5))
            if estimated >= 75:
                rating = "Extreme Greed"
            elif estimated >= 55:
                rating = "Greed"
            elif estimated >= 45:
                rating = "Neutral"
            elif estimated >= 25:
                rating = "Fear"
            else:
                rating = "Extreme Fear"
            logger.info("Fear & Greed (VIX추정): %.1f (%s)", estimated, rating)
            return {"score": round(estimated, 1), "rating": rating, "source": "vix_estimate"}
        return {}

    @staticmethod
    def classify_regime(vix_value: float) -> str:
        for regime, (lo, hi) in VIX_BOUNDARIES.items():
            if lo <= vix_value < hi:
                return regime
        return "crisis"

    @staticmethod
    def get_regime_description(regime: str) -> str:
        descriptions = {
            "risk_on": "시장이 안정적입니다. 공격적 포지션 가능.",
            "neutral": "시장이 보통 수준입니다. 균형 잡힌 포지션 유지.",
            "risk_off": "변동성이 높아지고 있습니다. 방어적 포지션 권장.",
            "crisis": "시장이 극도로 불안합니다. 현금 비중 확대 및 헤지 필요.",
        }
        return descriptions.get(regime, "알 수 없는 국면")

    def get_macro_summary(self) -> dict:
        summary = {}

        # VIX + 시장 국면
        vix_df = self.fetch_vix(period="5d")
        if not vix_df.empty:
            vix_now = vix_df["VIX"].iloc[-1]
            regime = self.classify_regime(vix_now)
            summary["VIX"] = {"value": round(vix_now, 2), "regime": regime}
            summary["regime"] = regime
            summary["regime_description"] = self.get_regime_description(regime)

        # Fear & Greed
        fg = self.fetch_fear_greed()
        if fg:
            summary["fear_greed"] = fg

        # FRED 금리
        rates = self.fetch_interest_rates()
        for sid, df in rates.items():
            val = df[sid].dropna().iloc[-1]
            summary[sid] = round(val, 2)

        # 장단기 금리차
        if "DGS10" in summary and "DGS2" in summary:
            spread = summary["DGS10"] - summary["DGS2"]
            summary["yield_spread_10y_2y"] = round(spread, 2)
            summary["yield_curve"] = "정상" if spread > 0 else "역전"

        # Equity Risk Premium (2026-04-05 service-evolver 추가)
        erp_data = self.fetch_equity_risk_premium()
        if erp_data:
            summary["erp"] = erp_data

        logger.info("매크로 요약: %s", summary)
        return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    collector = MacroDataCollector()

    # VIX 테스트
    vix = collector.fetch_vix(period="5d")
    if not vix.empty:
        print(f"\nVIX 최근 데이터:\n{vix.tail()}")

    # Fear & Greed 테스트
    fg = collector.fetch_fear_greed()
    if fg:
        print(f"\nFear & Greed: {fg}")

    # FRED (API 키 있을 때만)
    if collector.api_key:
        rates = collector.fetch_interest_rates()
        for sid, df in rates.items():
            print(f"\n{sid}:\n{df.tail()}")

    # 전체 요약
    print("\n매크로 요약:")
    summary = collector.get_macro_summary()
    for k, v in summary.items():
        print(f"  {k}: {v}")
