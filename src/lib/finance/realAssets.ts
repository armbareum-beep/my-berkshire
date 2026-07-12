/**
 * 수기 평가 자산(부동산·실물·대체) = "사업부" 레이어.
 *
 * 평가원천 = 수기. 피드(시세) 자산이 아니므로 투자 XIRR 에서 제외하고
 * 순자산(자산 − 부채)에만 합산한다(메모리 xirr-asset-scope).
 * 모든 금액 ₩(기능통화). 표시 통화 환산은 화면에서 factor 로.
 */

import {
  leverageRatio,
  mortgageLiabilities,
  netWorth,
  type Liability,
} from "./liabilities";
import {
  divisionFinancingCost,
  monthsBetween,
  type DivisionFinancingCost,
  type FinancingReconciliation,
} from "./financing";

export type ManualAssetKind =
  | "REAL_ESTATE"
  | "LAND"
  | "COMMERCIAL"
  | "UNLISTED"
  | "COLLECTIBLE"
  | "OTHER";

export const MANUAL_ASSET_KINDS: ManualAssetKind[] = [
  "REAL_ESTATE",
  "LAND",
  "COMMERCIAL",
  "UNLISTED",
  "COLLECTIBLE",
  "OTHER",
];

export const MANUAL_ASSET_KIND_LABEL: Record<ManualAssetKind, string> = {
  REAL_ESTATE: "부동산",
  LAND: "토지",
  COMMERCIAL: "상가·수익형",
  UNLISTED: "비상장·지분",
  COLLECTIBLE: "실물·수집",
  OTHER: "기타",
};

/** 종류별 한 줄 설명(입력 도움말). */
export const MANUAL_ASSET_KIND_DESC: Record<ManualAssetKind, string> = {
  REAL_ESTATE: "주택·아파트·자가 (실거래가 또는 추정가)",
  LAND: "토지 (공시지가·실거래가)",
  COMMERCIAL: "상가·수익형 건물 (임대수익 나는 부동산)",
  UNLISTED: "비상장 주식·스타트업 지분·스톡옵션",
  COLLECTIBLE: "미술품·시계·와인 등 대체자산",
  OTHER: "그 외 수기 평가 자산",
};

/**
 * 종류별 아이콘(이모지). 표시 측 EmojiIcon이 lucide 라인 아이콘으로 교체한다.
 * 주의: 각 값은 EmojiIcon MAP에 존재하는 키여야 한다(폴백 텍스트 방지).
 */
export const MANUAL_ASSET_KIND_EMOJI: Record<ManualAssetKind, string> = {
  REAL_ESTATE: "🏢",
  LAND: "🌳",
  COMMERCIAL: "🏛️",
  UNLISTED: "🚀",
  COLLECTIBLE: "⭐",
  OTHER: "🧾",
};

/** "사업부" 게이미피케이션 라벨 — 자산 추가 시 성취 토스트용. */
export const MANUAL_ASSET_DIVISION: Record<ManualAssetKind, string> = {
  REAL_ESTATE: "부동산 사업부",
  LAND: "토지 사업부",
  COMMERCIAL: "상업용 부동산 사업부",
  UNLISTED: "벤처 사업부",
  COLLECTIBLE: "대체자산 사업부",
  OTHER: "기타 자산",
};

