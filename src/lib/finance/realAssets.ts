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
