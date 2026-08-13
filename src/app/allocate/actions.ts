"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true } | { ok: false; error: string };

/**
 * 전사 기본 요구수익률("난이도") 저장 — PRD v0.3 §3.2.
 *
 * 종목별 `valuation_assumptions.er_required_return` 은 건드리지 않는다. 그쪽이 늘 우선이라
 * 여기서 덮으면 "이 기업만은 20% 아니면 안 산다"는 사용자의 개별 판단이 지워진다.
 * 되돌리려면 null 을 넘긴다 → 코드 기본값(12%)으로 복귀.
 */
export async function setHouseHurdle(rate: number | null): Promise<Result> {
  if (rate != null && !(rate > 0 && rate <= 1))
    return { ok: false, error: "요구수익률은 0~100% 사이여야 합니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("holdings")
    .update({ required_return: rate })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  // 허들이 바뀌면 배분 순위·매수 한도가 전부 다시 계산된다.
  revalidatePath("/allocate");
  return { ok: true };
}

/**
 * 자본배분 후보(Approved Universe) 상태 저장 — PRD v0.3 §3.1.
 *
 * 보유 여부와 무관하게 한 행으로 다룬다. 보유 중인데 행이 없던 종목을 WATCH 로 내리면
 * 새 행이 생기고(= 명시적 제외), APPROVED 로 올리면 아직 안 산 기업도 후보가 된다.
 *
 * 종목을 지우지는 않는다 — 이 앱은 거래 원장을 지우지 않고, 후보 목록도 같은 원칙이다.
 */
export async function setUniverseStatus(
  symbol: string,
  status: "APPROVED" | "WATCH",
): Promise<Result> {
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("watchlist")
    .upsert(
      { holding_id: holding.id, symbol, status },
      { onConflict: "holding_id,symbol" },
    );
  if (error) return { ok: false, error: error.message };

  // 후보가 바뀌면 배분안도, 목표비중 화면의 종목 목록도 달라진다.
  revalidatePath("/allocate");
  revalidatePath("/allocate/universe");
  revalidatePath("/rebalance");
  return { ok: true };
}
