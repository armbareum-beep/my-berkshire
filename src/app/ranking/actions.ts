"use server";

/**
 * 상장(IPO) 옵트인 서버 액션(036) — 랭킹 참가는 방문만으로 자동 등록되지 않는다.
 * holding.listed_at 이 세워져야 rankingSync.ts 의 upsert 게이트를 통과하고,
 * ranking_scores 의 own_score_upsert RLS WITH CHECK 도 같은 컬럼을 본다(이중 방어).
 * 화면(IpoCard)에서도 심사 요건을 안내하지만, 여기서 서버 재검증을 한 번 더 한다
 * (요청 위조·경합 방어) — rebalance/actions.ts 의 Result 패턴을 따른다.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";
import { todayKST } from "@/lib/date";

type Result = { ok: true } | { ok: false; error: string };

/** 상장명 최대 길이(리더보드 공개 이름, 회사명과 분리 — 프라이버시). */
const LISTED_NAME_MAX = 20;

/**
 * 상장(IPO) — 심사 요건(설립 확정 + 거래 존재)을 서버에서 재검증한 뒤 listed_at 을 세운다.
 * listedName 이 비어 있으면(트림 후) 회사명을 그대로 쓴다(listed_name=null).
 * first_listed_at 은 최초 상장일만 기록(불변, 재상장에도 유지 — 연혁용).
 */
export async function listCompany(listedName?: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  if (!holding.founding_declared)
    return { ok: false, error: "설립 확정 후 상장할 수 있어요." };

  // events 존재 재검증 — accounts id 조회 후 count(head:true), saveRebalancePlan 패턴 축약.
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id);
  const accountIds = (accounts ?? []).map((a) => a.id);
  const { count } = accountIds.length
    ? await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .in("account_id", accountIds)
        .is("deleted_at", null)
    : { count: 0 };
  if (!count) return { ok: false, error: "거래 기록이 있어야 상장할 수 있어요." };

  const trimmed = (listedName ?? "").trim();
  if (trimmed.length > LISTED_NAME_MAX)
    return { ok: false, error: `상장명은 ${LISTED_NAME_MAX}자 이내로 입력하세요.` };

  const today = todayKST();
  const { error } = await supabase
    .from("holdings")
    .update({
      listed_at: today,
      first_listed_at: holding.first_listed_at ?? today,
      listed_name: trimmed || null,
    })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/ranking");
  revalidatePath("/company");
  revalidatePath("/dashboard");
  revalidatePath("/timeline");
  revalidatePath("/growth");
  return { ok: true };
}

/**
 * 상장폐지 — 순서 중요: ① listed_at=null(게이트부터 닫기) → ② 본인 ranking_scores 행 DELETE.
 * ①이 실패하면 ②를 시도하지 않는다. ②가 실패해도 게이트는 이미 닫혀 있어(①성공)
 * 스테일 행이 리더보드에 다시 채워지는 일은 없다(안전한 실패 방향) — 다만 이 경우
 * DELETE 실패를 그대로 error Result 로 알려 재시도를 유도한다.
 * first_listed_at·listed_name 은 연혁·다음 상장을 위해 건드리지 않는다(불변).
 */
export async function delistCompany(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error: gateError } = await supabase
    .from("holdings")
    .update({ listed_at: null })
    .eq("id", holding.id);
  if (gateError) return { ok: false, error: gateError.message };

  const { error: deleteError } = await supabase
    .from("ranking_scores")
    .delete()
    .eq("holding_id", holding.id);
  if (deleteError) return { ok: false, error: deleteError.message };

  revalidatePath("/ranking");
  revalidatePath("/company");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * 상장명 변경 — 리더보드 공개 이름(회사명과 분리, 프라이버시: 자산 구간이 공개되므로
 * 익명성 있는 이름으로 상장 가능해야 한다). 상장 중이면 ranking_scores.holding_name 도
 * 즉시 갱신해 다음 방문(after() 재계산)을 기다리지 않고 반영한다.
 */
export async function updateListedName(name: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "상장명을 입력하세요." };
  if (trimmed.length > LISTED_NAME_MAX)
    return { ok: false, error: `상장명은 ${LISTED_NAME_MAX}자 이내로 입력하세요.` };

  const holding = await getActiveHolding(supabase);
  if (!holding) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("holdings")
    .update({ listed_name: trimmed })
    .eq("id", holding.id);
  if (error) return { ok: false, error: error.message };

  if (holding.listed_at != null) {
    const { error: scoreError } = await supabase
      .from("ranking_scores")
      .update({ holding_name: trimmed })
      .eq("holding_id", holding.id);
    if (scoreError) return { ok: false, error: scoreError.message };
  }

  revalidatePath("/ranking");
  revalidatePath("/company");
  return { ok: true };
}
