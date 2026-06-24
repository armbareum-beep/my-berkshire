"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { todayKST } from "@/lib/date";

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
