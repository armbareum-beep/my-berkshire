"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AccountType } from "@/lib/config/tax";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true } | { ok: false; error: string };

/** 수수료율(소수, 0.00015=0.015%) 검증 — 0 이상 5% 이하. */
function normalizeRate(rate: number | null | undefined): number | null {
  if (rate == null || Number.isNaN(rate)) return null;
  if (rate < 0 || rate > 0.05) return null; // 5% 초과는 입력 오류로 간주
  return rate;
}

/** 계좌 추가 — 자회사(종목)를 담는 새 그릇. 유형이 세금을, 수수료율이 위탁수수료를 좌우. */
export async function createAccount(
  name: string,
  accountType: AccountType,
  commissionRate?: number,
  broker?: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "계좌 이름을 입력하세요." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const rate = normalizeRate(commissionRate);
  const { error } = await supabase.from("accounts").insert({
    holding_id: holding.id,
    name: trimmed,
    account_type: accountType,
    broker: broker || null,
    // 비우면 DB 기본값(0.015%) 사용
    ...(rate != null ? { commission_rate: rate } : {}),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/transactions");
  return { ok: true };
}

/** 계좌 수정 — 이름·유형·수수료율 변경(세금은 유형에서 자동). */
export async function updateAccount(
  id: string,
  name: string,
  accountType: AccountType,
  commissionRate: number,
  broker?: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "계좌 이름을 입력하세요." };

  const rate = normalizeRate(commissionRate);
  if (rate == null)
    return { ok: false, error: "수수료율은 0~5% 사이로 입력하세요." };

  // RLS 가 본인 holding 소속 계좌만 수정 허용.
  const { error } = await supabase
    .from("accounts")
    .update({
      name: trimmed,
      account_type: accountType,
      commission_rate: rate,
      broker: broker || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/transactions");
  return { ok: true };
}
