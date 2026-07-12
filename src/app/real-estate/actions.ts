"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { todayKST } from "@/lib/date";
import { findLatestComparableDeal } from "@/lib/finance/rtms/refresh";
import type { RtmsPropertyType } from "@/lib/finance/rtms/parse";

type Result = { ok: true } | { ok: false; error: string };

export interface FinancingReconcileInput {
  /** 보정 기준일(YYYY-MM-DD). */
  date: string;
  /** interest_actual=실제 납부 이자(비용) / capital=자본 투입(분모). */
  kind: "interest_actual" | "capital";
  /** ₩, >= 0. */
  amount: number;
  note?: string;
}

/**
 * 부동산 사업부 금융비용 보정 추가(spec 012). division-level 체크포인트.
 * 실제 납부 이자(비용) 또는 자본 투입을 기록해 추정 누계를 진실에 스냅한다.
 */
export async function addFinancingReconciliation(
  input: FinancingReconcileInput,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  if (input.kind !== "interest_actual" && input.kind !== "capital")
    return { ok: false, error: "보정 종류가 올바르지 않습니다." };
  if (!input.date) return { ok: false, error: "보정 기준일을 입력하세요." };
  if (input.date > todayKST())
    return { ok: false, error: "미래 날짜는 보정할 수 없습니다." };
  if (!(input.amount >= 0)) return { ok: false, error: "금액이 올바르지 않습니다." };

  const holdingId = (await getActiveHolding(supabase))?.id ?? null;
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase.from("financing_reconciliation").insert({
    holding_id: holdingId,
    division: "REAL_ESTATE",
    date: input.date,
    kind: input.kind,
    amount: input.amount,
    note: input.note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/real-estate");
  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}

export type RefreshValuationResult =
  | { ok: true; updated: true; amountKrw: number; dealDate: string }
  | { ok: true; updated: false } // 최근 6개월 무거래 → 기존 평가액 유지
  | { ok: false; error: string };

/**
 * 실거래가(거래사례비교법) 자산 수동 갱신 — 최근 6개월 내 동일 단지·유사 면적의
 * 최신 실거래 1건으로 current_value 를 덮어쓴다. cron(월 1회)과 같은 로직.
 * updateManualAsset(전 컬럼 덮어쓰기)과 달리 평가액·평가일·출처만 좁게 갱신.
 */
export async function refreshTransactionCompValuation(
  assetId: string,
): Promise<RefreshValuationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // RLS 가 소유권 보장 — 내 holding 자산이 아니면 조회되지 않는다.
  const { data: asset, error: loadError } = await supabase
    .from("manual_assets")
    .select(
      "id, valuation_method, rtms_lawd_cd, rtms_property_type, rtms_complex_name, rtms_exclusive_area",
    )
    .eq("id", assetId)
    .is("deleted_at", null)
    .single();
  if (loadError || !asset) return { ok: false, error: "자산을 찾을 수 없습니다." };
  if (
    asset.valuation_method !== "transaction_comp" ||
    !asset.rtms_lawd_cd ||
    !asset.rtms_property_type ||
    !asset.rtms_complex_name ||
    asset.rtms_exclusive_area == null
  )
    return { ok: false, error: "실거래가 방식 자산이 아닙니다." };

  try {
    const deal = await findLatestComparableDeal({
      type: asset.rtms_property_type as RtmsPropertyType,
      lawdCd: asset.rtms_lawd_cd,
      complexName: asset.rtms_complex_name,
      area: Number(asset.rtms_exclusive_area),
      today: todayKST(),
    });
    if (!deal) return { ok: true, updated: false };

    const { error } = await supabase
      .from("manual_assets")
      .update({
        current_value: deal.amountKrw,
        valued_at: deal.date,
        valuation_source: "국토부 실거래가",
      })
      .eq("id", assetId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/real-estate");
    revalidatePath("/networth");
    revalidatePath("/dashboard");
    return { ok: true, updated: true, amountKrw: deal.amountKrw, dealDate: deal.date };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "실거래가 조회에 실패했습니다.",
    };
  }
}

/** 보정 소프트 삭제. */
export async function deleteFinancingReconciliation(id: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await supabase
    .from("financing_reconciliation")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/real-estate");
  revalidatePath("/networth");
  revalidatePath("/dashboard");
  return { ok: true };
}
