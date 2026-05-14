"""Part 6 — 포트폴리오 리스크 알림 시스템.

market_regime(체제) + market_gate(신호) + verdict(판정)를 읽어서
포지션 사이징, stop-loss, VaR, 집중도를 자동 판단하고,
대시보드 + 텔레그램으로 알려주는 방어 레이어.
"""

from __future__ import annotations

import glob
import json
import sqlite3
import logging
import shutil
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

# curl_cffi 세션 (yfinance rate-limit 우회)
_yf_session = None
try:
    from curl_cffi import requests as curl_requests
    _yf_session = curl_requests.Session(impersonate="chrome")
except ImportError:
    pass


class RiskAlertSystem:
    """포트폴리오 리스크를 모니터링하고 알림을 생성한다."""

    # 포지션 사이징용 regime 배수
    REGIME_RISK_MULTIPLIER = {
        "risk_on": 1.0,
        "neutral": 0.8,
        "risk_off": 0.5,
        "crisis": 0.3,
    }

    # VaR regime 보정 배수
    REGIME_VAR_MULTIPLIER = {
        "risk_on": 0.8,
        "neutral": 1.0,
        "risk_off": 1.2,
        "crisis": 1.5,
    }

    # 리스크 예산 한도
    RISK_BUDGET = {
        "max_portfolio_var_pct": 5.0,
        "max_single_position_pct": 15.0,
        "max_sector_pct": 35.0,  # 35%로 낮춤 (기존 40%는 실제 포트폴리오에서 거의 미발동)
        "max_correlation_exposure": 3,
    }

    # Grade별 포지션 조정 배수
    GRADE_MULTIPLIER = {
        "A": 1.2,
        "B": 1.0,
        "C": 0.7,
        "D": 0.4,
        "E": 0.0,
        "F": 0.0,
    }

    # 11개 SPDR 섹터 ETF
    SECTOR_MAP = {
        "XLK": "Technology",
        "XLF": "Financials",
        "XLV": "Healthcare",
        "XLE": "Energy",
        "XLI": "Industrials",
        "XLY": "Consumer Discretionary",
        "XLP": "Consumer Staples",
        "XLU": "Utilities",
        "XLRE": "Real Estate",
        "XLB": "Materials",
        "XLC": "Communication",
    }

    def __init__(self, data_dir: str = "."):
        self.data_dir = Path(data_dir)
        self.OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output"
        self.OUTPUT_DIR.mkdir(exist_ok=True)
        self.output_file = self.OUTPUT_DIR / "risk_alerts.json"
        self.regime_config = self._load_regime_config()
        self.verdict_data = self._load_verdict()
        self.ai_summaries = self._load_ai_summaries()
        self.index_prediction = self._load_index_prediction()
        self._sector_cache: dict[str, str] = {}
        logger.info(
            "RiskAlertSystem initialized: regime=%s, verdict=%s, ai_summaries=%d종목",
            self.regime_config.get("regime"),
            self.verdict_data.get("verdict"),
            len(self.ai_summaries),
        )

    # ------------------------------------------------------------------
    # _load 메서드 (프롬프트 #1)
    # ------------------------------------------------------------------

    def _load_regime_config(self) -> dict:
        """data_regime_snapshot SQLite 우선 → regime_config.json fallback.
        adaptive_params.stop_loss 문자열("-8%") → float(-0.08) 파싱.
        """
        defaults = {
            "regime": "neutral",
            "adaptive_params": {
                "stop_loss": -0.08,
                "max_drawdown_warning": -0.10,
            },
        }

        def _parse_ap(data: dict) -> dict:
            ap = data.get("adaptive_params", {})
            for key in ("stop_loss", "max_drawdown_warning"):
                val = ap.get(key)
                if isinstance(val, str):
                    ap[key] = float(val.replace("%", "")) / 100.0
            data["adaptive_params"] = ap
            return data

        # 1) SQLite: data_regime_snapshot id=1
        conn = self._get_db_connection()
        if conn is not None:
            try:
                row = conn.execute(
                    "SELECT data_json FROM data_regime_snapshot WHERE id=1"
                ).fetchone()
                if row:
                    return _parse_ap(json.loads(row["data_json"]))
            except Exception as e:
                logger.debug("regime_config SQLite 로드 실패: %s", e)
            finally:
                conn.close()

        # 2) JSON fallback
        config_file = self.OUTPUT_DIR / "regime_config.json"
        if not config_file.exists():
            logger.debug("regime_config.json 없음 — 기본값 사용")
            return defaults
        try:
            with open(config_file) as f:
                return _parse_ap(json.load(f))
        except Exception as e:
            logger.warning("regime_config 로드 실패: %s — 기본값 사용", e)
            return defaults

    def _load_verdict(self) -> dict:
        """data_daily_reports SQLite 우선 (최신 행) → latest_report.json fallback."""
        defaults = {"verdict": "CAUTION", "market_timing": {}}

        # 1) SQLite: data_daily_reports 최신 행
        conn = self._get_db_connection()
        if conn is not None:
            try:
                row = conn.execute(
                    "SELECT verdict, data_json FROM data_daily_reports "
                    "ORDER BY date DESC LIMIT 1"
                ).fetchone()
                if row:
                    data = json.loads(row["data_json"])
                    return {
                        "verdict": data.get("verdict", row["verdict"] or "CAUTION"),
                        "market_timing": data.get("market_timing", {}),
                    }
            except Exception as e:
                logger.debug("verdict SQLite 로드 실패: %s", e)
            finally:
                conn.close()

        # 2) JSON fallback
        latest = self.OUTPUT_DIR / "reports" / "latest_report.json"
        if not latest.exists():
            logger.debug("latest_report.json 없음 — 기본값 사용")
            return defaults
        try:
            with open(latest) as f:
                data = json.load(f)
            return {
                "verdict": data.get("verdict", "CAUTION"),
                "market_timing": data.get("market_timing", {}),
            }
        except Exception as e:
            logger.warning("latest_report 로드 실패: %s", e)
            return defaults

    def _load_index_prediction(self) -> dict:
        """data_index_prediction SQLite 우선 (id=1) → index_prediction.json fallback."""
        # 1) SQLite
        conn = self._get_db_connection()
        if conn is not None:
            try:
                row = conn.execute(
                    "SELECT data_json FROM data_index_prediction WHERE id=1"
                ).fetchone()
                if row:
                    return json.loads(row["data_json"])
            except Exception as e:
                logger.debug("index_prediction SQLite 로드 실패: %s", e)
            finally:
                conn.close()
        # 2) JSON fallback
        pred_file = self.OUTPUT_DIR / "index_prediction.json"
        if not pred_file.exists():
            return {}
        try:
            with open(pred_file) as f:
                return json.load(f)
        except Exception as e:
            logger.warning("index_prediction 로드 실패: %s", e)
            return {}

    def _get_db_connection(self):
        """output/data.db SQLite 연결 반환. 파일 없으면 None."""
        db_path = self.OUTPUT_DIR / "data.db"
        if not db_path.exists():
            return None
        try:
            conn = sqlite3.connect(str(db_path), check_same_thread=False)
            conn.row_factory = sqlite3.Row
            return conn
        except Exception as e:
            logger.debug("DB 연결 실패: %s", e)
            return None

    def _load_ai_summaries(self) -> dict:
        """data_ai_summaries SQLite 전체 로드 → {ticker: data_dict}.
        Part 4(ai_summary_generator)가 저장한 데이터를 ai_sell 알림에 활용.
        Part 4 미실행 시 빈 dict 반환 (정상).
        """
        conn = self._get_db_connection()
        if conn is None:
            return {}
        try:
            rows = conn.execute(
                "SELECT ticker, recommendation, confidence, data_json "
                "FROM data_ai_summaries"
            ).fetchall()
            result: dict = {}
            for row in rows:
                try:
                    d = json.loads(row["data_json"])
                except Exception:
                    d = {}
                # scalar 컬럼 우선 (data_json에 누락 시 fallback)
                d.setdefault("recommendation", row["recommendation"] or "")
                d.setdefault("confidence", row["confidence"] or 0)
                result[row["ticker"]] = d
            return result
        except Exception as e:
            logger.debug("ai_summaries SQLite 로드 실패: %s", e)
            return {}
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # 종목 로드 (프롬프트 #2)
    # ------------------------------------------------------------------

    def load_picks(self) -> list[dict]:
        """스마트 머니 picks CSV 로드 + entry_price/sector 보강."""
        # CSV 우선순위: dated picks → v2
        picks_dir = self.OUTPUT_DIR / "picks"
        csv_path = None

        if picks_dir.exists():
            dated = sorted(picks_dir.glob("smart_money_picks_*.csv"))
            if dated:
                csv_path = dated[-1]

        if csv_path is None:
            v2 = self.OUTPUT_DIR / "smart_money_picks_v2.csv"
            if v2.exists():
                csv_path = v2

        if csv_path is None:
            logger.warning("picks CSV 없음")
            return []

        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            logger.error("CSV 로드 실패: %s", e)
            return []

        df = df.head(20)

        # performance.json에서 buy_price 조회
        perf_prices = self._load_performance_prices()

        picks = []
        for _, row in df.iterrows():
            ticker = row.get("ticker", "")
            entry_price = perf_prices.get(ticker, 0.0)
            current_price = 0.0

            # current_price는 항상 fetch. entry_price가 없으면 0으로 유지 (stop-loss 스킵)
            try:
                t = yf.Ticker(ticker, session=_yf_session)
                hist = t.history(period="5d")
                if not hist.empty:
                    current_price = float(hist["Close"].iloc[-1])
                    # entry_price를 current_price로 대체하지 않음:
                    # entry == current이면 from_entry_pct = 0% → stop-loss 계산이 무의미
            except Exception as e:
                logger.debug("price fetch 실패 (%s): %s", ticker, e)

            # sector 확보
            sector = self._get_sector(ticker)

            picks.append({
                "ticker": ticker,
                "company_name": row.get("company_name", ""),
                "grade": row.get("grade", "C"),
                "strategy": row.get("strategy", ""),
                "setup": row.get("setup", ""),
                "composite_score": float(row.get("composite_score", 0)),
                "entry_price": round(entry_price, 2),
                "sector": sector,
                "current_price": round(current_price, 2),
            })

        logger.info("picks 로드: %d종목 (%s)", len(picks), csv_path.name)
        return picks

    def _load_performance_prices(self) -> dict[str, float]:
        """performance.json에서 ticker→buy_price 매핑."""
        perf_file = self.OUTPUT_DIR.parent / "frontend" / "public" / "data" / "performance.json"
        if not perf_file.exists():
            perf_file = self.OUTPUT_DIR / "performance.json"
        if not perf_file.exists():
            return {}
        try:
            with open(perf_file) as f:
                data = json.load(f)
            prices = {}
            for portfolio in data.get("portfolios", []):
                for h in portfolio.get("holdings", []):
                    t = h.get("ticker", "")
                    if t and t not in prices:
                        prices[t] = float(h.get("buy_price", 0))
            return prices
        except Exception:
            return {}

    def _get_sector(self, ticker: str) -> str:
        if ticker in self._sector_cache:
            return self._sector_cache[ticker]
        try:
            info = yf.Ticker(ticker, session=_yf_session).info
            sector = info.get("sector", "Unknown")
        except Exception:
            sector = "Unknown"
        self._sector_cache[ticker] = sector
        return sector

    # ------------------------------------------------------------------
    # Drawdown 계산 (프롬프트 #3)
    # ------------------------------------------------------------------

    def calculate_drawdowns(self, picks: list[dict], period: str = "3mo") -> dict:
        """각 종목의 drawdown 계산 (fixed + trailing).

        trailing stop은 가격이 오를수록 같이 올라가서 수익을 보호한다.
        예: 100에 매수 -> 120까지 상승 -> trailing stop -5%면 114에서 매도.
        fixed stop은 진입가 100 기준 -8%면 92에서 매도.
        """
        if not picks:
            return {}

        tickers = [p["ticker"] for p in picks]
        entry_map = {p["ticker"]: p["entry_price"] for p in picks}

        try:
            data = yf.download(tickers, period=period, progress=False, session=_yf_session)
        except Exception as e:
            logger.error("drawdown 가격 다운로드 실패: %s", e)
            return {}

        # 단일 종목이면 columns이 다름
        if len(tickers) == 1:
            close = data["Close"].to_frame(tickers[0]) if "Close" in data.columns else pd.DataFrame()
        else:
            close = data["Close"] if "Close" in data.columns.get_level_values(0) else pd.DataFrame()

        result = {}
        for ticker in tickers:
            try:
                if ticker not in close.columns:
                    continue
                series = close[ticker].dropna()
                if series.empty:
                    continue

                current_price = float(series.iloc[-1])
                peak_price = float(series.cummax().iloc[-1])
                entry_price = entry_map.get(ticker, 0.0)

                # from_entry_pct
                from_entry_pct = None
                if entry_price > 0:
                    from_entry_pct = round((current_price / entry_price - 1) * 100, 2)

                # from_peak_pct
                if peak_price <= 0:
                    continue
                from_peak_pct = round((current_price / peak_price - 1) * 100, 2)

                # max_dd: 기간 내 최대 낙폭
                cummax = series.cummax()
                dd_series = (series - cummax) / cummax * 100
                max_dd = round(float(dd_series.min()), 2)

                # from_peak_days
                peak_idx = series.idxmax()
                from_peak_days = (series.index[-1] - peak_idx).days

                result[ticker] = {
                    "current_price": round(current_price, 2),
                    "peak_price": round(peak_price, 2),
                    "entry_price": round(entry_price, 2),
                    "from_entry_pct": from_entry_pct,
                    "from_peak_pct": from_peak_pct,
                    "max_dd": max_dd,
                    "from_peak_days": int(from_peak_days),
                }
            except Exception as e:
                logger.debug("drawdown 계산 실패 (%s): %s", ticker, e)

        return result

    # ------------------------------------------------------------------
    # Stop-Loss 체크 (프롬프트 #4)
    # ------------------------------------------------------------------

    def check_stop_losses(self, picks: list[dict], drawdowns: dict) -> list[dict]:
        """regime-adaptive dual stop-loss 체크.

        fixed_threshold: regime adaptive_params.stop_loss
        trailing_threshold: fixed의 절반 (수익 구간이므로 더 타이트)
        """
        ap = self.regime_config.get("adaptive_params", {})
        fixed_threshold = ap.get("stop_loss", -0.08) * 100  # -8 (%)
        trailing_threshold = fixed_threshold / 2  # -4 (%)
        regime = self.regime_config.get("regime", "neutral")

        result = []
        for pick in picks:
            ticker = pick["ticker"]
            entry_price = pick.get("entry_price", 0)
            if entry_price == 0:
                continue

            dd = drawdowns.get(ticker)
            if not dd:
                continue

            from_entry_pct = dd.get("from_entry_pct")
            from_peak_pct = dd.get("from_peak_pct", 0)

            # Fixed stop 판정
            if from_entry_pct is not None and from_entry_pct <= fixed_threshold:
                fixed_status = "BREACHED"
            elif from_entry_pct is not None and from_entry_pct <= fixed_threshold + 2:
                fixed_status = "WARNING"
            else:
                fixed_status = "OK"

            # Trailing stop 판정
            if from_peak_pct <= trailing_threshold:
                trailing_status = "BREACHED"
            elif from_peak_pct <= trailing_threshold + 2:
                trailing_status = "WARNING"
            else:
                trailing_status = "OK"

            # 가장 심각한 상태
            severity = {"BREACHED": 2, "WARNING": 1, "OK": 0}
            alert_level = max(
                [fixed_status, trailing_status],
                key=lambda s: severity.get(s, 0),
            )

            result.append({
                "ticker": ticker,
                "company_name": pick.get("company_name", ""),
                "entry_price": entry_price,
                "peak_price": dd.get("peak_price", 0),
                "current_price": dd.get("current_price", 0),
                "from_entry_pct": from_entry_pct,
                "from_peak_pct": from_peak_pct,
                "fixed_threshold": round(fixed_threshold, 2),
                "trailing_threshold": round(trailing_threshold, 2),
                "fixed_status": fixed_status,
                "trailing_status": trailing_status,
                "regime": regime,
                "alert_level": alert_level,
            })

        return result

    # ------------------------------------------------------------------
    # VaR/CVaR 계산 (프롬프트 #5)
    # ------------------------------------------------------------------

    def calculate_portfolio_var(
        self,
        tickers: list[str],
        confidence: float = 0.95,
        horizon_days: int = 5,
        portfolio_value: float = 100_000,
    ) -> dict:
        """Historical + Student-t VaR/CVaR, regime 보정 포함."""
        if not tickers:
            return {}

        try:
            data = yf.download(tickers, period="6mo", progress=False, session=_yf_session)
        except Exception as e:
            logger.error("VaR 가격 다운로드 실패: %s", e)
            return {}

        # 수익률 계산
        if len(tickers) == 1:
            close = data["Close"]
            returns = close.pct_change().dropna()
        else:
            close = data["Close"]
            returns = close.pct_change().dropna().mean(axis=1)

        if returns.empty:
            return {}

        # horizon 조정
        if horizon_days > 1:
            horizon_returns = returns.rolling(horizon_days).sum().dropna()
        else:
            horizon_returns = returns

        if horizon_returns.empty:
            return {}

        # Historical VaR
        var_pct = float(np.percentile(horizon_returns, (1 - confidence) * 100))
        cvar_mask = horizon_returns <= var_pct
        cvar_pct = float(horizon_returns[cvar_mask].mean()) if cvar_mask.any() else var_pct

        # Student-t VaR
        t_var_pct = None
        df_t = None
        try:
            from scipy.stats import t as t_dist
            params = t_dist.fit(horizon_returns)
            df_t, loc, scale = params
            t_var_pct = float(t_dist.ppf(1 - confidence, df_t, loc=loc, scale=scale))
        except ImportError:
            pass
        except Exception as e:
            logger.debug("Student-t VaR 실패: %s", e)

        # Regime 보정
        regime = self.regime_config.get("regime", "neutral")
        multiplier = self.REGIME_VAR_MULTIPLIER.get(regime, 1.0)
        regime_adjusted_var_pct = var_pct * multiplier

        var_dollar = abs(var_pct) * portfolio_value
        cvar_dollar = abs(cvar_pct) * portfolio_value
        regime_adjusted_var_dollar = abs(regime_adjusted_var_pct) * portfolio_value
        t_var_dollar = abs(t_var_pct) * portfolio_value if t_var_pct is not None else None

        risk_budget_usage_pct = regime_adjusted_var_dollar / portfolio_value * 100

        return {
            "var_pct": round(var_pct * 100, 2),
            "var_dollar": round(var_dollar, 0),
            "cvar_pct": round(cvar_pct * 100, 2),
            "cvar_dollar": round(cvar_dollar, 0),
            "t_var_dollar": round(t_var_dollar, 0) if t_var_dollar else None,
            "regime_adjusted_var_pct": round(regime_adjusted_var_pct * 100, 2),
            "regime_adjusted_var_dollar": round(regime_adjusted_var_dollar, 0),
            "risk_budget_usage_pct": round(risk_budget_usage_pct, 2),
            "confidence": confidence,
            "horizon_days": horizon_days,
            "degrees_of_freedom": round(df_t, 2) if df_t else None,
            "regime": regime,
        }

    # ------------------------------------------------------------------
    # 리스크 예산 체크 (프롬프트 #6)
    # ------------------------------------------------------------------

    def check_risk_budget(
        self,
        picks: list[dict],
        portfolio_value: float = 100_000,
        var_result: dict | None = None,
        position_sizes: list[dict] | None = None,
    ) -> dict:
        """포트폴리오 전체 리스크 예산 한도 체크.

        Args:
            var_result: 이미 계산된 VaR 결과. None이면 내부에서 계산.
            position_sizes: 이미 계산된 포지션 사이즈. None이면 1/N 가정.
        """
        reasons = []
        details = {}

        # VaR 체크 (이미 계산된 결과 재사용)
        if var_result is None:
            tickers = [p["ticker"] for p in picks]
            var_result = self.calculate_portfolio_var(tickers, portfolio_value=portfolio_value)
        var_usage = var_result.get("risk_budget_usage_pct", 0)
        details["var_usage_pct"] = var_usage

        if var_usage > self.RISK_BUDGET["max_portfolio_var_pct"]:
            reasons.append(
                f"VaR {var_usage:.1f}% > 한도 {self.RISK_BUDGET['max_portfolio_var_pct']:.1f}%"
            )

        # 실제 포지션 사이즈에서 최대 비중 확인
        max_pos_pct = 0.0
        if position_sizes:
            for ps in position_sizes:
                if ps.get("ticker") != "CASH":
                    max_pos_pct = max(max_pos_pct, ps.get("final_pct", 0))
        else:
            total = len(picks) or 1
            max_pos_pct = round(100 / total, 1) if total > 0 else 0
        details["max_position_pct"] = round(max_pos_pct, 1)

        # 섹터 비중 체크
        sector_counts: dict[str, int] = {}
        total = len(picks) or 1
        for p in picks:
            s = p.get("sector", "Unknown")
            if s != "Unknown":
                sector_counts[s] = sector_counts.get(s, 0) + 1

        max_sector_pct = 0.0
        for s, cnt in sector_counts.items():
            pct = cnt / total * 100
            if pct > max_sector_pct:
                max_sector_pct = pct
            if pct >= 35.0:  # Warn when any sector >= 35% (was >40%, never triggered)
                reasons.append(f"{s} 섹터 {pct:.0f}% >= 한도 {self.RISK_BUDGET['max_sector_pct']:.0f}%")

        details["max_sector_pct"] = round(max_sector_pct, 1)

        # 판정
        exceeded = (
            var_usage > self.RISK_BUDGET["max_portfolio_var_pct"]
            or max_pos_pct > self.RISK_BUDGET["max_single_position_pct"] + 5  # 15% + 5% 여유 = 20%
        )
        warning = (
            var_usage > self.RISK_BUDGET["max_portfolio_var_pct"] * 0.8
            or max_sector_pct > self.RISK_BUDGET["max_sector_pct"]
            or max_pos_pct > self.RISK_BUDGET["max_single_position_pct"]
        )

        if exceeded:
            status = "EXCEEDED"
        elif warning:
            status = "WARNING"
        else:
            status = "OK"

        return {
            "budget_status": status,
            "reasons": reasons,
            "details": details,
        }

    # ------------------------------------------------------------------
    # 포지션 사이징 (프롬프트 #7)
    # ------------------------------------------------------------------

    def calculate_position_sizes(
        self,
        picks: list[dict],
        portfolio_value: float = 100_000,
    ) -> list[dict]:
        """3단계 포지션 사이징: Grade → Regime → Verdict 오버라이드."""
        if not picks:
            return []

        n = len(picks)
        base_pct = 100.0 / n
        regime = self.regime_config.get("regime", "neutral")
        regime_mult = self.REGIME_RISK_MULTIPLIER.get(regime, 0.8)
        verdict = self.verdict_data.get("verdict", "CAUTION")

        result = []
        for pick in picks:
            grade = pick.get("grade", "C")
            grade_mult = self.GRADE_MULTIPLIER.get(grade, 0.7)

            adjusted = base_pct * grade_mult * regime_mult
            result.append({
                "ticker": pick["ticker"],
                "company_name": pick.get("company_name", ""),
                "grade": grade,
                "base_pct": round(base_pct, 2),
                "grade_multiplier": grade_mult,
                "regime_multiplier": regime_mult,
                "verdict_cap": None,
                "raw_pct": adjusted,
                "final_pct": 0,
                "dollar_amount": 0,
            })

        # Verdict 오버라이드
        if verdict == "STOP":
            for r in result:
                r["raw_pct"] = 0
                r["verdict_cap"] = "0% (STOP)"
        elif verdict == "CAUTION":
            total = sum(r["raw_pct"] for r in result)
            if total > 50:
                scale = 50 / total
                for r in result:
                    r["raw_pct"] *= scale
                    r["verdict_cap"] = "50% cap"
        else:
            for r in result:
                r["verdict_cap"] = "none"

        # 정규화 (100% 초과 방지)
        total = sum(r["raw_pct"] for r in result)
        if total > 100:
            scale = 100 / total
            for r in result:
                r["raw_pct"] *= scale

        for r in result:
            r["final_pct"] = round(r["raw_pct"], 1)
            r["dollar_amount"] = round(portfolio_value * r["final_pct"] / 100, 0)
            del r["raw_pct"]

        # 반올림 후 합계가 cap을 초과하면 큰 포지션부터 보정
        invested = round(sum(r["final_pct"] for r in result), 1)
        if verdict == "CAUTION" and invested > 50:
            diff = round(invested - 50, 1)
            # 큰 포지션부터 조정 (음수 방지)
            sorted_pos = sorted(result, key=lambda x: x["final_pct"], reverse=True)
            for r in sorted_pos:
                if r["final_pct"] > 0 and diff > 0:
                    adj = min(diff, r["final_pct"])
                    r["final_pct"] = round(r["final_pct"] - adj, 1)
                    r["dollar_amount"] = round(portfolio_value * r["final_pct"] / 100, 0)
                    diff = round(diff - adj, 1)
            invested = round(sum(r["final_pct"] for r in result), 1)
        cash_pct = round(100 - invested, 1)
        cash_dollar = round(portfolio_value * cash_pct / 100, 0)

        result.append({
            "ticker": "CASH",
            "company_name": "",
            "grade": "",
            "base_pct": 0,
            "grade_multiplier": 0,
            "regime_multiplier": 0,
            "verdict_cap": "",
            "final_pct": cash_pct,
            "dollar_amount": cash_dollar,
        })

        return result

    # ------------------------------------------------------------------
    # 집중도 + 상관관계 (프롬프트 #8)
    # ------------------------------------------------------------------

    def analyze_concentration_risk(self, picks: list[dict]) -> dict:
        """섹터 집중도 + 상관관계 분석."""
        # 섹터 집중도
        sector_counts: dict[str, list[str]] = {}
        total = 0
        for p in picks:
            s = p.get("sector", "Unknown")
            if s == "Unknown":
                continue
            sector_counts.setdefault(s, []).append(p["ticker"])
            total += 1

        sector_concentration = {}
        concentration_warnings = []
        for s, tickers in sector_counts.items():
            pct = len(tickers) / total * 100 if total > 0 else 0
            sector_concentration[s] = {"count": len(tickers), "pct": round(pct, 1)}
            if pct >= 35.0:  # Warn when any sector >= 35% (was >40%, never triggered)
                concentration_warnings.append(
                    f"{s} {pct:.0f}% >= 한도 {self.RISK_BUDGET['max_sector_pct']:.0f}%"
                )

        # 상관관계
        regime = self.regime_config.get("regime", "neutral")
        corr_threshold = 0.70 if regime == "crisis" else 0.80

        high_correlation_pairs = []
        correlation_exposure: dict[str, int] = {}
        tickers = [p["ticker"] for p in picks]

        if len(tickers) >= 2:
            try:
                data = yf.download(tickers, period="3mo", progress=False, session=_yf_session)
                if len(tickers) == 1:
                    close = data["Close"].to_frame(tickers[0])
                else:
                    close = data["Close"]

                returns = close.pct_change().dropna()
                corr_matrix = returns.corr()

                for i in range(len(tickers)):
                    for j in range(i + 1, len(tickers)):
                        t1, t2 = tickers[i], tickers[j]
                        if t1 in corr_matrix.columns and t2 in corr_matrix.columns:
                            c = corr_matrix.loc[t1, t2]
                            if abs(c) > corr_threshold:
                                high_correlation_pairs.append({
                                    "pair": [t1, t2],
                                    "corr": round(float(c), 3),
                                })
                                correlation_exposure[t1] = correlation_exposure.get(t1, 0) + 1
                                correlation_exposure[t2] = correlation_exposure.get(t2, 0) + 1

            except Exception as e:
                logger.debug("상관관계 분석 실패: %s", e)

        # 2쌍 이상만 필터
        correlation_exposure = {k: v for k, v in correlation_exposure.items() if v >= 2}

        return {
            "sector_concentration": sector_concentration,
            "concentration_warnings": concentration_warnings,
            "high_correlation_pairs": high_correlation_pairs,
            "correlation_exposure": correlation_exposure,
            "correlation_threshold": corr_threshold,
        }

    # ------------------------------------------------------------------
    # Component VaR — Euler 분해 (Phase B)
    # ------------------------------------------------------------------

    def calculate_component_var(
        self,
        picks: list[dict],
        position_sizes: list[dict],
        portfolio_value: float = 100_000,
        confidence: float = 0.95,
        horizon_days: int = 5,
    ) -> list[dict]:
        """종목별 리스크 기여도 분해 (Component VaR). Euler 분해 사용."""
        Z_SCORE = {0.90: 1.282, 0.95: 1.645, 0.99: 2.326}
        z = Z_SCORE.get(confidence, 1.645)

        weight_map = {
            p["ticker"]: p["final_pct"] / 100
            for p in position_sizes
            if p["ticker"] != "CASH" and p["final_pct"] > 0
        }
        active = [p["ticker"] for p in picks if p["ticker"] in weight_map]
        if len(active) < 2:
            return []

        try:
            raw = yf.download(active, period="1y", progress=False, session=_yf_session)
            if raw.empty:
                return []

            close = raw["Close"]
            if isinstance(close, pd.Series):
                return []  # 단일 ticker 는 공분산 불가

            available = [t for t in active if t in close.columns]
            if len(available) < 2:
                return []
            close = close[available].dropna(how="all")
            active = list(close.columns)

            returns = close.pct_change().dropna()
            if len(returns) < 20:
                return []

            cov = returns.cov().values          # (N×N) 일별 공분산
            w = np.array([weight_map.get(t, 0.0) for t in active])

            port_var = float(w @ cov @ w)
            port_std = float(np.sqrt(port_var))
            if port_std == 0:
                return []

            # Euler 분해: Component VaR_i = w_i * (Σw)_i / σ_p * z * √horizon
            sigma_w = cov @ w          # (N,)
            scale = float(np.sqrt(horizon_days))
            comp_std = w * sigma_w / port_std  # σ 기여 (합 = σ_p)

            results = []
            for i, ticker in enumerate(active):
                cvar_pct = float(comp_std[i]) * z * scale * 100
                cvar_dollar = float(comp_std[i]) * z * scale * portfolio_value
                contrib_pct = float(comp_std[i] / port_std) * 100
                marginal = float(sigma_w[i] / port_std) * z * scale * 100

                results.append({
                    "ticker": ticker,
                    "weight_pct": round(weight_map.get(ticker, 0.0) * 100, 2),
                    "component_var_pct": round(cvar_pct, 3),
                    "component_var_dollar": round(cvar_dollar, 2),
                    "contribution_pct": round(contrib_pct, 1),
                    "marginal_var": round(marginal, 3),
                })

            results.sort(key=lambda x: x["contribution_pct"], reverse=True)
            return results

        except Exception as e:
            logger.debug("Component VaR 계산 실패: %s", e)
            return []

    # ------------------------------------------------------------------
    # 스트레스 테스트 — 2008 / 2020 / 2022 시나리오 (Phase B)
    # ------------------------------------------------------------------

    def calculate_stress_scenarios(self, picks: list[dict]) -> list[dict]:
        """2008 리먼 / 2020 COVID / 2022 금리충격 역사적 시나리오."""
        SCENARIOS = [
            {"name": "2008 금융위기", "label": "Lehman",    "start": "2008-09-01", "end": "2009-03-31", "color": "error"},
            {"name": "2020 COVID 급락", "label": "COVID",   "start": "2020-02-20", "end": "2020-03-23", "color": "secondary"},
            {"name": "2022 금리충격", "label": "Rate Shock","start": "2022-01-01", "end": "2022-10-31", "color": "warning"},
        ]
        tickers = [p["ticker"] for p in picks]
        if not tickers:
            return []

        results = []
        for sc in SCENARIOS:
            try:
                raw = yf.download(
                    tickers, start=sc["start"], end=sc["end"],
                    progress=False, session=_yf_session,
                )
                if raw.empty:
                    continue

                close = raw["Close"]
                if isinstance(close, pd.Series):
                    close = close.to_frame(name=tickers[0])

                ticker_returns: dict[str, float] = {}
                for t in tickers:
                    if t not in close.columns:
                        continue
                    col = close[t].dropna()
                    if len(col) >= 2 and float(col.iloc[0]) > 0:
                        ret = (float(col.iloc[-1]) - float(col.iloc[0])) / float(col.iloc[0]) * 100
                        ticker_returns[t] = round(ret, 2)

                if not ticker_returns:
                    continue

                avg_return = sum(ticker_returns.values()) / len(ticker_returns)

                # SPY 벤치마크
                spy_raw = yf.download("SPY", start=sc["start"], end=sc["end"],
                                      progress=False, session=_yf_session)
                spy_return = 0.0
                if not spy_raw.empty:
                    spy_close = spy_raw["Close"].dropna()
                    if len(spy_close) >= 2 and float(spy_close.iloc[0]) > 0:
                        spy_return = round(
                            (float(spy_close.iloc[-1]) - float(spy_close.iloc[0]))
                            / float(spy_close.iloc[0]) * 100, 2
                        )

                best = max(ticker_returns, key=ticker_returns.__getitem__)
                worst = min(ticker_returns, key=ticker_returns.__getitem__)

                results.append({
                    "scenario": sc["name"],
                    "label": sc["label"],
                    "period": f"{sc['start']} ~ {sc['end']}",
                    "color": sc["color"],
                    "avg_portfolio_return": round(avg_return, 2),
                    "spy_return": spy_return,
                    "ticker_returns": ticker_returns,
                    "best_ticker": best,
                    "worst_ticker": worst,
                })

            except Exception as e:
                logger.debug("스트레스 시나리오 '%s' 실패: %s", sc["name"], e)
                continue

        return results

    # ------------------------------------------------------------------
    # CDaR — Conditional Drawdown at Risk (Phase B)
    # ------------------------------------------------------------------

    def calculate_cdar(
        self,
        tickers: list[str],
        alpha: float = 0.05,
        period: str = "6mo",
    ) -> list[dict]:
        """Conditional Drawdown at Risk — 경로 의존형 테일 리스크."""
        results = []
        for ticker in tickers:
            try:
                raw = yf.download(ticker, period=period, progress=False, session=_yf_session)
                if raw.empty:
                    continue

                close = raw["Close"].squeeze().dropna()
                if len(close) < 20:
                    continue

                peak = close.cummax()
                drawdown = (close - peak) / peak       # 음수값 시리즈

                dd_vals = drawdown.values.astype(float)
                threshold = float(np.percentile(dd_vals, alpha * 100))
                tail_dd = dd_vals[dd_vals <= threshold]
                cdar = float(tail_dd.mean()) * 100 if len(tail_dd) > 0 else 0.0

                # CVaR (일 수익률 기반, 비교용)
                rets = close.pct_change().dropna().values.astype(float)
                var_thr = float(np.percentile(rets, alpha * 100))
                tail_rets = rets[rets <= var_thr]
                cvar = float(tail_rets.mean()) * 100 if len(tail_rets) > 0 else 0.0

                results.append({
                    "ticker": ticker,
                    "cdar_pct": round(cdar, 3),
                    "cvar_pct": round(cvar, 3),
                    "max_dd_pct": round(float(dd_vals.min()) * 100, 2),
                    "current_dd_pct": round(float(dd_vals[-1]) * 100, 2),
                    "period": period,
                    "alpha": alpha,
                })

            except Exception as e:
                logger.debug("CDaR 계산 실패 (%s): %s", ticker, e)
                continue

        return results

    # ------------------------------------------------------------------
    # generate_alerts() 오케스트레이터 (프롬프트 #9)
    # ------------------------------------------------------------------

    def generate_alerts(
        self,
        portfolio_value: float = 100_000,
        picks_override: list[dict] | None = None,
        output_date: str | None = None,
    ) -> dict:
        """모든 분석을 조율하고 3단계 알림(CRITICAL/WARNING/INFO)을 생성한다.

        Args:
            picks_override: 외부에서 주입하는 picks 목록 (히스토리 재생성용).
                            제공 시 load_picks() 생략, drawdowns/stop_loss도 스킵.
            output_date: "YYYYMMDD" 형식. 제공 시 risk_alerts_{date}.json으로 저장.
        """
        now = datetime.now()
        regime = self.regime_config.get("regime", "neutral")
        verdict = self.verdict_data.get("verdict", "CAUTION")

        # picks 로드
        if picks_override is not None:
            picks = picks_override
            drawdowns: dict = {}
            stop_status: list = []
        else:
            picks = self.load_picks()
            drawdowns = self.calculate_drawdowns(picks)
            stop_status = self.check_stop_losses(picks, drawdowns)
        tickers = [p["ticker"] for p in picks]
        var_result = self.calculate_portfolio_var(
            tickers, portfolio_value=portfolio_value
        )
        position_sizes = self.calculate_position_sizes(picks, portfolio_value)
        concentration = self.analyze_concentration_risk(picks)

        # Phase B 고급 분석
        component_var = self.calculate_component_var(picks, position_sizes, portfolio_value)
        stress_scenarios = self.calculate_stress_scenarios(picks)
        cdar_data = self.calculate_cdar(tickers)

        budget = self.check_risk_budget(
            picks, portfolio_value,
            var_result=var_result,
            position_sizes=position_sizes,
        )

        # 알림 분류
        alerts: list[dict] = []
        ts = now.isoformat()

        # CRITICAL
        for s in stop_status:
            if s["alert_level"] == "BREACHED":
                # 어떤 stop이 돌파됐는지 구분
                if s["fixed_status"] == "BREACHED":
                    msg = (f"{s['ticker']} fixed stop 돌파 "
                           f"(진입가 대비 {s['from_entry_pct']}%, 기준 {s['fixed_threshold']}%)")
                    val = s.get("from_entry_pct", 0)
                    thr = s["fixed_threshold"]
                else:
                    msg = (f"{s['ticker']} trailing stop 돌파 "
                           f"(최고가 대비 {s['from_peak_pct']}%, 기준 {s['trailing_threshold']}%)")
                    val = s.get("from_peak_pct", 0)
                    thr = s["trailing_threshold"]
                alerts.append({
                    "level": "CRITICAL",
                    "category": "stop_loss",
                    "ticker": s["ticker"],
                    "message": msg,
                    "value": val,
                    "threshold": thr,
                    "action": "SELL",
                    "timestamp": ts,
                })

        if budget["budget_status"] == "EXCEEDED":
            alerts.append({
                "level": "CRITICAL",
                "category": "risk_budget",
                "ticker": "PORTFOLIO",
                "message": f"리스크 예산 초과: {', '.join(budget['reasons'])}",
                "value": budget["details"].get("var_usage_pct", 0),
                "threshold": self.RISK_BUDGET["max_portfolio_var_pct"],
                "action": "REDUCE",
                "timestamp": ts,
            })

        if verdict == "STOP" and picks:
            alerts.append({
                "level": "CRITICAL",
                "category": "regime",
                "ticker": "PORTFOLIO",
                "message": f"Verdict STOP — 보유 {len(picks)}종목 매도 검토 필요",
                "value": 0,
                "threshold": 0,
                "action": "SELL",
                "timestamp": ts,
            })

        # WARNING
        for s in stop_status:
            if s["alert_level"] == "WARNING":
                parts = []
                if s["fixed_status"] == "WARNING":
                    parts.append(f"fixed {s['from_entry_pct']}% (기준 {s['fixed_threshold']}%)")
                if s["trailing_status"] == "WARNING":
                    parts.append(f"trailing {s['from_peak_pct']}% (기준 {s['trailing_threshold']}%)")
                alerts.append({
                    "level": "WARNING",
                    "category": "stop_loss",
                    "ticker": s["ticker"],
                    "message": f"{s['ticker']} stop-loss 근접: {', '.join(parts)}",
                    "value": s.get("from_entry_pct", 0),
                    "threshold": s["fixed_threshold"],
                    "action": "MONITOR",
                    "timestamp": ts,
                })

        if budget["budget_status"] == "WARNING":
            alerts.append({
                "level": "WARNING",
                "category": "risk_budget",
                "ticker": "PORTFOLIO",
                "message": f"리스크 예산 주의: {', '.join(budget['reasons'])}",
                "value": budget["details"].get("var_usage_pct", 0),
                "threshold": self.RISK_BUDGET["max_portfolio_var_pct"],
                "action": "MONITOR",
                "timestamp": ts,
            })

        for w in concentration.get("concentration_warnings", []):
            alerts.append({
                "level": "WARNING",
                "category": "concentration",
                "ticker": "PORTFOLIO",
                "message": f"섹터 집중도 초과: {w}",
                "value": 0,
                "threshold": self.RISK_BUDGET["max_sector_pct"],
                "action": "MONITOR",
                "timestamp": ts,
            })

        for t, cnt in concentration.get("correlation_exposure", {}).items():
            if cnt >= self.RISK_BUDGET["max_correlation_exposure"]:
                alerts.append({
                    "level": "WARNING",
                    "category": "correlation",
                    "ticker": t,
                    "message": f"{t} 고상관 노출 {cnt}쌍 (한도 {self.RISK_BUDGET['max_correlation_exposure']})",
                    "value": cnt,
                    "threshold": self.RISK_BUDGET["max_correlation_exposure"],
                    "action": "MONITOR",
                    "timestamp": ts,
                })

        # ------ ai_sell 알림 #6 (Part 4 — data_ai_summaries SQLite) ------
        ai_sell_tickers: set = set()
        for p in picks:
            ticker = p["ticker"]
            ai = self.ai_summaries.get(ticker, {})
            rec = (ai.get("recommendation") or "").upper()
            if rec != "SELL":
                continue
            confidence_val = float(ai.get("confidence") or 0)
            # drawdown_warning 동시 발생 여부: -20% < from_entry ≤ -10%
            dd = drawdowns.get(ticker, {})
            from_entry = dd.get("from_entry_pct")
            has_dd_warning = from_entry is not None and -20.0 < from_entry <= -10.0
            ai_level = "CRITICAL" if has_dd_warning else "WARNING"
            alerts.append({
                "level": ai_level,
                "category": "ai_sell",
                "ticker": ticker,
                "message": (
                    f"AI 분석: {ticker} SELL 추천 (신뢰도 {confidence_val:.0f}%)"
                    + (" + 낙폭 경고 → CRITICAL 상향" if has_dd_warning else "")
                ),
                "value": confidence_val,
                "threshold": 0.0,
                "action": "REDUCE",
                "timestamp": ts,
            })
            ai_sell_tickers.add(ticker)

        # ------ prediction 알림 #7 (Part 5 — data_index_prediction SQLite) ------
        preds = self.index_prediction.get("predictions", {})
        spy_info = preds.get("spy", {})
        qqq_info = preds.get("qqq", {})
        spy_dir = (spy_info.get("direction") or "").lower()
        spy_prob = float(spy_info.get("probability_up") or 0)
        qqq_dir = (qqq_info.get("direction") or "").lower()
        qqq_prob = float(qqq_info.get("probability_up") or 0)
        prediction_warning_active = spy_dir == "bearish" and spy_prob >= 0.60
        ap = self.regime_config.get("adaptive_params", {})
        tight_threshold_pct = ap.get("stop_loss", -0.08) * 100 * 0.75  # e.g. neutral: -6.0
        if prediction_warning_active:
            pred_level = "CRITICAL" if regime in ("crisis", "risk_off") else "WARNING"
            alerts.append({
                "level": pred_level,
                "category": "prediction",
                "ticker": "PORTFOLIO",
                "message": (
                    f"SPY 하락 예측 (확신도 {spy_prob * 100:.1f}%)"
                    f" — stop 기준 {tight_threshold_pct:.1f}%로 타이트 적용"
                    + (" → CRITICAL (crisis/risk_off)" if pred_level == "CRITICAL" else "")
                ),
                "value": round(spy_prob * 100, 1),
                "threshold": 60.0,
                "action": "MONITOR",
                "timestamp": ts,
            })
            # 에스컬레이션: prediction 활성 시 WARNING 수준 stop-loss → CRITICAL 상향
            for s in stop_status:
                if s["alert_level"] == "WARNING":
                    alerts.append({
                        "level": "CRITICAL",
                        "category": "stop_loss",
                        "ticker": s["ticker"],
                        "message": (
                            f"{s['ticker']} stop WARNING + SPY 하락 예측 → CRITICAL 상향 "
                            f"(진입가 대비 {s['from_entry_pct']}%, 타이트 기준 {tight_threshold_pct:.1f}%)"
                        ),
                        "value": s.get("from_entry_pct", 0),
                        "threshold": tight_threshold_pct,
                        "action": "SELL",
                        "timestamp": ts,
                    })

        # Stress scenario 경고
        for sc in stress_scenarios:
            avg_ret = sc.get("avg_portfolio_return", 0)
            if avg_ret < -20:
                level = "CRITICAL"
                thr = -20
            elif avg_ret < -10:
                level = "WARNING"
                thr = -10
            else:
                continue
            alerts.append({
                "level": level,
                "category": "stress_test",
                "ticker": "PORTFOLIO",
                "message": (
                    f"{sc['scenario']} 시나리오: 포트폴리오 {avg_ret:+.1f}%"
                    f" (SPY {sc.get('spy_return', 0):+.1f}%)"
                ),
                "value": avg_ret,
                "threshold": thr,
                "action": "REVIEW",
                "timestamp": ts,
            })

        # INFO
        alerts.append({
            "level": "INFO",
            "category": "regime",
            "ticker": "PORTFOLIO",
            "message": f"Regime: {regime} | Verdict: {verdict}",
            "value": 0,
            "threshold": 0,
            "action": "MONITOR",
            "timestamp": ts,
        })

        if var_result:
            alerts.append({
                "level": "INFO",
                "category": "risk_budget",
                "ticker": "PORTFOLIO",
                "message": (
                    f"VaR({var_result.get('horizon_days', 5)}일): "
                    f"${var_result.get('regime_adjusted_var_dollar', 0):,.0f} "
                    f"({budget['budget_status']})"
                ),
                "value": var_result.get("regime_adjusted_var_pct", 0),
                "threshold": self.RISK_BUDGET["max_portfolio_var_pct"],
                "action": "MONITOR",
                "timestamp": ts,
            })

        # 투자 비중 계산
        invested_pct = sum(
            p["final_pct"] for p in position_sizes if p["ticker"] != "CASH"
        )
        cash_pct = 100 - invested_pct

        # 결과 조합
        result = {
            "generated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
            "regime": regime,
            "verdict": verdict,
            "market_context": {
                "regime": regime,
                "verdict": verdict,
                "index_prediction": {
                    "spy_direction": spy_dir,
                    "spy_probability": round(spy_prob, 3),
                    "qqq_direction": qqq_dir,
                    "qqq_probability": round(qqq_prob, 3),
                },
                "ai_sell_count": len(ai_sell_tickers),
                "prediction_warning_active": prediction_warning_active,
            },
            "portfolio_summary": {
                "total_value": portfolio_value,
                "invested_pct": round(invested_pct, 1),
                "cash_pct": round(cash_pct, 1),
                "total_var_dollar": var_result.get("regime_adjusted_var_dollar", 0),
                "risk_budget_status": budget["budget_status"],
            },
            "alerts": alerts,
            "position_sizes": position_sizes,
            "stop_loss_status": stop_status,
            "drawdowns": drawdowns,
            "concentration": concentration,
            "component_var": component_var,
            "stress_scenarios": stress_scenarios,
            "cdar": cdar_data,
        }

        # JSON 저장
        fe_data = self.OUTPUT_DIR.parent / "frontend" / "public" / "data"
        if output_date:
            # 히스토리 재생성 — SQLite에만 저장 (JSON 파일 미생성)
            try:
                from src.db import data_store as _ds
                _conn = _ds.get_db()
                _date_iso = f"{output_date[:4]}-{output_date[4:6]}-{output_date[6:]}"
                _ds.upsert_risk_alert(_conn, _date_iso, result, update_snapshot=False)
                _conn.close()
                logger.info("날짜별 리스크 알림 SQLite 저장: %s", _date_iso)
            except Exception as _e:
                logger.warning("SQLite risk_alert 쓰기 실패: %s", _e)
        else:
            # 기본: risk_alerts.json (generate_graph.py가 읽음) + SQLite
            with open(self.output_file, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2, default=str)
            logger.info("리스크 알림 저장: %s", self.output_file)
            try:
                from src.db import data_store as _ds
                _conn = _ds.get_db()
                _ds.upsert_risk_alert(_conn, now.strftime("%Y-%m-%d"), result, update_snapshot=True)
                _conn.close()
            except Exception as _e:
                logger.warning("SQLite risk_alert 쓰기 실패: %s", _e)
            if fe_data.exists():
                shutil.copy2(self.output_file, fe_data / "risk_alerts.json")
                logger.info("대시보드 복사: risk_alerts.json")

        # 요약 로그
        critical = sum(1 for a in alerts if a["level"] == "CRITICAL")
        warning = sum(1 for a in alerts if a["level"] == "WARNING")
        info = sum(1 for a in alerts if a["level"] == "INFO")
        logger.info("리스크 알림: CRITICAL %d건, WARNING %d건, INFO %d건", critical, warning, info)

        self._last_result = result
        return result

    # ------------------------------------------------------------------
    # 텔레그램 포맷 (프롬프트 #10)
    # ------------------------------------------------------------------

    def format_telegram_message(self) -> str:
        """generate_alerts() 결과를 텔레그램 메시지로 포맷."""
        result = getattr(self, "_last_result", None)
        if not result:
            return "All Clear — 리스크 항목 없음"

        lines = []
        lines.append(f"[RISK ALERT] {datetime.now().strftime('%Y-%m-%d')}")
        lines.append(f"Regime: {result['regime']} | Verdict: {result['verdict']}")
        lines.append("")

        alerts = result.get("alerts", [])
        criticals = [a for a in alerts if a["level"] == "CRITICAL"]
        warnings = [a for a in alerts if a["level"] == "WARNING"]

        if criticals:
            lines.append(f"CRITICAL ({len(criticals)}건):")
            for a in criticals:
                lines.append(f"- {a['ticker']}: {a['message']} -> {a['action']}")
            lines.append("")

        if warnings:
            lines.append(f"WARNING ({len(warnings)}건):")
            for a in warnings:
                lines.append(f"- {a['message']}")
            lines.append("")

        # 포지션 요약
        pos = result.get("position_sizes", [])
        pos_parts = []
        for p in pos:
            if p["final_pct"] > 0:
                pos_parts.append(f"{p['ticker']} {p['final_pct']}%")
        if pos_parts:
            lines.append(f"포지션: {' | '.join(pos_parts)}")

        # VaR 요약
        ps = result.get("portfolio_summary", {})
        var_dollar = ps.get("total_var_dollar", 0)
        budget_status = ps.get("risk_budget_status", "OK")
        lines.append(f"VaR(5일): ${var_dollar:,.0f} ({budget_status})")

        if not criticals and not warnings:
            return "All Clear — 리스크 항목 없음"

        msg = "\n".join(lines)

        # 4096자 제한
        if len(msg) > 4096:
            # CRITICAL + WARNING만 남기기
            lines_trimmed = lines[:2]
            lines_trimmed.append("")
            if criticals:
                lines_trimmed.append(f"CRITICAL ({len(criticals)}건):")
                for a in criticals:
                    lines_trimmed.append(f"- {a['ticker']}: {a['message']}")
            if warnings:
                lines_trimmed.append(f"WARNING ({len(warnings)}건):")
                for a in warnings[:5]:
                    lines_trimmed.append(f"- {a['message']}")
            lines_trimmed.append("")
            lines_trimmed.append("(상세: risk_alerts.json 참조)")
            msg = "\n".join(lines_trimmed)

        return msg