export interface ManualAsset {
  id: string;
  name: string;
  kind: ManualAssetKind;
  /** 현재 평가액(₩, 수기). cap_rate 방식이면 applyCapRateValuation 후 덮어씌워진다. */
  currentValue: number;
  /** 취득가(₩) 또는 null. */
  acquiredPrice: number | null;
  /** 취득일(YYYY-MM-DD) 또는 null. */
  acquiredAt: string | null;
  note: string | null;
  /** 취득 부대비용(취득세·중개료 등 단일 합산, ₩) 또는 null. */
  acquisitionCost: number | null;
  /** 평가 출처(KB시세·실거래가·감정가 등) 또는 null. */
  valuationSource: string | null;
  /** 평가 갱신일(YYYY-MM-DD) 또는 null. */
  valuedAt: string | null;
  /** 매도가(₩). null=보유 중. */
  salePrice: number | null;
  /** 매도일(YYYY-MM-DD). null이면 보유, 있으면 매도됨. */
  saleAt: string | null;
  /** 매도 부대비용(양도세·중개료 등 단일 합산, ₩) 또는 null. */
  saleCost: number | null;
  /**
   * 평가 방법 — currentValue 의 영속성 규칙이 방식마다 다르다:
   * - 'direct': 영속(사용자 직접 입력)
   * - 'cap_rate': 무시 — 읽기 시 applyCapRateValuation 이 파생값으로 덮어씀
   * - 'transaction_comp': 영속(거래사례비교법 — cron/수동 갱신이 국토부
   *   실거래가를 써 넣음. 읽기 경로는 direct 와 동일)
   */
  valuationMethod: "direct" | "cap_rate" | "transaction_comp";
  /** 환원율(소수, 0.04 = 4%). cap_rate 방식일 때만 의미 있음. */
  capRate: number | null;
  /** RTMS 법정동 시군구 코드 5자리. transaction_comp 방식일 때만. */
  rtmsLawdCd: string | null;
  /** RTMS 유형: APT|RH|OFFI|SILV. transaction_comp 방식일 때만. */
  rtmsPropertyType: string | null;
  /** RTMS 단지명 원문 — 정규화 완전일치 매칭 키. */
  rtmsComplexName: string | null;
  /** 전용면적(㎡) — ±10% 허용오차 매칭. */
  rtmsExclusiveArea: number | null;
}

/** 부동산 사업부 임대수익 기록 — 자산별, events와 분리된 자체 원장. */
export interface ManualAssetIncome {
  id: string;
  assetId: string;
  /** 받은 날(YYYY-MM-DD). */
  date: string;
  /** 임대수익(₩). */
  amount: number;
  /** 임대 관련 비용(재산세·관리비 등 단일 합산, ₩). */
  cost: number;
}

/**
 * 수익률환원법 추정 평가액 = 연간 순임대수익 / 환원율.
 * 최근 12개월 수익 합산. 환원율 없거나 순익 0이면 null.
 */
export function capRateValue(
  assetId: string,
  incomes: ManualAssetIncome[],
  capRate: number,
  today: string,
): number | null {
  if (capRate <= 0) return null;
  const cutoff = new Date(today);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const annualNet = incomes
    .filter((i) => i.assetId === assetId && i.date >= cutoffStr)
    .reduce((s, i) => s + i.amount - i.cost, 0);
  return annualNet > 0 ? Math.round(annualNet / capRate) : null;
}

/**
 * cap_rate 방식 자산의 currentValue를 수익 역산값으로 덮어쓴 배열 반환.
 * 순익 0·환원율 미설정이면 기존 직접입력값 유지(안전 폴백).
 */
export function applyCapRateValuation(
  assets: ManualAsset[],
  incomes: ManualAssetIncome[],
  today: string,
): ManualAsset[] {
  return assets.map((a) => {
    if (a.valuationMethod !== "cap_rate" || !a.capRate) return a;
    const computed = capRateValue(a.id, incomes, a.capRate, today);
    return computed != null ? { ...a, currentValue: computed } : a;
  });
}

/** 수기 자산 총액(₩) = Σ 현재 평가액. */
export function totalManualAssets(items: ManualAsset[]): number {
  return items.reduce((s, a) => s + a.currentValue, 0);
}

/**
 * 평가손익(₩) = 현재평가액 − 취득가. 취득가 없으면 null.
 * 투자 XIRR 과 무관한 "수기 자산 단독" 손익(순자산 변화 설명용).
 */
export function manualAssetGain(a: ManualAsset): number | null {
  if (a.acquiredPrice == null || a.acquiredPrice <= 0) return null;
  return a.currentValue - a.acquiredPrice;
}

