/**
 * 세율·수수료 설정 — 단일 출처.
 *
 * 규칙(전역): 세율은 DB(events)에 저장하지 않고 여기 상수로만 둔다.
 * 값이 바뀌면 이 파일만 고친다. UI·계산 로직은 이 상수를 호출만 한다.
 *
 * 참고: 한국 증권거래세는 매도 시에만 부과(매수 비과세). 배당세는 원천징수.
 * 아래 값은 시점에 따라 변하므로 "설정"으로 둔다(2025 기준 초기값).
 */

export type AccountType = "GENERAL" | "ISA" | "PENSION" | "IRP" | "OVERSEAS";

/** 계좌유형 한글 라벨(UI 표시용). PENSION=연금저축, IRP는 별개. */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  GENERAL: "일반",
  ISA: "ISA",
  PENSION: "연금저축",
  IRP: "IRP",
  OVERSEAS: "해외",
};

/** UI 선택용 순서 고정 목록. */
export const ACCOUNT_TYPES: AccountType[] = [
  "GENERAL",
  "ISA",
  "PENSION",
  "IRP",
  "OVERSEAS",
];

export interface TaxConfig {
  /** 배당소득세율(원천징수, 지방소득세 포함). 예: 0.154 = 15.4% */
  dividendTaxRate: number;
  /** 증권거래세율(매도 시에만 부과). 예: 0.0015 = 0.15% */
  transactionTaxRate: number;
}

/**
 * 계좌유형별 세금 설정.
 *
 * 배당세(수령 시점) 1차 근사:
 *  · GENERAL / OVERSEAS → 15.4% 원천징수.
 *  · ISA / 연금저축 / IRP → 수령 시점 **과세이연/비과세** → 0%.
 *    (실제로는 ISA 비과세한도·연금 인출 시 저율 분리과세 등 정밀 규칙이 있으나,
 *     "수령 시점에 떼이지 않는다"는 사실이 핵심 → 0으로 근사. 정밀 세제는 별도 마일스톤.)
 *
 * 거래세(매도)는 계좌유형과 무관하게 동일 → 전 유형 0.15% 유지.
 */
export const TAX_CONFIG: Record<AccountType, TaxConfig> = {
  GENERAL: {
    dividendTaxRate: 0.154, // 배당 15.4%
    transactionTaxRate: 0.0015, // 매도 거래세 0.15%
  },
  OVERSEAS: {
    dividendTaxRate: 0.154, // 일반 위탁과 동일하게 원천징수(정밀 외국납부세액공제는 추후)
    transactionTaxRate: 0.0015,
  },
  // ── 절세계좌: 수령 시점 배당세 0(과세이연/비과세). ──
  ISA: {
    dividendTaxRate: 0,
    transactionTaxRate: 0.0015,
  },
  PENSION: {
    dividendTaxRate: 0, // 연금저축: 과세이연(인출 시 과세)
    transactionTaxRate: 0.0015,
  },
  IRP: {
    dividendTaxRate: 0, // IRP: 과세이연(인출 시 과세)
    transactionTaxRate: 0.0015,
  },
};

/** 계좌유형의 세금 설정을 반환. */
export function getTaxConfig(accountType: AccountType): TaxConfig {
  return TAX_CONFIG[accountType];
}

// ── 세액공제 트래킹 ────────────────────────────────────────────────

/**
 * 절세계좌별 세액공제 규칙 (2025년 기준, 소득기준 중간 구간 기본값).
 *
 * ISA: 납입한도 2,000만원/년. 비과세 혜택이 주목적이라 creditRate=0.
 * 연금저축: 납입한도 1,800만원이나 세액공제 한도는 600만원. 공제율 13.2%(소득 5,500만원↓ 16.5%).
 * IRP: 연금저축과 합산 900만원 한도. 연금저축 없을 경우 단독 900만원까지 공제.
 * 연금저축+IRP 합산 한도: 900만원(소득 1.2억 초과 시 700만원).
 *
 * creditRate는 중간구간(총급여 5,500만원 초과·1.2억 이하) 기본값.
 * 실제 적용 세율은 소득에 따라 다르므로 설정에서 조정 가능하게 둔다.
 */
