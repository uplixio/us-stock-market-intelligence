from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT_DIR = PROJECT_ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


class MarketRegimeDetector:
    VIX_BOUNDARIES = {
        "risk_on": (0, 16),
        "neutral": (16, 22),
        "risk_off": (22, 30),
        "crisis": (30, 999),
    }

    def __init__(self):
        self.yf_session = None
        try:
            from curl_cffi import requests as curl_requests
            self.yf_session = curl_requests.Session(impersonate="chrome")
            logger.info("curl_cffi 세션 활성화")
        except ImportError:
            pass

    def _fetch_series(self, ticker: str, period: str = "6mo") -> pd.Series | None:
        try:
            df = yf.download(ticker, period=period, progress=False, session=self.yf_session)
            if df.empty:
                logger.debug("데이터 없음: %s", ticker)
                return None
            series = df["Close"].squeeze()
            series.name = ticker
            logger.info("%s: %d일치 수집", ticker, len(series))
            return series
        except Exception:
            logger.exception("수집 실패: %s", ticker)
            return None

    def _vix_signal(self, vix_series: pd.Series) -> dict:
        current = float(vix_series.iloc[-1])

        if len(vix_series) >= 20:
            ma20 = float(vix_series.rolling(20).mean().iloc[-1])
        else:
            ma20 = current

        trend = "falling" if current < ma20 else "rising"

        regime = "crisis"
        for name, (lo, hi) in self.VIX_BOUNDARIES.items():
            if lo <= current < hi:
                regime = name
                break

        return {
            "vix_current": round(current, 2),
            "vix_ma20": round(ma20, 2),
            "vix_trend": trend,
            "vix_regime": regime,
        }

    def _trend_signal(self, spy_series: pd.Series) -> dict:
        if len(spy_series) < 200:
            return {
                "trend_regime": "neutral",
                "spy_above_50": None,
                "spy_above_200": None,
                "sma200_slope": None,
                "data_insufficient": True,
            }

        current = float(spy_series.iloc[-1])
        sma50 = float(spy_series.rolling(50).mean().iloc[-1])
        sma200 = float(spy_series.rolling(200).mean().iloc[-1])
        sma200_20ago = float(spy_series.rolling(200).mean().iloc[-21])

        slope = sma200 - sma200_20ago
        above_50 = current > sma50
        above_200 = current > sma200

        if above_50 and above_200 and slope > 0:
            regime = "risk_on"
        elif above_200:
            regime = "neutral"
        elif not above_200 and slope < 0:
            regime = "risk_off"
        else:
            regime = "neutral"

        return {
            "trend_regime": regime,
            "spy_above_50": above_50,
            "spy_above_200": above_200,
            "sma200_slope": round(slope, 4),
        }

    def _breadth_signal(self) -> dict:
        """시장 폭 신호: SPY 구성 섹터 ETF 기준 % above 200MA 근사.

        RSP/SPY 상대강도는 small vs large cap size factor로 오분류 가능.
        대신 11개 섹터 ETF 중 200MA 위에 있는 비율로 breadth를 측정한다.
        """
        fallback = {"breadth_above_200ma": None, "breadth_regime": "neutral"}
        SECTOR_ETFS = ["XLF", "XLK", "XLV", "XLE", "XLI", "XLY", "XLP", "XLU", "XLRE", "XLB", "XLC"]
        try:
            above_count = 0
            total_count = 0
            for etf in SECTOR_ETFS:
                series = self._fetch_series(etf, period="1y")
                if series is None or len(series) < 200:
                    continue
                current = float(series.iloc[-1])
                ma200 = float(series.rolling(200).mean().iloc[-1])
                if current > ma200:
                    above_count += 1
                total_count += 1

            if total_count == 0:
                return fallback

            pct_above = above_count / total_count * 100

            if pct_above >= 70:
                regime = "risk_on"
            elif pct_above >= 50:
                regime = "neutral"
            elif pct_above >= 30:
                regime = "risk_off"
            else:
                regime = "crisis"

            return {
                "breadth_above_200ma": round(pct_above, 1),
                "breadth_sectors_checked": total_count,
                "breadth_regime": regime,
            }
        except Exception:
            logger.debug("breadth 처리 실패", exc_info=True)
            return fallback

    def _credit_spread_signal(self) -> dict:
        """신용 스프레드: FRED BAMLH0A0HYM2(ICE BofA HY OAS) 우선, 없으면 HYG/IEF yield 차 근사."""
        fallback = {"credit_spread": None, "credit_regime": "neutral"}
        try:
            # 1순위: FRED BAMLH0A0HYM2 (ICE BofA US High Yield Option-Adjusted Spread)
            fred_key = os.environ.get("FRED_API_KEY")
            if fred_key:
                try:
                    import requests as req_lib
                    resp = req_lib.get(
                        "https://api.stlouisfed.org/fred/series/observations",
                        params={
                            "series_id": "BAMLH0A0HYM2",
                            "api_key": fred_key,
                            "file_type": "json",
                            "sort_order": "desc",
                            "limit": 10,
                        },
                        timeout=10,
                    )
                    resp.raise_for_status()
                    obs = [o for o in resp.json()["observations"] if o["value"] != "."]
                    if obs:
                        spread = float(obs[0]["value"])
                        # HY OAS 기준: <300 = risk_on, 300-500 = neutral, 500-700 = risk_off, >700 = crisis
                        if spread < 300:
                            regime = "risk_on"
                        elif spread < 500:
                            regime = "neutral"
                        elif spread < 700:
                            regime = "risk_off"
                        else:
                            regime = "crisis"
                        return {"credit_spread": round(spread, 1), "credit_source": "FRED_BAMLH0A0HYM2", "credit_regime": regime}
                except Exception as fred_e:
                    logger.debug("FRED BAMLH0A0HYM2 실패, fallback: %s", fred_e)

            # 2순위: HYG/IEF 가격 기반 추정 (기존 로직 유지)
            hyg = self._fetch_series("HYG", period="3mo")
            ief = self._fetch_series("IEF", period="3mo")
            if hyg is None or ief is None:
                return fallback

            ratio = (hyg / ief).dropna()
            if len(ratio) < 20:
                return fallback

            current = float(ratio.iloc[-1])
            ma20 = float(ratio.rolling(20).mean().iloc[-1])

            if current > ma20 * 1.01:
                regime = "risk_on"
            elif current > ma20 * 0.99:
                regime = "neutral"
            elif current > ma20 * 0.97:
                regime = "risk_off"
            else:
                regime = "crisis"

            return {"credit_spread": round(current, 4), "credit_source": "HYG_IEF_ratio", "credit_regime": regime}
        except Exception:
            logger.debug("credit spread 처리 실패", exc_info=True)
            return fallback

    def _yield_curve_signal(self) -> dict:
        fallback = {"yield_spread": None, "yield_regime": "neutral"}
        try:
            tnx = self._fetch_series("^TNX", period="3mo")
            irx = self._fetch_series("^IRX", period="3mo")
            if tnx is None or irx is None:
                logger.debug("^TNX/^IRX 수집 실패 — neutral 반환")
                return fallback

            spread = float(tnx.iloc[-1]) - float(irx.iloc[-1])

            if spread > 0.5:
                regime = "risk_on"
            elif spread > 0:
                regime = "neutral"
            else:
                regime = "risk_off"

            return {"yield_spread": round(spread, 2), "yield_regime": regime}
        except Exception:
            logger.debug("yield curve 처리 실패", exc_info=True)
            return fallback

    REGIME_SCORES = {"risk_on": 0, "neutral": 1, "risk_off": 2, "crisis": 3}
    SIGNAL_WEIGHTS = {
        "vix": 0.25,       # 0.30 → 0.25
        "trend": 0.22,     # 0.25 → 0.22
        "breadth": 0.18,
        "credit": 0.15,
        "yield_curve": 0.12,
        "put_call": 0.08,  # 신규 추가
    }

    def _put_call_ratio_signal(self) -> dict:
        """Put/Call Ratio 역발상 센서: 극단적 공포(>1.2) = 바닥 근처(risk_on), 극단 탐욕(<0.7) = 과열 경계(risk_off)."""
        fallback = {"pcr_value": None, "pcr_regime": "neutral"}
        try:
            # CBOE Total Put/Call Ratio (^PCALL yfinance에서 제공 안 될 수 있음)
            # 대체: CBOE Equity PCR = ^CPCE, Total PCR = ^CPCALL
            for ticker in ["^CPCE", "^CPCALL", "^PCALL"]:
                series = self._fetch_series(ticker, period="1mo")
                if series is not None and len(series) >= 5:
                    current = float(series.iloc[-1])
                    ma5 = float(series.rolling(5).mean().iloc[-1])
                    # PCR 역발상: 높은 PCR = 공포 = 역발상 매수 신호 (risk_on)
                    if current > 1.2:
                        regime = "risk_on"   # 극단적 공포 → 역발상 바닥
                    elif current > 0.9:
                        regime = "neutral"
                    elif current > 0.7:
                        regime = "risk_off"
                    else:
                        regime = "risk_off"  # 극단적 탐욕(<0.7) = 과열 경계 신호
                    return {"pcr_value": round(current, 3), "pcr_ma5": round(ma5, 3), "pcr_regime": regime, "pcr_source": ticker}
            logger.debug("PCR 데이터 없음 — neutral 반환")
            return fallback
        except Exception:
            logger.debug("put/call ratio 처리 실패", exc_info=True)
            return fallback

    def detect(self) -> dict:
        # 1. 데이터 수집
        vix_series = self._fetch_series("^VIX", period="3mo")
        spy_series = self._fetch_series("SPY", period="1y")

        # 2. 6개 신호 수집
        signals = {}
        signals["vix"] = self._vix_signal(vix_series) if vix_series is not None else {"vix_regime": "neutral"}
        signals["trend"] = self._trend_signal(spy_series) if spy_series is not None else {"trend_regime": "neutral"}
        signals["breadth"] = self._breadth_signal()
        signals["credit"] = self._credit_spread_signal()
        signals["yield_curve"] = self._yield_curve_signal()
        signals["put_call"] = self._put_call_ratio_signal()

        # 3. 점수 계산
        regimes = {
            "vix": signals["vix"].get("vix_regime", "neutral"),
            "trend": signals["trend"].get("trend_regime", "neutral"),
            "breadth": signals["breadth"].get("breadth_regime", "neutral"),
            "credit": signals["credit"].get("credit_regime", "neutral"),
            "yield_curve": signals["yield_curve"].get("yield_regime", "neutral"),
            "put_call": signals["put_call"].get("pcr_regime", "neutral"),
        }

        # 4. 가중 합산
        weighted_score = sum(
            self.REGIME_SCORES[regimes[k]] * self.SIGNAL_WEIGHTS[k]
            for k in self.SIGNAL_WEIGHTS
        )

        # 5. 최종 체제
        if weighted_score < 0.75:
            final_regime = "risk_on"
        elif weighted_score < 1.5:
            final_regime = "neutral"
        elif weighted_score < 2.25:
            final_regime = "risk_off"
        else:
            final_regime = "crisis"

        # 6. Confidence — 가중 점수의 분산 기반 (낮을수록 일치도 높음)
        # max_variance = 3^2 = 9 (0=risk_on, 3=crisis 간 최대 분산)
        scores_list = [self.REGIME_SCORES[regimes[k]] for k in self.SIGNAL_WEIGHTS]
        weights_list = [self.SIGNAL_WEIGHTS[k] for k in self.SIGNAL_WEIGHTS]
        weighted_mean = weighted_score  # 이미 계산됨
        weighted_var = sum(
            w * (s - weighted_mean) ** 2
            for s, w in zip(scores_list, weights_list)
        )
        max_possible_var = 9.0  # 0과 3의 최대 분산
        confidence = round((1 - weighted_var / max_possible_var) * 100, 1)
        confidence = max(0.0, min(100.0, confidence))  # 0~100 클램핑

        result = {
            "final_regime": final_regime,
            "weighted_score": round(weighted_score, 3),
            "confidence": confidence,
            "signals": regimes,
            "details": signals,
        }

        logger.info("최종 체제: %s (점수: %.3f, 신뢰도: %.1f%%)", final_regime, weighted_score, confidence)
        return result

    ADAPTIVE_PARAMS = {
        "risk_on": {"stop_loss": -0.10, "max_drawdown_warning": -0.12},
        "neutral": {"stop_loss": -0.08, "max_drawdown_warning": -0.10},
        "risk_off": {"stop_loss": -0.05, "max_drawdown_warning": -0.07},
        "crisis": {"stop_loss": -0.03, "max_drawdown_warning": -0.05},
    }

    def save_config(self, result: dict, filename: str = "regime_config.json"):
        regime = result["final_regime"]
        params = self.ADAPTIVE_PARAMS[regime]
        config = {
            "regime": regime,
            "weighted_score": result["weighted_score"],
            "confidence": result["confidence"],
            "signals": result["signals"],
            "adaptive_params": {
                "stop_loss": f"{params['stop_loss']:.0%}",
                "max_drawdown_warning": f"{params['max_drawdown_warning']:.0%}",
            },
        }
        path = OUTPUT_DIR / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2, default=str)
        logger.info("설정 저장: %s (stop_loss=%s, mdd=%s)",
                     path, config["adaptive_params"]["stop_loss"],
                     config["adaptive_params"]["max_drawdown_warning"])
        return str(path)

    def save_result(self, result: dict, filename: str = "regime_result.json"):
        path = OUTPUT_DIR / filename
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2, default=str)
        logger.info("결과 저장: %s", path)
        try:
            from db import data_store as _ds
            _conn = _ds.get_db()
            _ds.upsert_regime_snapshot(_conn, result)
            _conn.close()
        except Exception as _e:
            logger.warning("SQLite regime 쓰기 실패: %s", _e)
        return str(path)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    detector = MarketRegimeDetector()
    result = detector.detect()

    print(f"\n최종 체제: {result['final_regime']}")
    print(f"가중 점수: {result['weighted_score']}")
    print(f"신뢰도: {result['confidence']}%")
    print(f"\n개별 신호:")
    for name, regime in result["signals"].items():
        print(f"  {name}: {regime}")

    detector.save_result(result)
    detector.save_config(result)

    # 적응형 파라미터 출력
    params = detector.ADAPTIVE_PARAMS[result["final_regime"]]
    print(f"\n적응형 파라미터:")
    print(f"  stop_loss: {params['stop_loss']:.0%}")
    print(f"  max_drawdown_warning: {params['max_drawdown_warning']:.0%}")
