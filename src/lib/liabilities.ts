import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { Liability } from "./finance/liabilities";

/**
 * 한 holding 의 활성 부채를 계산용 형태로 로드(소프트 삭제 제외).
 * 차입일·최근 등록 순으로 정렬.
 */
export async function loadLiabilities(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<Liability[]> {
  const { data } = await supabase
    .from("liabilities")
    .select("*")
    .eq("holding_id", holdingId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    principal: Number(r.principal),
    interestRate: Number(r.interest_rate),
    startedAt: r.started_at,
  }));
}
