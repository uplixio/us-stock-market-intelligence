// Shared UI helpers ported from dashboard/index.html

// CSS 변수 참조 — 인라인 style로 사용 시 브라우저가 테마에 맞는 값으로 resolve
export const C: Record<string, string> = {
  risk_on: "var(--color-regime-risk-on)",
  neutral: "var(--color-regime-neutral)",
  risk_off: "var(--color-regime-risk-off)",
  crisis:  "var(--color-regime-crisis)",
};

export const CB: Record<string, string> = {
  risk_on: "var(--color-regime-risk-on-bg)",
  neutral: "var(--color-regime-neutral-bg)",
  risk_off: "var(--color-regime-risk-off-bg)",
  crisis:  "var(--color-regime-crisis-bg)",
};

export const CG: Record<string, string> = {
  risk_on: "glow-primary",
  neutral: "glow-secondary",
  risk_off: "glow-error",
  crisis: "glow-error",
};

// ── Score 색상 기준 (Grade 경계에 정렬) ────────────────────────────────
// A (75+)   → 강조 primary (녹색 + glow)
// B (62-74) → primary (녹색)
// C (48-61) → secondary (노란색 — 중립)
// D (35-47) → error (빨강 — 주의)
// F (<35)   → error (빨강 강조)
// 의미: A·B = 매수 후보(녹) / C = 관망(노랑) / D·F = 회피(빨강)
export function gradeClass(g: string | undefined): string {
  const m: Record<string, string> = {
    A: "bg-primary/20 border-primary/40 text-primary",
    B: "bg-primary/10 border-primary/25 text-primary",
    C: "bg-secondary/10 border-secondary/25 text-secondary",
    D: "bg-error/10 border-error/25 text-error",
    F: "bg-error/20 border-error/40 text-error",
  };
  const k = (g ?? "C").charAt(0).toUpperCase();
  return m[k] ?? m.C;
}

// Bar (막대) 색상 — 75/62/48 기준. Grade 경계와 정렬.
export function barColor(s: number): string {
  if (s >= 75) return "bg-primary glow-primary"; // A
  if (s >= 62) return "bg-primary";              // B
  if (s >= 48) return "bg-secondary";            // C
  return "bg-error";                             // D, F
}

// Score 텍스트 색상 — 3색(녹/노/빨) 통합 유틸. 62/48 기준으로 Grade와 정렬.
export function scoreColor(s: number | null | undefined): string {
  if (s == null || Number.isNaN(s)) return "text-on-surface-variant";
  if (s >= 62) return "text-primary";   // A, B
  if (s >= 48) return "text-secondary"; // C
  return "text-error";                  // D, F
}

export const SIGNAL_NAMES: Record<string, string> = {
  vix: "VIX",
  trend: "TREND",
  breadth: "BREADTH",
  credit: "CREDIT",
  yield_curve: "YIELD CURVE",
  put_call: "PUT/CALL",
  regime: "REGIME",
  gate: "GATE",
};

export const SIGNAL_WEIGHTS: Record<string, string> = {
  vix: "30%",
  trend: "25%",
  breadth: "18%",
  credit: "15%",
  yield_curve: "12%",
};

export function sensorLabel(key: string): string {
  return SIGNAL_NAMES[key] ?? key.replace(/_/g, " ").toUpperCase();
}

export function regimeLabel(r: string): string {
  return r.replace(/_/g, " ").toUpperCase();
}

export function strategyLabel(r: string): string {
  if (r === "risk_on") return "Aggressive";
  if (r === "neutral") return "Balanced";
  return "Defensive";
}

/**
 * 배지 Tailwind className 반환.
 * neutral 은 "" 반환 → regimeBadgeStyle() 로 inline style 처리.
 */
export function regimeBadgeCls(v: string): string {
  if (v === "neutral") return "";
  if (v === "risk_on" || v === "bullish" || v === "GO")
    return "bg-primary-container text-on-primary-container";
  if (v === "risk_off" || v === "crisis" || v === "bearish" || v === "STOP")
    return "bg-error-container text-on-error-container";
  return "bg-secondary-container text-on-secondary-container"; // CAUTION, default
}

/**
 * neutral 전용 inline style (어두운 bg + 노란 텍스트).
 * 나머지 값은 undefined 반환.
 */
export function regimeBadgeStyle(v: string): { background: string; color: string } | undefined {
  if (v === "neutral") return { background: CB.neutral, color: C.neutral };
  return undefined;
}
