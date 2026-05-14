import pandas as pd
import requests
from io import StringIO

url = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"})
resp.raise_for_status()
tables = pd.read_html(StringIO(resp.text))
df = tables[0]

# 필요한 컬럼만 선택
df = df[["Symbol", "Security", "GICS Sector", "GICS Sub-Industry"]].copy()

# yfinance 호환: '.' → '-'
df["Symbol"] = df["Symbol"].str.replace(".", "-", regex=False)

# CSV 저장
df.to_csv("sp500_list.csv", index=False, encoding="utf-8-sig")
print(f"총 {len(df)}개 종목 → sp500_list.csv 저장 완료\n")

# 섹터별 종목 수
print("📊 섹터별 종목 수")
print("-" * 40)
sector_counts = df["GICS Sector"].value_counts().sort_values(ascending=False)
for sector, count in sector_counts.items():
    print(f"  {sector:<30} {count:>3}개")


def validate_sp500_list(csv_path="sp500_list.csv"):
    print("\n\n🔍 sp500_list.csv 검증 시작")
    print("=" * 50)

    df = pd.read_csv(csv_path)
    all_passed = True

    # 1. 총 종목 수 >= 500
    count = len(df)
    ok = count >= 500
    all_passed &= ok
    print(f"  {'✅' if ok else '❌'} 총 종목 수: {count}개 (기준: 500개 이상)")

    # 2. 11개 GICS 섹터 포함 여부
    expected_sectors = {
        "Industrials", "Financials", "Information Technology",
        "Health Care", "Consumer Discretionary", "Consumer Staples",
        "Utilities", "Real Estate", "Materials",
        "Communication Services", "Energy",
    }
    actual_sectors = set(df["GICS Sector"].unique())
    missing = expected_sectors - actual_sectors
    ok = len(missing) == 0
    all_passed &= ok
    print(f"  {'✅' if ok else '❌'} GICS 섹터: {len(actual_sectors)}개 확인", end="")
    if missing:
        print(f" (누락: {missing})")
    else:
        print(" (11개 모두 포함)")

    # 3. Symbol에 '.' 미포함
    dot_symbols = df[df["Symbol"].str.contains(r"\.", regex=True)]
    ok = len(dot_symbols) == 0
    all_passed &= ok
    print(f"  {'✅' if ok else '❌'} Symbol '.' 포함: {len(dot_symbols)}개", end="")
    if len(dot_symbols) > 0:
        print(f" → {dot_symbols['Symbol'].tolist()}")
    else:
        print(" (모두 변환 완료)")

    # 4. 중복 Symbol 없음
    dupes = df[df["Symbol"].duplicated(keep=False)]
    ok = len(dupes) == 0
    all_passed &= ok
    print(f"  {'✅' if ok else '❌'} 중복 Symbol: {len(dupes)}개", end="")
    if len(dupes) > 0:
        print(f" → {dupes['Symbol'].unique().tolist()}")
    else:
        print(" (중복 없음)")

    print("=" * 50)
    print(f"  {'✅ 모든 검증 통과!' if all_passed else '❌ 일부 검증 실패'}")
    print()


validate_sp500_list()