/**
 * 취득가가 있는 수기자산의 합산 취득원가·평가손익(₩).
 * 취득가 없는 자산은 수익률 스코프에서 제외(원가 모르면 수익률 계산 불가).
 * "부동산 사업부 수익"을 총자산 누적수익률에 정직하게 합산하는 데 쓰인다(평가는 수기 추정).
 */
export function manualAssetsCostBasis(items: ManualAsset[]): {
  cost: number;
  gain: number;
} {
  let cost = 0;
  let gain = 0;
  for (const a of items) {
    if (a.acquiredPrice != null && a.acquiredPrice > 0) {
      cost += a.acquiredPrice;
      gain += a.currentValue - a.acquiredPrice;
    }
  }
  return { cost, gain };
}

// ── 부동산 사업부(수익 내는 사업부) 계산 ──────────────────────────────
// 실현(임대 + 매도차익, 비용 차감 후) + 미실현(평가차익). 분모 = 실질취득가.

/** 실질취득가 = 취득가 + 취득 부대비용. 취득가 없으면 null(수익률 스코프 밖). */
export function effectiveCost(a: ManualAsset): number | null {
  if (a.acquiredPrice == null || a.acquiredPrice <= 0) return null;
  return a.acquiredPrice + (a.acquisitionCost ?? 0);
}

/** 매도 여부 — 매도일이 있으면 매도됨. */
export function isSold(a: ManualAsset): boolean {
  return a.saleAt != null;
}

/** 보유 중 미실현 평가차익(매도 자산·취득가 없으면 0). */
export function unrealizedGain(a: ManualAsset): number {
  if (isSold(a)) return 0;
  const cost = effectiveCost(a);
  return cost == null ? 0 : a.currentValue - cost;
}

/** 매도차익(net) = 매도가 − 실질취득가 − 매도비용. 보유 중이면 0. */
export function saleGain(a: ManualAsset): number {
  if (!isSold(a) || a.salePrice == null) return 0;
  const cost = effectiveCost(a);
  if (cost == null) return 0;
  return a.salePrice - cost - (a.saleCost ?? 0);
}

/**
 * 자산별 자본 수익률(%) — (현재가/매도가 − 실질취득가) / 실질취득가.
 * 임대수익은 제외(가격 상승만). 취득가 없으면 null.
 */
export function assetReturn(a: ManualAsset): number | null {
  const cost = effectiveCost(a);
  if (cost == null || cost <= 0) return null;
  const value = isSold(a)
    ? (a.salePrice ?? 0) - (a.saleCost ?? 0)
    : a.currentValue;
  return (value - cost) / cost;
}

/** 자산별 임대수익 net 합(amount − cost). */
export function rentNet(assetId: string, incomes: ManualAssetIncome[]): number {
  return incomes
    .filter((i) => i.assetId === assetId)
    .reduce((s, i) => s + i.amount - i.cost, 0);
}

export interface RealEstateDivision {
  /** Σ 실질취득가(취득가 있는 자산, 보유+매도). */
  cost: number;
  /** Σ 보유 미실현 평가차익. */
  unrealized: number;
  /** Σ (임대 net + 매도차익 net). */
  realized: number;
  /** unrealized + realized. */
  gain: number;
  ret: number | null;
  realizedRet: number | null;
  unrealizedRet: number | null;
  /** 주입 시 금융비용 내역(이자 차감·자본 가산 반영됨). 표시용(추정 이자·가중평균율). */
  financing?: DivisionFinancingCost;
  // ── 레버리지 지표(spec 014). 대출 없으면 debt 0·ltv 0 → UI 미노출. ──
  /** 담보대출 잔액 합(₩) = financing?.debt ?? 0. */
  debt: number;
  /** Σ 보유(미매도) 자산 현재 평가액 — 순자산·LTV 분모. 취득가 없는 자산도 포함. */
  marketValue: number;
  /** 실투자금(₩) = 원가 − 대출 = 내가 실제 넣은 돈. */
  ownCapital: number;
  /**
   * 실투자금 수익률 = gain / 실투자금. 레버리지 반영(자산수익률보다 증폭).
   * "수익률"은 임대수익 전제 아님 — 임대 0(거주용·차익형)이면 분자는 평가차익 − 이자.
   * 실투자금 ≤ 0(대출 ≥ 원가)이면 null.
   */
  ownCapitalReturn: number | null;
  /** 순자산(₩) = 보유 평가액 − 대출. */
  netEquity: number;
  /** LTV = 대출 / 보유 평가액. 평가액 0이면 null. */
  ltv: number | null;
}

