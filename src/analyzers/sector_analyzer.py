import logging
import time

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

SECTOR_ETFS = {
    "XLK": "Information Technology",
    "XLF": "Financials",
    "XLE": "Energy",
    "XLV": "Health Care",
    "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples",
    "XLI": "Industrials",
    "XLB": "Materials",
    "XLRE": "Real Estate",
    "XLU": "Utilities",
    "XLC": "Communication Services",
}

DEFENSIVE = ["XLU", "XLP", "XLV"]
OFFENSIVE = ["XLK", "XLY", "XLC"]


class SectorAnalyzer:
    def __init__(self):
        self.yf_session = None
        try:
            from curl_cffi import requests as curl_requests
            self.yf_session = curl_requests.Session(impersonate="chrome")
        except ImportError:
            pass
        self.prices = pd.DataFrame()

    def fetch_all_sectors(self, period: str = "1y") -> pd.DataFrame:
        frames = {}
        tickers = list(SECTOR_ETFS.keys())
        for i, ticker in enumerate(tickers):
            try:
                t = yf.Ticker(ticker, session=self.yf_session)
                hist = t.history(period=period)
                if not hist.empty:
                    frames[ticker] = hist["Close"]
                    logger.info("%s(%s): %d일 수집", ticker, SECTOR_ETFS[ticker], len(hist))
                else:
                    logger.warning("%s 데이터 없음", ticker)
            except Exception:
                logger.exception("%s 수집 실패", ticker)
            if i < len(tickers) - 1:
                time.sleep(0.5)

        self.prices = pd.DataFrame(frames)
        logger.info("섹터 ETF 수집 완료: %d/%d", len(frames), len(SECTOR_ETFS))
        return self.prices

    def calculate_returns(self) -> pd.DataFrame:
        if self.prices.empty:
            logger.error("가격 데이터 없음 — fetch_all_sectors() 먼저 실행")
            return pd.DataFrame()

        periods = {"1D": 1, "5D": 5, "20D": 20, "60D": 60}
        rows = []
        for ticker in self.prices.columns:
            close = self.prices[ticker].dropna()
            if len(close) < 2:
                continue
            row = {"Ticker": ticker, "Sector": SECTOR_ETFS[ticker]}
            for label, days in periods.items():
                if len(close) > days:
                    row[label] = (close.iloc[-1] / close.iloc[-1 - days]) - 1
                else:
                    row[label] = None
            rows.append(row)

        df = pd.DataFrame(rows).set_index("Ticker")
        return df

    def get_sector_ranking(self) -> pd.DataFrame:
        returns = self.calculate_returns()
        if returns.empty or "20D" not in returns.columns:
            return pd.DataFrame()
        ranking = returns.sort_values("20D", ascending=False).copy()
        ranking.insert(0, "Rank", range(1, len(ranking) + 1))
        return ranking

    def get_rotation_signal(self) -> dict:
        returns = self.calculate_returns()
        if returns.empty or "20D" not in returns.columns:
            return {}

        def avg_return(tickers):
            vals = returns.loc[returns.index.isin(tickers), "20D"].dropna()
            return vals.mean() if len(vals) > 0 else 0

        def_ret = avg_return(DEFENSIVE)
        off_ret = avg_return(OFFENSIVE)
        spread = off_ret - def_ret

        if spread > 0.02:
            signal = "공격적 (Offensive)"
            description = "공격주가 방어주 대비 강세. 위험자산 선호 국면."
        elif spread < -0.02:
            signal = "방어적 (Defensive)"
            description = "방어주가 공격주 대비 강세. 안전자산 선호 국면."
        else:
            signal = "중립 (Neutral)"
            description = "공격주와 방어주 간 뚜렷한 차이 없음."

        result = {
            "offensive_avg_20d": round(off_ret * 100, 2),
            "defensive_avg_20d": round(def_ret * 100, 2),
            "spread": round(spread * 100, 2),
            "signal": signal,
            "description": description,
        }
        logger.info("로테이션: %s (스프레드: %.2f%%p)", signal, spread * 100)
        return result

    def get_heatmap_data(self) -> pd.DataFrame:
        returns = self.calculate_returns()
        if returns.empty:
            return pd.DataFrame()
        heatmap = returns[["Sector", "1D", "5D", "20D", "60D"]].copy()
        heatmap = heatmap.set_index("Sector")
        for col in heatmap.columns:
            heatmap[col] = (heatmap[col] * 100).round(2)
        return heatmap

    def to_heatmap_csv(self, path: str = "output/sector_heatmap.csv") -> str:
        heatmap = self.get_heatmap_data()
        if heatmap.empty:
            logger.error("히트맵 데이터 없음")
            return ""
        heatmap.to_csv(path, encoding="utf-8-sig")
        strongest = heatmap["20D"].idxmax()
        weakest = heatmap["20D"].idxmin()
        logger.info("히트맵 저장: %s (%d섹터)", path, len(heatmap))
        logger.info("최강 섹터: %s (%+.2f%%), 최약 섹터: %s (%+.2f%%)",
                     strongest, heatmap.loc[strongest, "20D"],
                     weakest, heatmap.loc[weakest, "20D"])
        return path


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    analyzer = SectorAnalyzer()
    analyzer.fetch_all_sectors(period="1y")

    # 수익률
    returns = analyzer.calculate_returns()
    print("\n📊 섹터별 수익률")
    print("=" * 70)
    for col in ["1D", "5D", "20D", "60D"]:
        returns[col] = returns[col].apply(lambda x: f"{x:+.2%}" if pd.notna(x) else "N/A")
    print(returns.to_string())

    # 순위
    print("\n📈 섹터 순위 (20일 수익률 기준)")
    print("=" * 70)
    ranking = analyzer.get_sector_ranking()
    for col in ["1D", "5D", "20D", "60D"]:
        ranking[col] = ranking[col].apply(lambda x: f"{x:+.2%}" if isinstance(x, float) else x)
    print(ranking.to_string())

    # 로테이션 시그널
    print("\n🔄 섹터 로테이션 시그널")
    print("=" * 70)
    rotation = analyzer.get_rotation_signal()
    for k, v in rotation.items():
        print(f"  {k}: {v}")

    # 히트맵
    print("\n🗺️ 섹터 수익률 히트맵 (단위: %)")
    print("=" * 70)
    heatmap = analyzer.get_heatmap_data()
    print(heatmap.to_string())
    csv_path = analyzer.to_heatmap_csv()
    print(f"\n→ {csv_path} 저장 완료")
