import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { ManualAsset } from "./finance/realAssets";

/**
 * 한 holding 의 활성 수기 평가 자산을 계산용 형태로 로드(소프트 삭제 제외).
 */
export async function loadManualAssets(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<ManualAsset[]> {
  const { data } = await supabase
    .from("manual_assets")
    .select("*")
    .eq("holding_id", holdingId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    currentValue: Number(r.current_value),
    acquiredPrice: r.acquired_price == null ? null : Number(r.acquired_price),
    acquiredAt: r.acquired_at,
    note: r.note,
  }));
}