/**
 * 부동산 사업부 합산 — 실현/미실현/종합. 취득가 없는 자산은 수익률에서 제외.
 * 임대·매도는 events와 무관(자체 원장).
 *
 * `financing` 주입 시(spec 012): 대출 이자를 실현에서 차감하고 자본 투입을 원가에 가산한다
 *   → 이자 차감 후 net 수익률. 미주입 시 011 과 비트 동일(회귀 안전).
 */
export function computeRealEstateDivision(
  assets: ManualAsset[],
  incomes: ManualAssetIncome[],
  financing?: DivisionFinancingCost,
): RealEstateDivision {
  let cost = 0;
  let unrealized = 0;
  let realized = 0;
  let marketValue = 0;
  for (const a of assets) {
    // 보유(미매도) 평가액은 취득가 유무와 무관하게 순자산·LTV 분모에 합산.
    if (!isSold(a)) marketValue += a.currentValue;
    const c = effectiveCost(a);
    if (c == null) continue; // 취득가 모르면 수익률 스코프 밖(가치는 별도 합산)
    cost += c;
    unrealized += unrealizedGain(a);
    realized += saleGain(a) + rentNet(a.id, incomes);
  }
  if (financing) {
    cost += financing.capitalAdded; // 자본 투입 → 분모
    realized -= financing.totalInterest; // 대출 이자 → 실현 차감(분자)
  }
  const gain = unrealized + realized;
  // 레버리지 지표(spec 014): gain·이자는 이미 위에서 반영됨(이자 이중계상 없음).
  const debt = financing?.debt ?? 0;
  const ownCapital = cost - debt; // 실투자금 = 내가 실제 넣은 돈
  return {
    cost,
    unrealized,
    realized,
    gain,
    ret: cost > 0 ? gain / cost : null,
    realizedRet: cost > 0 ? realized / cost : null,
    unrealizedRet: cost > 0 ? unrealized / cost : null,
    financing,
    debt,
    marketValue,
    ownCapital,
    ownCapitalReturn: ownCapital > 0 ? gain / ownCapital : null,
    netEquity: netWorth(marketValue, debt),
    ltv: marketValue > 0 ? leverageRatio(marketValue, debt) : null,
  };
}

/**
 * 부동산 사업부 금융비용 조립 — 호출부 단일 진입점(spec 012).
 * 담보대출만 짝짓고, 누적 기점 폴백 = 부동산 자산 중 가장 이른 취득일(없으면 today).
 * 추정 이자는 저장하지 않고 파생(divisionFinancingCost).
 */
export function realEstateFinancingCost(args: {
  liabilities: Liability[];
  reconciliations: FinancingReconciliation[];
  assets: ManualAsset[];
  today: string;
}): DivisionFinancingCost {
  const reAssets = args.assets.filter(
    (a) => assetDivision(a.kind) === "REAL_ESTATE",
  );
  const reAcquired = reAssets
    .map((a) => a.acquiredAt)
    .filter((d): d is string => !!d)
    .sort();
  // 연결 물건 id → 취득일(연결 대출의 누적 기점).
  const assetAcquiredById: Record<string, string> = {};
  for (const a of reAssets) {
    if (a.acquiredAt) assetAcquiredById[a.id] = a.acquiredAt;
  }
  return divisionFinancingCost({
    liabilities: mortgageLiabilities(args.liabilities),
    reconciliations: args.reconciliations,
    accrualStartFallback: reAcquired[0] ?? args.today,
    assetAcquiredById,
    asOf: args.today,
  });
}

