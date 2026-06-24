import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { FinancingReconciliation } from "./finance/financing";

/**
 * 한 holding 의 금융비용 보정 체크포인트 로드(소프트 삭제 제외, spec 012).
 * events 와 분리된 division-level 원장. date 오름차순.
 * 테이블 미배포(마이그레이션 전) 등 오류 시 빈 배열로 폴백 → 추정만으로 동작.
 */
export async function loadFinancingReconciliations(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<FinancingReconciliation[]> {
  const { data } = await supabase
    .from("financing_reconciliation")
    .select("*")
    .eq("holding_id", holdingId)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    division: "REAL_ESTATE",
    date: r.date,
    kind: r.kind === "capital" ? "capital" : "interest_actual",
    amount: Number(r.amount),
    note: r.note,
  }));
}
