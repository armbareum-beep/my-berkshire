/**
 * 기업 등급 — 납입 원금(invested) × 운용기간(monthsActive) 이중 게이트.
 *
 * 원칙(헌법 II 정직한 게이미피케이션 · §3.2 로망):
 *  · 자본과 시간 모두 충족해야 다음 등급 진입(AND 게이트).
 *    시장 등락만으로는 등급이 흔들리지 않는다.
 *  · 과거 기록 입력 → 운용기간 소급 인정 → 즉시 레벨업 (데이터 입력 인센티브).
 *  · "개인투자자=저렙" 프레이밍 금지 — 1단계부터 격 있는 라벨.
 */
export interface CompanyTier {
  index: number;
  label: string;
  emoji: string;
  lo: number;
  minMonths: number;
  nextLo: number | null;
  nextMinMonths: number | null;
  /** 다음 등급 자본 하한까지 진행도(0~1). 최상위=1. */
  capitalProgress: number;
  /** 다음 등급 기간 하한까지 진행도(0~1). 최상위=1. */
  monthsProgress: number;
  total: number;
}

export interface TierDef {
  lo: number;
  minMonths: number;
  label: string;
  emoji: string;
}

/** 등급 구간(납입 원금 ₩ + 운용기간 월 기준, 작은 것부터). */
export const COMPANY_TIERS: readonly TierDef[] = [
  { lo: 0,             minMonths: 0,  label: "신생 투자회사",   emoji: "🌱" },
  { lo: 10_000_000,    minMonths: 6,  label: "소형 투자회사",   emoji: "🌿" },
  { lo: 50_000_000,    minMonths: 12, label: "중형 투자회사",   emoji: "🏢" },
  { lo: 100_000_000,   minMonths: 24, label: "대형 투자회사",   emoji: "🏛️" },
  { lo: 500_000_000,   minMonths: 36, label: "투자그룹",        emoji: "🏰" },
  { lo: 5_000_000_000, minMonths: 60, label: "글로벌 투자그룹", emoji: "🌐" },
];

/**
 * @param investedKrw 납입 원금(₩)
 * @param monthsActive 가장 오래된 이벤트 날짜부터 오늘까지 월수
 */
export function companyTier(investedKrw: number, monthsActive: number): CompanyTier {
  const v = Math.max(0, Number.isFinite(investedKrw) ? investedKrw : 0);
  const m = Math.max(0, Number.isFinite(monthsActive) ? monthsActive : 0);
  let index = 0;
  for (let i = 0; i < COMPANY_TIERS.length; i++) {
    if (v >= COMPANY_TIERS[i].lo && m >= COMPANY_TIERS[i].minMonths) index = i;
  }
  const cur = COMPANY_TIERS[index];
  const next = COMPANY_TIERS[index + 1] ?? null;
  const capitalProgress =
    next === null ? 1 : Math.max(0, Math.min(1, (v - cur.lo) / (next.lo - cur.lo)));
  const monthsProgress =
    next === null ? 1 : Math.max(0, Math.min(1, (m - cur.minMonths) / (next.minMonths - cur.minMonths)));
  return {
    index,
    label: cur.label,
    emoji: cur.emoji,
    lo: cur.lo,
    minMonths: cur.minMonths,
    nextLo: next?.lo ?? null,
    nextMinMonths: next?.minMonths ?? null,
    capitalProgress,
    monthsProgress,
    total: COMPANY_TIERS.length,
  };
}
