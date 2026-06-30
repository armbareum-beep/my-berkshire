/**
 * 자산배분 집계 — 종목별 평가액을 태그(국가/유형)별로 합산.
 * 값은 호출부에서 받은 그대로(표시 통화). 현금은 별도 슬라이스.
 */
import type { AllocationSlice } from "./dashboard";
import type { SecurityRecord } from "./securities";

export interface TagSlice {
  label: string;
  value: number;
  weight: number; // 0~1 (전체 자산 대비)
}

export type TagKey = "country" | "assetType" | "sector";

/** 태그별 라벨 추출 — 폴백 포함. 섹터 미분류는 "미분류". */
export function tagLabel(m: SecurityRecord | undefined, tag: TagKey): string {
  if (tag === "country") return m?.country ?? "기타";
  if (tag === "sector") return m?.sector ?? "미분류";
  return m?.assetType ?? "주식";
}

/** 자산 유형 표시 순서 — 보유한 유형만 이 순서대로 노출. */
export const ASSET_TYPE_ORDER = ["주식", "ETF", "원자재", "코인"] as const;

export interface AllocationGroup {
  type: string;
  slices: AllocationSlice[];
}

/**
 * 종목별 배분을 자산 유형(주식/ETF/원자재/코인)으로 그룹화 — 보유한 유형만, 고정 순서.
 * 비중(weight)은 입력 그대로(전체 자산 대비). 현금은 호출부에서 별도 처리.
 */
export function groupAllocationByType(
  allocation: AllocationSlice[],
  meta: Record<string, SecurityRecord>,
): AllocationGroup[] {
  const byType = new Map<string, AllocationSlice[]>();
  for (const a of allocation) {
    const type = meta[a.symbol]?.assetType ?? "주식";
    const list = byType.get(type) ?? [];
    list.push(a);
    byType.set(type, list);
  }
  const known = ASSET_TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
    type: t as string,
    slices: byType.get(t)!,
  }));
  // 순서에 없는 미지의 유형도 뒤에 붙여 누락 방지.
  const extra = [...byType.keys()]
    .filter((t) => !ASSET_TYPE_ORDER.includes(t as (typeof ASSET_TYPE_ORDER)[number]))
    .map((t) => ({ type: t, slices: byType.get(t)! }));
  return [...known, ...extra];
}

/**
 * 자산 유형 그룹화 — ETF는 단일 "ETF" 그룹으로 묶되 각 slice에 countryTag 를 세팅.
 * AllocationCard 가 ETF 섹션 내부를 국가별로 집계해 표시(국가 드릴다운 UX).
 * 홈 대시보드 자산 구성 카드용. allocation 페이지의 국가별 탭과는 별개.
 */
export function groupAllocationByTypeWithEtfCountry(
  allocation: AllocationSlice[],
  meta: Record<string, SecurityRecord>,
): AllocationGroup[] {
  const byType = new Map<string, AllocationSlice[]>();
  for (const a of allocation) {
    const m = meta[a.symbol];
    const assetType = m?.assetType ?? "주식";
    const list = byType.get(assetType) ?? [];
    // 주식·ETF 모두 countryTag 첨부 — 카드에서 국가별 집계용.
    list.push({ ...a, countryTag: m?.country ?? "기타" });
    byType.set(assetType, list);
  }
  // 고정 순서: 주식 → ETF → 원자재 → 코인
  const known = ASSET_TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
    type: t as string,
    slices: byType.get(t)!,
  }));
  const extra = [...byType.keys()]
    .filter((t) => !ASSET_TYPE_ORDER.includes(t as (typeof ASSET_TYPE_ORDER)[number]))
    .map((t) => ({ type: t, slices: byType.get(t)! }));
  return [...known, ...extra];
}

/**
 * 특정 자산유형 안에서 국가별 AllocationGroup 반환.
 * 예: assetType="주식" → [{ type:"한국", slices:[...] }, { type:"미국", slices:[...] }]
 * 주식 구성 카드를 국가별로 분리 표시할 때 사용. 비중은 입력 그대로(전체 자산 대비).
 */
export function groupTypeByCountry(
  allocation: AllocationSlice[],
  meta: Record<string, SecurityRecord>,
  assetType: string,
): AllocationGroup[] {
  const byCountry = new Map<string, AllocationSlice[]>();
  for (const a of allocation) {
    const m = meta[a.symbol];
    if ((m?.assetType ?? "주식") !== assetType) continue;
    const country = m?.country ?? "기타";
    const list = byCountry.get(country) ?? [];
    list.push(a);
    byCountry.set(country, list);
  }
  return [...byCountry.entries()]
    .map(([type, slices]) => ({ type, slices }))
    .sort((a, b) => {
      const va = a.slices.reduce((s, x) => s + x.value, 0);
      const vb = b.slices.reduce((s, x) => s + x.value, 0);
      return vb - va;
    });
}

/** allocation(종목별) + 현금 → 태그별 합산 슬라이스(비중 내림차순). */
export function groupByTag(
  allocation: AllocationSlice[],
  meta: Record<string, SecurityRecord>,
  cash: number,
  tag: TagKey,
): TagSlice[] {
  const totals = new Map<string, number>();
  for (const a of allocation) {
    const key = tagLabel(meta[a.symbol], tag);
    totals.set(key, (totals.get(key) ?? 0) + a.value);
  }
  // 섹터는 주식·ETF의 산업 차원 — 현금은 섹터가 없어 합산에서 제외(국가·유형만 현금 포함).
  if (cash > 0 && tag !== "sector")
    totals.set("현금", (totals.get("현금") ?? 0) + cash);

  const total = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      value,
      weight: total > 0 ? value / total : 0,
    }))
    .sort((a, b) => b.value - a.value);
}
