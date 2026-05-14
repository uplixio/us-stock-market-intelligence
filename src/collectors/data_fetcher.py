import logging
import os

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False
    logger.warning("yfinance 미설치 — Finnhub fallback 사용")


class USStockDataFetcher:
    def __init__(self):
        self.yf_available = YF_AVAILABLE
        self.yf_session = None

        if self.yf_available:
            try:
                from curl_cffi import requests as curl_requests
                self.yf_session = curl_requests.Session(impersonate="chrome")
                logger.info("curl_cffi 세션 활성화")
            except ImportError:
                pass

        self.finnhub_key = os.environ.get("FINNHUB_API_KEY")
        self.alphavantage_key = os.environ.get("ALPHAVANTAGE_API_KEY")
        self.fmp_key = os.environ.get("FMP_API_KEY")

        sources = []
        if self.yf_available:
            sources.append("yfinance")
        if self.finnhub_key:
            sources.append("finnhub")
        if self.alphavantage_key:
            sources.append("alphavantage")
        if self.fmp_key:
            sources.append("fmp")
        logger.info("데이터 소스: %s", ", ".join(sources) or "없음")

    def get_history(self, ticker: str, period: str = "3mo") -> pd.DataFrame:
        if self.yf_available:
            try:
                t = yf.Ticker(ticker, session=self.yf_session)
                df = t.history(period=period)
                if not df.empty:
                    logger.info("%s: %d일치 수집", ticker, len(df))
                    return df
            except Exception:
                logger.debug("%s yfinance 수집 실패", ticker)

        if self.finnhub_key:
            logger.debug("%s Finnhub fallback 시도", ticker)
            try:
                return self._fetch_finnhub_history(ticker, period)
            except Exception:
                logger.debug("%s Finnhub 수집 실패", ticker)

        logger.warning("%s 수집 실패 — 빈 DataFrame 반환", ticker)
        return pd.DataFrame()

    def get_info(self, ticker: str) -> dict:
        if self.yf_available:
            try:
                t = yf.Ticker(ticker, session=self.yf_session)
                info = t.info
                if info:
                    return info
            except Exception:
                logger.debug("%s info 수집 실패", ticker)
        return {}

    def _fetch_finnhub_history(self, ticker: str, period: str) -> pd.DataFrame:
        import time
        import requests

        period_map = {"1mo": 30, "3mo": 90, "6mo": 180, "1y": 365}
        days = period_map.get(period, 90)
        now = int(time.time())
        start = now - days * 86400

        url = "https://finnhub.io/api/v1/stock/candle"
        resp = requests.get(url, params={
            "symbol": ticker, "resolution": "D",
            "from": start, "to": now, "token": self.finnhub_key,
        })
        resp.raise_for_status()
        data = resp.json()

        if data.get("s") != "ok":
            return pd.DataFrame()

        df = pd.DataFrame({
            "Open": data["o"], "High": data["h"], "Low": data["l"],
            "Close": data["c"], "Volume": data["v"],
        }, index=pd.to_datetime(data["t"], unit="s"))
        df.index.name = "Date"
        logger.info("%s: %d일치 수집 (Finnhub)", ticker, len(df))
        return df


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    fetcher = USStockDataFetcher()

    hist = fetcher.get_history("AAPL", period="1mo")
    if not hist.empty:
        print(f"\nAAPL 최근 데이터:\n{hist.tail()}")

    info = fetcher.get_info("AAPL")
    if info:
        print(f"\nAAPL 정보:")
        for k in ["shortName", "sector", "marketCap", "trailingPE"]:
            print(f"  {k}: {info.get(k, 'N/A')}")
