/**
 * 증권사 프리셋 — 계좌 추가/수정 시 드롭다운으로 고르면 대표 수수료율 자동 입력.
 *
 * ⚠️ commissionRate 는 **비대면(온라인) 대표값(참고용)**이다. 실제 수수료는
 *    거래대금 구간·이벤트·유관기관 제비용에 따라 다르므로 **편집 가능**으로 둔다.
 *    값은 lib/config 단일 출처(세율과 동일 원칙) — 바뀌면 이 파일만 고친다.
 *
 * color = 칩(이니셜 배지) 브랜드 컬러. 로고 에셋은 라이선스 부담 → 이니셜+컬러로 대체.
 */

export interface Broker {
  id: string;
  name: string;
  /** 비대면 위탁수수료율(소수). 0.00015 = 0.015%. 대표값(편집 가능). */
  commissionRate: number;
  /** 칩 배경 브랜드 컬러(hex). */
  color: string;
}

/** 주요 증권사 비대면 대표 수수료(참고용). 저렴→비쌈 순서 무관, 표시는 이름순. */
export const BROKERS: Broker[] = [
  { id: "toss", name: "토스증권", commissionRate: 0.00015, color: "#3182F6" },
  { id: "kiwoom", name: "키움증권", commissionRate: 0.00015, color: "#C8102E" },
  { id: "korea", name: "한국투자증권", commissionRate: 0.00014, color: "#003C71" },
  { id: "mirae", name: "미래에셋증권", commissionRate: 0.000140, color: "#FF6600" },
  { id: "samsung", name: "삼성증권", commissionRate: 0.000147, color: "#1428A0" },
  { id: "nh", name: "NH투자증권", commissionRate: 0.0001253, color: "#00A86B" },
  { id: "kb", name: "KB증권", commissionRate: 0.000142, color: "#FFB800" },
  { id: "shinhan", name: "신한투자증권", commissionRate: 0.0001469, color: "#0046FF" },
  { id: "daishin", name: "대신증권", commissionRate: 0.00015, color: "#012F6B" },
];

export function findBroker(id: string | null | undefined): Broker | undefined {
  return id ? BROKERS.find((b) => b.id === id) : undefined;
}

/** 가장 저렴한 증권사(랭킹·절약액 기준). */
export function cheapestBroker(): Broker {
  return BROKERS.reduce((min, b) =>
    b.commissionRate < min.commissionRate ? b : min,
  );
}

/**
 * 수수료 랭킹 — 주어진 수수료율이 주요 증권사 중 얼마나 저렴한지.
 * @returns cheaperThanPct = 이 율보다 비싼 증권사 비율(0~100). 높을수록 저렴(상위).
 */
export function feeRank(rate: number): { cheaperThanPct: number; label: string } {
  const moreExpensive = BROKERS.filter((b) => b.commissionRate > rate).length;
  const cheaperThanPct = Math.round((moreExpensive / BROKERS.length) * 100);
  const label =
    cheaperThanPct >= 70
      ? "아주 저렴"
      : cheaperThanPct >= 40
        ? "보통"
        : "비싼 편";
  return { cheaperThanPct, label };
}

/** 연 위탁수수료(₩) = 연 거래대금 × 율. */
export function annualCommission(annualVolumeKrw: number, rate: number): number {
  return annualVolumeKrw * rate;
}

/** 최저 수수료 증권사로 바꿨을 때 연 절약액(₩). 이미 최저면 0. */
export function savingsVsCheapest(annualVolumeKrw: number, rate: number): number {
  const cheapest = cheapestBroker().commissionRate;
  return Math.max(0, annualVolumeKrw * (rate - cheapest));
}
