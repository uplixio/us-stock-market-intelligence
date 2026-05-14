import logging
import os

import pandas as pd

logger = logging.getLogger(__name__)

FILE_SPECS = {
    "sp500_list.csv": {
        "min_rows": 500,
        "date_col": None,
        "core_cols": ["Symbol", "GICS Sector"],
        "numeric_cols": [],
        "string_cols": ["Symbol", "Security", "GICS Sector", "GICS Sub-Industry"],
    },
    "us_daily_prices.parquet": {
        "min_rows": 1000,
        "date_col": "Date",
        "core_cols": ["Open", "High", "Low", "Close", "Volume"],
        "numeric_cols": ["Open", "High", "Low", "Close", "Volume"],
        "string_cols": ["Symbol"],
    },
    "us_macro.csv": {
        "min_rows": 1,
        "date_col": None,
        "core_cols": ["VIX", "regime", "FEDFUNDS"],
        "numeric_cols": ["FEDFUNDS", "DGS10", "DGS2"],
        "string_cols": ["regime", "yield_curve"],
    },
    "us_sectors.csv": {
        "min_rows": 11,
        "date_col": None,
        "core_cols": ["Ticker", "Sector", "1D", "20D"],
        "numeric_cols": ["1D", "5D", "20D", "60D"],
        "string_cols": ["Ticker", "Sector"],
    },
}


