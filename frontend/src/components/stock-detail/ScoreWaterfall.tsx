"use client";
import { HelpBtn } from "@/components/HelpBtn";
import { barColor as barColorUtil, scoreColor } from "@/lib/ui";

type Props = {
  technical?: number;
  fundamental?: number;
  analyst?: number;
  rs?: number;
  volume?: number;
  score13f?: number;
  composite?: number;
};

// Weights per CLAUDE.md — Technical 25 / Fundamental 20 / Analyst 15 / RS 15 / Volume 15 / 13F 10
const FACTORS: Array<{
  key: keyof Omit<Props, "composite">;
  label: string;
  weight: number;
  topic: string;
}> = [
  { key: "technical", label: "Technical", weight: 0.25, topic: "technical_score" },
  { key: "fundamental", label: "Fundamental", weight: 0.2, topic: "fundamental_score" },
  { key: "analyst", label: "Analyst", weight: 0.15, topic: "analyst_score" },
  { key: "rs", label: "RS", weight: 0.15, topic: "rs_score" },
  { key: "volume", label: "Volume", weight: 0.15, topic: "volume_score" },
  { key: "score13f", label: "13F", weight: 0.1, topic: "score_13f" },
];

// 팩터 개별 점수 bar 색상 (lib/ui의 barColor 재사용 — 75/62/48 기준)
function factorBarColor(s: number): string {
  // barColor는 glow가 붙어있어 강조 과하므로 여기선 기본 primary만
  if (s >= 62) return "bg-primary";
  if (s >= 48) return "bg-secondary";
  return "bg-error";
}

// 기여도 텍스트 색상 — weight×score 산출물이라 숫자 범위가 다름 (0-25)
function contribColor(c: number) {
  if (c >= 12) return "text-primary";
  if (c >= 6) return "text-secondary";
  return "text-on-surface-variant";
}

export function ScoreWaterfall(props: Props) {
  const rows = FACTORS.map((f) => {
    const raw = (props[f.key] ?? 0) as number;
    const contrib = raw * f.weight; // 0 ~ 100*weight
    return { ...f, raw, contrib };
  });
  const sum = rows.reduce((a, r) => a + r.contrib, 0);
  const composite = props.composite ?? sum;

  return (
    <section className="bg-surface-container-low rounded-xl p-6 mb-6 border border-outline-variant/10">
      <div className="flex items-baseline justify-between mb-5">
        <h4 className="text-sm font-bold uppercase tracking-widest text-on-surface flex items-center gap-2">
          Composite Score Breakdown
          <HelpBtn topic="composite_score" />
        </h4>
        <span className="text-[10px] text-on-surface-variant">
          6개 팩터 가중합 · 기여도 = 점수 × 가중치
        </span>
      </div>
      <div className="space-y-3">
        {rows.map((r) => {
          const rawPct = Math.min(Math.max(r.raw, 0), 100);
          const wPct = r.weight * 100;
          return (
            <div key={r.key} className="flex items-center gap-3 text-xs">
              <div className="w-28 flex items-center gap-1">
                <span className="font-bold text-on-surface">{r.label}</span>
                <span className="text-[9px] text-on-surface-variant">{wPct}%</span>
              </div>
              <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden relative">
                <div
                  className={`h-full ${factorBarColor(r.raw)} transition-all`}
                  style={{ width: `${rawPct}%` }}
                />
              </div>
              <span className="font-mono font-bold text-on-surface w-10 text-right">
                {r.raw.toFixed(0)}
              </span>
              <span
                className={`font-mono font-bold w-14 text-right text-[11px] ${contribColor(r.contrib)}`}
              >
                +{r.contrib.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-outline-variant/10 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Weighted Sum
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-on-surface-variant font-mono">
            {sum.toFixed(1)}
          </span>
          <span className="text-xs text-on-surface-variant">≈</span>
          <span className={`text-xl font-black tabular-nums ${scoreColor(composite)}`}>
            {composite.toFixed(1)}
          </span>
        </div>
      </div>
      <p className="text-[10px] text-on-surface-variant/60 mt-3">
        가중합과 composite_score 사이 미세 차이는 소수점 반올림 및 섹터 보정 때문일 수 있습니다.
      </p>
    </section>
  );
}
