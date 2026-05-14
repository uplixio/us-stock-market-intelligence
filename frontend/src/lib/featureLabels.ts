export interface FeatureMeta {
  label: string;
  desc: string;
}

export const FEATURE_META: Record<string, FeatureMeta> = {
  spy_vol_trend_5d:      { label: "SPY 5D VOL TREND", desc: "SPY 최근 5일 변동성 추세. 양수=확대, 음수=축소." },
  spy_return_10d:        { label: "SPY 10D RETURN",   desc: "SPY 최근 10거래일 누적 수익률(%)." },
  spy_return_1m:         { label: "SPY 1M RETURN",    desc: "SPY 최근 1개월 누적 수익률(%)." },
  spy_rsi14:             { label: "SPY RSI(14)",      desc: "SPY 14일 RSI. 30↓ 침체, 70↑ 과열." },
  spy_price_vs_20ma_pct: { label: "SPY VS 20MA",      desc: "SPY 현재가가 20일 이평선 대비 몇 % 위/아래인지." },
  spy_price_vs_50ma_pct: { label: "SPY VS 50MA",      desc: "SPY 현재가가 50일 이평선 대비 몇 % 위/아래인지." },
  qqq_return_10d:        { label: "QQQ 10D RETURN",   desc: "QQQ 최근 10거래일 누적 수익률(%)." },
  qqq_rsi14:             { label: "QQQ RSI(14)",      desc: "QQQ 14일 RSI. 30↓ 침체, 70↑ 과열." },
  qqq_price_vs_20ma_pct: { label: "QQQ VS 20MA",      desc: "QQQ 현재가가 20일 이평선 대비 몇 % 위/아래인지." },
  vix_value:             { label: "VIX",              desc: "변동성 지수. 시장 공포 게이지 (20↑ 경계, 30↑ 위험)." },
  xlk_relative_1m:       { label: "XLK 1M RS",        desc: "기술 섹터(XLK)의 SPY 대비 1개월 상대 강도." },
  xlu_relative_1m:       { label: "XLU 1M RS",        desc: "유틸리티 섹터(XLU)의 SPY 대비 1개월 상대 강도 (음수=경기민감 우호)." },
  yield_spread_proxy:    { label: "YIELD SPREAD",     desc: "장단기 금리 스프레드(10Y-2Y). 양수=정상, 음수=역전 경고." },
};

export function formatFeatureLabel(key: string): FeatureMeta {
  const meta = FEATURE_META[key];
  if (meta) return meta;
  return { label: key.replace(/_/g, " ").toUpperCase(), desc: "" };
}
