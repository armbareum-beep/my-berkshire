/**
 * 기업 등급 — 납입 원금(invested = 설립자본 + 증자 − 인출) 규모로 결정.
 *
 * 원칙(헌법 II 정직한 게이미피케이션 · §3.2 로망):
 *  · **평가액(시장 결과)이 아니라 납입 원금** 기준 — 운용 규모는 납입·시간의 함수라 정직하다.
 *    시장 등락만으로는 등급이 흔들리지 않는다.
 *  · "개인투자자=저렙" 프레이밍 금지 — 1단계부터 격 있는 라벨.
 * 구간·라벨은 아래 상수로 튜닝 가능.
 */
export interface CompanyTier {
  /** 0-based 현재 등급 인덱스. */
  index: number;
  label: string;
  emoji: string;
  /** 이 등급 하한(₩). */
  lo: number;
  /** 다음 등급 하한(₩). 최상위면 null. */
  nextLo: number | null;
  /** 현재 등급 내 다음 등급까지 진행도(0~1). 최상위=1. */
  progress: number;
  /** 전체 등급 수. */
  total: number;
}

export interface TierDef {
  /** 이 등급 하한(₩, 납입 원금). */
  lo: number;
  label: string;
  emoji: string;
}

/** 등급 구간(납입 원금 ₩ 기준, 작은 것부터). 튜닝 가능. */
export const COMPANY_TIERS: readonly TierDef[] = [
  { lo: 0, label: "신생 투자회사", emoji: "🌱" },
  { lo: 10_000_000, label: "성장하는 투자회사", emoji: "🌿" },
  { lo: 50_000_000, label: "자산운용사", emoji: "🏢" },
  { lo: 100_000_000, label: "패밀리오피스", emoji: "🏛️" },
  { lo: 500_000_000, label: "버크셔의 길", emoji: "🎩" },
];

export function companyTier(investedKrw: number): CompanyTier {
  const v = Math.max(0, Number.isFinite(investedKrw) ? investedKrw : 0);
  let index = 0;
  for (let i = 0; i < COMPANY_TIERS.length; i++) {
    if (v >= COMPANY_TIERS[i].lo) index = i;
  }
  const cur = COMPANY_TIERS[index];
  const next = COMPANY_TIERS[index + 1] ?? null;
  const progress =
    next === null
      ? 1
      : Math.max(0, Math.min(1, (v - cur.lo) / (next.lo - cur.lo)));
  return {
    index,
    label: cur.label,
    emoji: cur.emoji,
    lo: cur.lo,
    nextLo: next?.lo ?? null,
    progress,
    total: COMPANY_TIERS.length,
  };
}