/** 물건에 연결된 대출 한 건(원본 Liability + 월/누적 추정 이자 ₩). 카드에서 수정·삭제에 원본 사용. */
export interface LinkedLoan {
  liability: Liability;
  /** 월 추정 이자 = 잔액 × 이율 / 12. */
  monthly: number;
  /** 누적 추정 이자 = 잔액 × 이율 × 경과개월/12 (기점=차입일·없으면 취득일). */
  cumulative: number;
}

/**
 * 물건별 연결 대출 목록(원본 + 월/누적 추정 이자) — 물건 카드 안에 통합 표시·수정·삭제(spec 012).
 * 대출 정보를 별도 박스가 아니라 그 물건 카드에서 보여주고 편집하기 위함.
 * 연결 안 된 대출은 어느 물건에도 안 잡힌다(사업부 공통). 수익률 분자는 별도(사업부 총액).
 * 잔액·이율이 0이어도(이자 0) 목록엔 포함 — 카드에서 수정 가능해야 하므로.
 */
export function financingByAsset(
  liabilities: Liability[],
  assets: ManualAsset[],
  today: string,
): Record<string, LinkedLoan[]> {
  const acquiredById: Record<string, string> = {};
  for (const a of assets) {
    if (assetDivision(a.kind) === "REAL_ESTATE" && a.acquiredAt) {
      acquiredById[a.id] = a.acquiredAt;
    }
  }
  const out: Record<string, LinkedLoan[]> = {};
  for (const l of mortgageLiabilities(liabilities)) {
    if (l.manualAssetId == null) continue;
    const start = l.startedAt ?? acquiredById[l.manualAssetId] ?? today;
    (out[l.manualAssetId] ??= []).push({
      liability: l,
      monthly: (l.principal * l.interestRate) / 12,
      cumulative:
        (l.principal * l.interestRate * monthsBetween(start, today)) / 12,
    });
  }
  return out;
}

// ── 물건별 지표(spec 014 US3) — 탭하면 펼치는 물건 단위 실투자금 수익률·LTV. ──
// 사업부 합산과 같은 공식이되 그 물건의 연결 대출(manualAssetId)만 쓴다.
// 미연결 공통 대출은 물건별에 안 잡힘(사업부 합산 전용).

export interface AssetMetrics {
  /** 실질취득가(취득가 없으면 null → 수익률 스코프 밖). */
  cost: number | null;
  /** 보유 중 현재 평가액(매도면 0). */
  marketValue: number;
  /** 연결 대출 잔액 합(₩). */
  debt: number;
  /** 연결 대출 누적 추정 이자 합(₩) — gain 분자에서 차감. */
  interest: number;
  /** 미실현 + 매도차익 + 임대순익 − 이자(취득가 없으면 null). */
  gain: number | null;
  /** 자산수익률 = gain / 실질취득가. */
  ret: number | null;
  /** 실투자금 = 실질취득가 − 연결 대출. */
  ownCapital: number | null;
  /** 실투자금 수익률 = gain / 실투자금(≤0이면 null). */
  ownCapitalReturn: number | null;
  /** 순자산 = 평가액 − 연결 대출. */
  netEquity: number;
  /** LTV = 연결 대출 / 평가액(평가액 0이면 null). */
  ltv: number | null;
}

/** 물건 한 건의 지표 — 그 물건의 연결 대출(financingByAsset 결과)만 사용. */
export function computeAssetMetrics(
  a: ManualAsset,
  incomes: ManualAssetIncome[],
  linkedLoans: LinkedLoan[] = [],
): AssetMetrics {
  const cost = effectiveCost(a);
  const marketValue = isSold(a) ? 0 : a.currentValue;
  const debt = linkedLoans.reduce((s, l) => s + l.liability.principal, 0);
  const interest = linkedLoans.reduce((s, l) => s + l.cumulative, 0);
  const gain =
    cost == null
      ? null
      : unrealizedGain(a) + saleGain(a) + rentNet(a.id, incomes) - interest;
  const ownCapital = cost == null ? null : cost - debt;
  return {
    cost,
    marketValue,
    debt,
    interest,
    gain,
    ret: cost != null && cost > 0 && gain != null ? gain / cost : null,
    ownCapital,
    ownCapitalReturn:
      ownCapital != null && ownCapital > 0 && gain != null
        ? gain / ownCapital
        : null,
    netEquity: netWorth(marketValue, debt),
    ltv: marketValue > 0 ? leverageRatio(marketValue, debt) : null,
  };
}

