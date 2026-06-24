/**
 * 수기 평가 자산(부동산·실물·대체) = "사업부" 레이어.
 *
 * 평가원천 = 수기. 피드(시세) 자산이 아니므로 투자 XIRR 에서 제외하고
 * 순자산(자산 − 부채)에만 합산한다(메모리 xirr-asset-scope).
 * 모든 금액 ₩(기능통화). 표시 통화 환산은 화면에서 factor 로.
 */

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
  /** 현재 평가액(₩, 수기). */
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
}

/**
 * 부동산 사업부 합산 — 실현/미실현/종합. 취득가 없는 자산은 수익률에서 제외.
 * 임대·매도는 events와 무관(자체 원장).
 */
export function computeRealEstateDivision(
  assets: ManualAsset[],
  incomes: ManualAssetIncome[],
): RealEstateDivision {
  let cost = 0;
  let unrealized = 0;
  let realized = 0;
  for (const a of assets) {
    const c = effectiveCost(a);
    if (c == null) continue; // 취득가 모르면 수익률 스코프 밖(가치는 별도 합산)
    cost += c;
    unrealized += unrealizedGain(a);
    realized += saleGain(a) + rentNet(a.id, incomes);
  }
  const gain = unrealized + realized;
  return {
    cost,
    unrealized,
    realized,
    gain,
    ret: cost > 0 ? gain / cost : null,
    realizedRet: cost > 0 ? realized / cost : null,
    unrealizedRet: cost > 0 ? unrealized / cost : null,
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
 */
export function computeDivisions(
  assets: ManualAsset[],
  incomes: ManualAssetIncome[],
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
      totals: computeRealEstateDivision(group, groupIncomes),
      assets: group,
    });
  }
  return out;
}
