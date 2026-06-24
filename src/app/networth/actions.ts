"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  LIABILITY_KINDS,
  type LiabilityKind,
} from "@/lib/finance/liabilities";
import {
  MANUAL_ASSET_KINDS,
  type ManualAssetKind,
} from "@/lib/finance/realAssets";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true } | { ok: false; error: string };

export interface LiabilityInput {
  name: string;
  kind: LiabilityKind;
  /** 현재 잔액(₩). */
  principal: number;
  /** 연이율(%, 사용자 입력 단위). 내부에 소수로 저장. */
  interestPct: number;
  /** 차입일(YYYY-MM-DD) 또는 빈 문자열. */
  startedAt?: string;
}

/** 활성 holding id 조회(부채는 회사 레벨 재무상태표 항목). */
async function getHoldingId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  return (await getActiveHolding(supabase))?.id ?? null;
}

function validate(input: LiabilityInput): string | null {
  if (!input.name.trim()) return "부채 이름을 입력하세요.";
  if (!LIABILITY_KINDS.includes(input.kind)) return "부채 종류가 올바르지 않습니다.";
  if (!(input.principal >= 0)) return "잔액이 올바르지 않습니다.";
  if (!(input.interestPct >= 0)) return "이자율이 올바르지 않습니다.";
  return null;
}

export async function addLiability(input: LiabilityInput): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase.from("liabilities").insert({
    holding_id: holdingId,
    name: input.name.trim(),
    kind: input.kind,
    principal: input.principal,
    interest_rate: input.interestPct / 100, // % → 소수
    started_at: input.startedAt || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard"); // 홈 레버리지 배너 갱신
  return { ok: true };
}

export async function updateLiability(
  id: string,
  input: LiabilityInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  // RLS 가 소유권을 보장하므로 id 로만 갱신.
  const { error } = await supabase
    .from("liabilities")
    .update({
      name: input.name.trim(),
      kind: input.kind,
      principal: input.principal,
      interest_rate: input.interestPct / 100,
      started_at: input.startedAt || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard"); // 홈 레버리지 배너 갱신
  return { ok: true };
}

export async function deleteLiability(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 소프트 삭제(events 와 동일 관례) — 기록 보존.
  const { error } = await supabase
    .from("liabilities")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard"); // 홈 레버리지 배너 갱신
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 수기 평가 자산(부동산·실물·대체) — "사업부". 순자산에만 합산, 투자 XIRR 제외.
// ─────────────────────────────────────────────────────────────

export interface ManualAssetInput {
  name: string;
  kind: ManualAssetKind;
  /** 현재 평가액(₩, 수기). */
  currentValue: number;
  /** 취득가(₩) 또는 null/undefined. */
  acquiredPrice?: number | null;
  /** 취득일(YYYY-MM-DD) 또는 빈 문자열. */
  acquiredAt?: string;
  note?: string;
  /** 취득 부대비용(세금·중개 단일 합산, ₩) 또는 null. */
  acquisitionCost?: number | null;
  /** 평가 출처(KB시세·실거래가·감정가 등). */
  valuationSource?: string;
  /** 평가 갱신일(YYYY-MM-DD) 또는 빈 문자열. */
  valuedAt?: string;
}

function validateAsset(input: ManualAssetInput): string | null {
  if (!input.name.trim()) return "자산 이름을 입력하세요.";
  if (!MANUAL_ASSET_KINDS.includes(input.kind))
    return "자산 종류가 올바르지 않습니다.";
  if (!(input.currentValue >= 0)) return "평가액이 올바르지 않습니다.";
  if (input.acquiredPrice != null && !(input.acquiredPrice >= 0))
    return "취득가가 올바르지 않습니다.";
  if (input.acquisitionCost != null && !(input.acquisitionCost >= 0))
    return "취득 부대비용이 올바르지 않습니다.";
  return null;
}

export async function addManualAsset(
  input: ManualAssetInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validateAsset(input);
  if (invalid) return { ok: false, error: invalid };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase.from("manual_assets").insert({
    holding_id: holdingId,
    name: input.name.trim(),
    kind: input.kind,
    current_value: input.currentValue,
    acquired_price: input.acquiredPrice ?? null,
    acquired_at: input.acquiredAt || null,
    note: input.note?.trim() || null,
    acquisition_cost: input.acquisitionCost ?? null,
    valuation_source: input.valuationSource?.trim() || null,
    valued_at: input.valuedAt || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateManualAsset(
  id: string,
  input: ManualAssetInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const invalid = validateAsset(input);
  if (invalid) return { ok: false, error: invalid };

  // RLS 가 소유권 보장 → id 로만 갱신.
  const { error } = await supabase
    .from("manual_assets")
    .update({
      name: input.name.trim(),
      kind: input.kind,
      current_value: input.currentValue,
      acquired_price: input.acquiredPrice ?? null,
      acquired_at: input.acquiredAt || null,
      note: input.note?.trim() || null,
      acquisition_cost: input.acquisitionCost ?? null,
      valuation_source: input.valuationSource?.trim() || null,
      valued_at: input.valuedAt || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteManualAsset(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("manual_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 부동산 사업부 임대수익(실현) — events 와 분리된 자체 원장.
// ─────────────────────────────────────────────────────────────

export interface ManualAssetIncomeInput {
  manualAssetId: string;
  /** 받은 날(YYYY-MM-DD). */
  date: string;
  /** 임대수익(₩). */
  amount: number;
  /** 임대 관련 비용(재산세·관리비 단일 합산, ₩). 모르면 0. */
  cost?: number;
}

export async function addManualAssetIncome(
  input: ManualAssetIncomeInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.manualAssetId) return { ok: false, error: "자산을 찾을 수 없습니다." };
  if (!input.date) return { ok: false, error: "받은 날을 입력하세요." };
  if (!(input.amount >= 0)) return { ok: false, error: "임대수익이 올바르지 않습니다." };
  if (input.cost != null && !(input.cost >= 0))
    return { ok: false, error: "비용이 올바르지 않습니다." };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase.from("manual_asset_income").insert({
    holding_id: holdingId,
    manual_asset_id: input.manualAssetId,
    date: input.date,
    amount: input.amount,
    cost: input.cost ?? 0,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteManualAssetIncome(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("manual_asset_income")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 부동산 매도(처분) — 매도차익 실현. 매도 대금은 events 미연동.
// ─────────────────────────────────────────────────────────────

export interface SellManualAssetInput {
  salePrice: number;
  saleAt: string;
  saleCost?: number;
}

export async function sellManualAsset(
  id: string,
  input: SellManualAssetInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (!(input.salePrice >= 0)) return { ok: false, error: "매도가가 올바르지 않습니다." };
  if (!input.saleAt) return { ok: false, error: "매도일을 입력하세요." };
  if (input.saleCost != null && !(input.saleCost >= 0))
    return { ok: false, error: "매도 비용이 올바르지 않습니다." };

  // RLS 가 소유권 보장 → id 로만 갱신.
  const { error } = await supabase
    .from("manual_assets")
    .update({
      sale_price: input.salePrice,
      sale_at: input.saleAt,
      sale_cost: input.saleCost ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}