export interface TaxCreditConfig {
  /** 연간 납입 한도(원). 이 금액까지 납입 추적. */
  annualLimit: number;
  /** 세액공제 적용 한도(원). annualLimit보다 작을 수 있음. */
  creditLimit: number;
  /** 세액공제율(지방세 포함). 0이면 세액공제 없음(ISA 등). */
  creditRate: number;
  /** 합산 그룹. 같은 그룹은 한도를 공유함. null이면 독립 한도. */
  creditGroup: "pension" | null;
}

export const TAX_CREDIT_CONFIG: Partial<Record<AccountType, TaxCreditConfig>> = {
  ISA: {
    annualLimit: 20_000_000,
    creditLimit: 0,
    creditRate: 0,
    creditGroup: null,
  },
  PENSION: {
    annualLimit: 18_000_000,
    creditLimit: 6_000_000,
    creditRate: 0.132, // 총급여 5,500만원 초과 구간 기본값. 이하면 0.165
    creditGroup: "pension",
  },
  IRP: {
    annualLimit: 18_000_000,
    creditLimit: 9_000_000, // 연금저축과 합산 한도(연금저축 없을 경우 단독 최대)
    creditRate: 0.132,
    creditGroup: "pension",
  },
};

/** pension 그룹 합산 세액공제 한도(연금저축+IRP). */
export const PENSION_GROUP_CREDIT_LIMIT = 9_000_000;

export interface TaxCreditSummary {
  accountType: AccountType;
  label: string;
  yearDeposit: number;
  annualLimit: number;
  creditLimit: number;
  creditRate: number;
  /** 세액공제 적용 금액 = min(yearDeposit, creditLimit). */
  creditBase: number;
  /** 예상 세액공제액 = creditBase × creditRate. */
  estimatedCredit: number;
  /** 한도 대비 납입 비율. */
  fillRatio: number;
}

/**
 * 계좌별 연간 입금액(DEPOSIT)을 받아 세액공제 요약을 반환.
 * pensionGroupDeposit: PENSION+IRP 합산 납입액(그룹 한도 적용용).
 */
export function computeTaxCreditSummaries(
  deposits: Partial<Record<AccountType, number>>,
  year: string,
): TaxCreditSummary[] {
  void year; // 향후 연도별 세법 변경 분기 예약

  // pension 그룹 합산 납입액 계산
  const pensionTotal =
    (deposits["PENSION"] ?? 0) + (deposits["IRP"] ?? 0);

  const summaries: TaxCreditSummary[] = [];

  for (const [type, config] of Object.entries(TAX_CREDIT_CONFIG) as [
    AccountType,
    TaxCreditConfig,
  ][]) {
    const yearDeposit = deposits[type] ?? 0;

    // pension 그룹: 합산 한도로 각 계좌 공제 기반 계산
    let creditBase: number;
    if (config.creditGroup === "pension") {
      // 그룹 전체가 PENSION_GROUP_CREDIT_LIMIT 내에서 공제. 각 계좌 비율로 안분.
      const groupCapped = Math.min(pensionTotal, PENSION_GROUP_CREDIT_LIMIT);
      const ratio = pensionTotal > 0 ? yearDeposit / pensionTotal : 0;
      creditBase = Math.min(yearDeposit, Math.round(groupCapped * ratio));
    } else {
      creditBase = Math.min(yearDeposit, config.creditLimit);
    }

    summaries.push({
      accountType: type,
      label: ACCOUNT_TYPE_LABEL[type],
      yearDeposit,
      annualLimit: config.annualLimit,
      creditLimit: config.creditGroup === "pension" ? PENSION_GROUP_CREDIT_LIMIT : config.creditLimit,
      creditRate: config.creditRate,
      creditBase,
      estimatedCredit: Math.round(creditBase * config.creditRate),
      fillRatio: config.annualLimit > 0 ? Math.min(1, yearDeposit / config.annualLimit) : 0,
    });
  }

  return summaries;
}