class DataQualityReporter:
    def __init__(self, data_dir: str = "."):
        self.data_dir = data_dir

    def _check_ohlc_integrity(self, df: pd.DataFrame) -> dict:
        if not all(c in df.columns for c in ["Open", "High", "Low", "Close"]):
            return {"ohlc_integrity": "columns_missing"}
        violations = (
            (df["High"] < df["Close"]) |
            (df["Low"] > df["Close"]) |
            (df["High"] < df["Open"]) |
            (df["Low"] > df["Open"])
        ).sum()
        return {"ohlc_integrity_violations": int(violations)}

    def _check_volume_anomaly(self, df: pd.DataFrame) -> dict:
        if "Volume" not in df.columns:
            return {}
        vol_ma20 = df["Volume"].rolling(20).mean()
        anomalies = (df["Volume"] > vol_ma20 * 3).sum()
        return {"volume_anomaly_days": int(anomalies)}

    def _check_duplicate_dates(self, df: pd.DataFrame) -> dict:
        dupes = df.index.duplicated().sum() if hasattr(df.index, 'duplicated') else 0
        return {"duplicate_dates": int(dupes)}

    def check_file(self, filename: str, spec: dict) -> dict:
        filepath = os.path.join(self.data_dir, filename)
        checks = []
        score = 0

        # 1. 파일 존재 (20점)
        exists = os.path.exists(filepath)
        checks.append(("파일 존재", exists, 20 if exists else 0))
        if exists:
            score += 20
        else:
            checks += [("행 수", False, 0), ("결측치", False, 0), ("데이터 타입", False, 0), ("날짜 범위", False, 0)]
            return {"file": filename, "score": 0, "checks": checks}

        df = pd.read_parquet(filepath) if filepath.endswith(".parquet") else pd.read_csv(filepath)
        rows, cols = df.shape

        # 2. 행 수 충분 (20점)
        min_rows = spec["min_rows"]
        row_ok = rows >= min_rows
        checks.append(("행 수", row_ok, 20 if row_ok else 0, f"{rows}행 (기준: {min_rows})"))
        if row_ok:
            score += 20

        # 3. 결측치 (20점) — 핵심 컬럼만 검사
        core_cols = [c for c in spec["core_cols"] if c in df.columns]
        if core_cols:
            missing_rates = {}
            for col in core_cols:
                rate = df[col].isna().sum() / len(df) * 100
                if rate > 0:
                    missing_rates[col] = round(rate, 2)
            max_missing = max(missing_rates.values()) if missing_rates else 0
            missing_ok = max_missing < 10
            detail = f"최대 {max_missing}%" if missing_rates else "결측 없음"
        else:
            missing_ok = True
            detail = "검사 대상 없음"
        checks.append(("결측치", missing_ok, 20 if missing_ok else 0, detail))
        if missing_ok:
            score += 20

        # 4. 데이터 타입 (20점)
        type_ok = True
        type_issues = []
        for col in spec["numeric_cols"]:
            if col in df.columns and not pd.api.types.is_numeric_dtype(df[col]):
                type_ok = False
                type_issues.append(f"{col}(비숫자)")
        for col in spec["string_cols"]:
            if col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
                type_ok = False
                type_issues.append(f"{col}(비문자)")
        detail = "정상" if type_ok else f"이슈: {type_issues}"
        checks.append(("데이터 타입", type_ok, 20 if type_ok else 0, detail))
        if type_ok:
            score += 20

        # 5. 날짜 범위 (20점)
        date_col = spec["date_col"]
        if date_col and date_col in df.columns:
            dates = pd.to_datetime(df[date_col], errors="coerce").dropna()
            if len(dates) > 0:
                date_min = dates.min()
                date_max = dates.max()
                span_days = (date_max - date_min).days
                date_ok = span_days >= 180
                detail = f"{date_min.strftime('%Y-%m-%d')} ~ {date_max.strftime('%Y-%m-%d')} ({span_days}일)"
            else:
                date_ok = False
                detail = "날짜 파싱 실패"
        else:
            date_ok = True
            detail = "날짜 컬럼 없음 (자동 통과)"
        checks.append(("날짜 범위", date_ok, 20 if date_ok else 0, detail))
        if date_ok:
            score += 20

        # 추가 검증: OHLC 무결성, 거래량 이상치, 중복 날짜
        extra_checks = {}
        extra_checks.update(self._check_ohlc_integrity(df))
        extra_checks.update(self._check_volume_anomaly(df))
        extra_checks.update(self._check_duplicate_dates(df))

        return {"file": filename, "score": score, "rows": rows, "cols": cols, "checks": checks, "extra": extra_checks}

    def run_full_report(self) -> dict:
        results = {}
        total_score = 0

        print()
        print("=" * 65)
        print("  데이터 품질 리포트")
        print("=" * 65)

        for filename, spec in FILE_SPECS.items():
            result = self.check_file(filename, spec)
            results[filename] = result
            total_score += result["score"]

            print(f"\n  📄 {filename} — {result['score']}/100점")
            if "rows" in result:
                print(f"     크기: {result['rows']}행 x {result['cols']}컬럼")
            print(f"     항목:")
            for check in result["checks"]:
                name, passed = check[0], check[1]
                pts = check[2]
                detail = check[3] if len(check) > 3 else ""
                icon = "✅" if passed else "❌"
                print(f"       {icon} {name} ({pts}점) {detail}")
            if result.get("extra"):
                extra = result["extra"]
                if "ohlc_integrity_violations" in extra:
                    v = extra["ohlc_integrity_violations"]
                    icon = "✅" if v == 0 else "⚠️"
                    print(f"       {icon} OHLC 무결성 위반: {v}건")
                elif "ohlc_integrity" in extra:
                    print(f"       ⚠️ OHLC 무결성: {extra['ohlc_integrity']}")
                if "volume_anomaly_days" in extra:
                    v = extra["volume_anomaly_days"]
                    icon = "✅" if v == 0 else "⚠️"
                    print(f"       {icon} 거래량 이상치 (20일MA×3 초과): {v}일")
                if "duplicate_dates" in extra:
                    v = extra["duplicate_dates"]
                    icon = "✅" if v == 0 else "⚠️"
                    print(f"       {icon} 중복 날짜: {v}건")

        avg = total_score / len(FILE_SPECS)
        results["average_score"] = round(avg, 1)

        print()
        print("=" * 65)
        print(f"  전체 평균: {avg:.1f}/100점")
        grade = "A+" if avg >= 95 else "A" if avg >= 90 else "B" if avg >= 80 else "C" if avg >= 70 else "D"
        print(f"  등급: {grade}")
        print("=" * 65)
        print()

        return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    reporter = DataQualityReporter()
    reporter.run_full_report()