// ── 사업부(자산 클래스) 그룹 ───────────────────────────────────────
// 종류를 사업부로 묶는다. 수익(현금흐름) 내는 사업부만 임대/배당 입력 노출.
// 코인·원자재는 시세가 있어 주식(투자)에서 관리 → 여기 수기 자산엔 없음.

export type AssetDivision = "REAL_ESTATE" | "PHYSICAL" | "BUSINESS" | "OTHER";

const KIND_TO_DIVISION: Record<ManualAssetKind, AssetDivision> = {
  REAL_ESTATE: "REAL_ESTATE",
  LAND: "REAL_ESTATE",
  COMMERCIAL: "REAL_ESTATE",
  COLLECTIBLE: "PHYSICAL", // 미술·수집 등 — 수익 안 냄
  UNLISTED: "BUSINESS", // 비상장·자영업 — 수익 냄(배당·영업이익)
  OTHER: "OTHER",
};

export const ASSET_DIVISION_LABEL: Record<AssetDivision, string> = {
  REAL_ESTATE: "부동산 사업부",
  PHYSICAL: "대체 사업부", // 미술·수집 등 대체자산
  BUSINESS: "사업 사업부",
  OTHER: "기타 자산",
};

/** 현금수익(임대·배당·영업이익)을 내는 사업부인지 — false면 임대/배당 입력 숨김. */
export const ASSET_DIVISION_PRODUCES_INCOME: Record<AssetDivision, boolean> = {
  REAL_ESTATE: true,
  PHYSICAL: false,
  BUSINESS: true,
  OTHER: false,
};

export function assetDivision(kind: ManualAssetKind): AssetDivision {
  return KIND_TO_DIVISION[kind];
}

export interface DivisionView {
  key: AssetDivision;
  label: string;
  producesIncome: boolean;
  totals: RealEstateDivision;
  assets: ManualAsset[];
}

const DIVISION_ORDER: AssetDivision[] = [
  "REAL_ESTATE",
  "BUSINESS",
  "PHYSICAL",
  "OTHER",
];

/**
 * 종류를 사업부로 묶어 사업부별 집계를 반환. 자산이 있는 사업부만(점진적 공개).
 * `financing` 은 REAL_ESTATE 사업부에만 적용(spec 012). 미주입 시 011 과 동일.
 */
export function computeDivisions(
  assets: ManualAsset[],
  incomes: ManualAssetIncome[],
  financing?: DivisionFinancingCost,
): DivisionView[] {
  const byDiv = new Map<AssetDivision, ManualAsset[]>();
  for (const a of assets) {
    const d = assetDivision(a.kind);
    const arr = byDiv.get(d) ?? [];
    arr.push(a);
    byDiv.set(d, arr);
  }
  const out: DivisionView[] = [];
  for (const key of DIVISION_ORDER) {
    const group = byDiv.get(key);
    if (!group || group.length === 0) continue;
    const ids = new Set(group.map((a) => a.id));
    const groupIncomes = incomes.filter((i) => ids.has(i.assetId));
    out.push({
      key,
      label: ASSET_DIVISION_LABEL[key],
      producesIncome: ASSET_DIVISION_PRODUCES_INCOME[key],
      totals: computeRealEstateDivision(
        group,
        groupIncomes,
        key === "REAL_ESTATE" ? financing : undefined,
      ),
      assets: group,
    });
  }
  return out;
}
