"use client";
import { gradeClass, barColor, scoreColor } from "@/lib/ui";
import { HelpBtn } from "@/components/HelpBtn";

type Props = {
  ticker: string;
  companyName?: string;
  action?: string; // BUY / WATCH / SMALL BUY / HOLD
  verdict?: string; // GO / CAUTION / STOP
  compositeScore?: number;
  grade?: string;
  gradeLabel?: string;
  strategy?: string;
  setup?: string;
  rsVsSpy?: number;
};

function actionClass(action: string) {
  if (action === "BUY" || action === "STRONG BUY")
    return "bg-primary text-on-primary ring-4 ring-primary/30";
  if (action === "SMALL BUY")
    return "bg-primary-container text-on-primary-container ring-2 ring-primary/20";
  if (action === "WATCH")
    return "bg-secondary-container text-on-secondary-container ring-2 ring-secondary/20";
  return "bg-surface-container-highest text-on-surface-variant ring-2 ring-outline-variant/20";
}

function actionMessage(action: string, verdict: string, grade: string) {
  const g = (grade || "C").charAt(0).toUpperCase();
  if (action === "BUY" || action === "STRONG BUY")
    return "시장·종목 모두 양호 — 이 날짜 기준 매수 적합";
  if (action === "SMALL BUY")
    return "시장은 애매하지만 종목 등급은 양호 — 소량 분할 매수";
  if (action === "WATCH") {
    if (verdict === "STOP") return "시장 리스크 — 관망 권고";
    if (g === "C") return "종목 등급 보통 — 추가 신호 대기";
    return "조건부 관망 — 진입 전 추가 확인 필요";
  }
  return "시장 위험 구간 — 보유 유지 또는 현금화";
}

export function VerdictHero({
  ticker,
  companyName,
  action = "WATCH",
  verdict = "CAUTION",
  compositeScore = 0,
  grade = "C",
  gradeLabel,
  strategy,
  setup,
  rsVsSpy,
}: Props) {
  const gc = gradeClass(grade);
  const scoreCls = scoreColor(compositeScore);
  const bw = Math.min(Math.max(compositeScore, 0), 100);
  const rsCol = (rsVsSpy ?? 0) > 0 ? "text-primary" : "text-error";

  return (
    <section className="bg-surface-container-low rounded-xl p-6 md:p-8 mb-6 border border-outline-variant/10">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Left — Action badge */}
        <div className="flex flex-col items-center md:items-start shrink-0">
          <span
            className={`inline-flex items-center justify-center px-6 py-3 rounded-xl text-2xl font-black tracking-tight uppercase ${actionClass(action)}`}
          >
            {action}
          </span>
          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mt-2 flex items-center gap-1">
            <HelpBtn topic="action" /> Verdict · {verdict} <HelpBtn topic="verdict" />
          </p>
        </div>

        {/* Middle — Ticker & score */}
        <div className="flex-1 w-full">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter">{ticker}</h1>
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${gc}`}
            >
              {grade}
            </span>
            <HelpBtn topic="grade" />
            {gradeLabel && (
              <span className="text-xs text-on-surface-variant">{gradeLabel}</span>
            )}
          </div>
          {companyName && (
            <p className="text-sm text-on-surface-variant mb-3">{companyName}</p>
          )}
          <p className="text-xs text-on-surface leading-relaxed mb-4">
            {actionMessage(action, verdict, grade)}
          </p>

          {/* Composite score bar */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest w-24 flex items-center gap-1">
              Composite <HelpBtn topic="composite_score" />
            </span>
            <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className={`${barColor(bw)} h-full transition-all`}
                style={{ width: `${bw}%` }}
              />
            </div>
            <span className={`text-xl font-black ${scoreCls} w-16 text-right`}>
              {compositeScore.toFixed(1)}
            </span>
          </div>

          {/* Strategy / Setup / RS */}
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
            {strategy && (
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-on-surface">Strategy:</span> {strategy}
                <HelpBtn topic="strategy" />
              </span>
            )}
            {setup && (
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-on-surface">Setup:</span> {setup}
                <HelpBtn topic="setup" />
              </span>
            )}
            {rsVsSpy != null && (
              <span className="inline-flex items-center gap-1">
                <span className="font-bold text-on-surface">vs SPY:</span>{" "}
                <span className={`font-bold ${rsCol}`}>
                  {rsVsSpy > 0 ? "+" : ""}
                  {rsVsSpy}%
                </span>
                <HelpBtn topic="rs_vs_spy" />
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
