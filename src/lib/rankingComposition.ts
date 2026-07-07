/**
 * 랭킹 프로필 시트 구성 비중 — 유형별(주식/ETF/원자재/코인/현금 + 실물자산 종류) 비중 %만
 * 담는 jsonb(v1). 038에서 실물자산(수기 평가)이 합류해 "통 자산" 구성이 됐다(manual 인자).
 * 정확한 금액·수량은 계산 도중에만 쓰고 절대 저장하지 않는다(034·035·038 비공개 불변식).
 */
import type { SecurityRecord } from "./securities";
import { ASSET_TYPE_ORDER } from "./allocation";
import {
  MANUAL_ASSET_KIND_LABEL,
  isSold,
  type ManualAsset,
} from "./finance/realAssets";

export interface CompositionSliceV1 {
  label: string;
  /** 반올림 정수 %(0~100). 금액은 저장하지 않는다. */
  pct: number;
}

export interface CompositionV1 {
  v: 1;
  slices: CompositionSliceV1[];
}

/**
 * 종목별 보유수량×현재가 + 현금(+ 실물자산)을 유형별로 합산해 비중 %만 반환.
 * 시세 실패(priceAvailable=false)면 null(금액을 알 수 없는데 %를 추정해 보여줄 수 없음).
 * 표시 순서는 ASSET_TYPE_ORDER(주식→ETF→원자재→코인) + 현금, 그 뒤 실물 라벨(금액 내림차순).
 * 반올림 오차는 최대 비중 슬라이스에 몰아 합 100을 맞추고, 0%는 제외한다.
 */
export function computeCompositionPct(params: {
  positions: Record<string, number>;
  prices: Record<string, number>;
  cash: number;
  meta: Record<string, SecurityRecord>;
  priceAvailable: boolean;
  /** 실물자산(수기 평가) 종류별 합산(₩) — 038 "통 자산" 구성. 미전달 시 기존(투자+현금)과 동일. */
  manual?: { label: string; valueKrw: number }[];
}): CompositionV1 | null {
  const { positions, prices, cash, meta, priceAvailable, manual } = params;
  if (!priceAvailable) return null;

  const totals = new Map<string, number>();
  for (const [symbol, qty] of Object.entries(positions)) {
    const price = prices[symbol];
    if (price == null) continue; // 시세 미확보 종목은 반영 안 함(방어적 — priceAvailable로 대부분 걸러짐)
    const type = meta[symbol]?.assetType ?? "주식";
    totals.set(type, (totals.get(type) ?? 0) + qty * price);
  }
  if (cash > 0) totals.set("현금", (totals.get("현금") ?? 0) + cash);
  for (const m of manual ?? []) {
    if (m.valueKrw > 0) totals.set(m.label, (totals.get(m.label) ?? 0) + m.valueKrw);
  }

  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const order = [...ASSET_TYPE_ORDER, "현금"];
  const known = order
    .filter((t) => totals.has(t))
    .map((t) => ({ label: t, value: totals.get(t)! }));
  // 순서 목록에 없는 미지의 유형(방어적, 누락 방지) — 비중 내림차순으로 뒤에 붙임.
  const extra = [...totals.keys()]
    .filter((t) => !order.includes(t))
    .map((t) => ({ label: t, value: totals.get(t)! }))
    .sort((a, b) => b.value - a.value);
  const combined = [...known, ...extra];

  const rounded = combined.map((s) => ({
    label: s.label,
    pct: Math.round((s.value / total) * 100),
  }));
  const sum = rounded.reduce((a, b) => a + b.pct, 0);
  if (rounded.length > 0 && sum !== 100) {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i].pct > rounded[maxIdx].pct) maxIdx = i;
    }
    rounded[maxIdx].pct += 100 - sum;
  }

  return { v: 1, slices: rounded.filter((s) => s.pct > 0) };
}

/**
 * 실물자산(보유 중만, 매도 제외)을 종류 라벨별로 합산해 manual 인자 형태로 —
 * 호출부(랭킹·대시보드) 공용. cap_rate 평가 반영은 호출부에서(applyCapRateValuation).
 */
export function manualCompositionInput(
  assets: ManualAsset[],
): { label: string; valueKrw: number }[] {
  const byLabel = new Map<string, number>();
  for (const a of assets) {
    if (isSold(a)) continue;
    const label = MANUAL_ASSET_KIND_LABEL[a.kind];
    byLabel.set(label, (byLabel.get(label) ?? 0) + a.currentValue);
  }
  return [...byLabel.entries()].map(([label, valueKrw]) => ({ label, valueKrw }));
}

/** jsonb → CompositionV1(방어적 파싱). 스키마 불일치·구버전(v≠1)이면 null. */
export function parseCompositionV1(raw: unknown): CompositionV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.slices)) return null;

  const slices = o.slices.filter(
    (s): s is CompositionSliceV1 =>
      !!s &&
      typeof s === "object" &&
      typeof (s as Record<string, unknown>).label === "string" &&
      typeof (s as Record<string, unknown>).pct === "number",
  );
  return { v: 1, slices };
}
