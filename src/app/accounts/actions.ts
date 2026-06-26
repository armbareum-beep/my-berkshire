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
  memberId?: string | null,
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
    member_id: memberId || null, // null = 기본 컴퍼니
    // 비우면 DB 기본값(0.015%) 사용
    ...(rate != null ? { commission_rate: rate } : {}),
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/transactions");
  return { ok: true };
}

/** 계좌 삭제 — 소속 이벤트 포함 영구 삭제. 마지막 계좌는 삭제 불가. */
export async function deleteAccount(accountId: string): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  // 소유권 확인 (RLS + holding 소속 검증)
  const { data: account } = await supabase
    .from("accounts")
    .select("id, holding_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { ok: false, error: "계좌를 찾을 수 없습니다." };

  // 같은 회사에 계좌가 최소 2개 있어야 삭제 가능
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("holding_id", account.holding_id);
  if ((count ?? 0) <= 1)
    return { ok: false, error: "마지막 계좌는 삭제할 수 없습니다." };

  await supabase.from("events").delete().eq("account_id", accountId);
  const { error } = await supabase.from("accounts").delete().eq("id", accountId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** 계좌 수정 — 이름·유형·수수료율 변경(세금은 유형에서 자동). */
export async function updateAccount(
  id: string,
  name: string,
  accountType: AccountType,
  commissionRate: number,
  broker?: string | null,
  memberId?: string | null,
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
      ...(memberId !== undefined ? { member_id: memberId || null } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/holdings");
  revalidatePath("/transactions");
  return { ok: true };
}
