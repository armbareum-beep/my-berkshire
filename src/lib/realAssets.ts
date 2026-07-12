import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { ManualAsset, ManualAssetIncome } from "./finance/realAssets";

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
    acquisitionCost:
      r.acquisition_cost == null ? null : Number(r.acquisition_cost),
    valuationSource: r.valuation_source,
    valuedAt: r.valued_at,
    salePrice: r.sale_price == null ? null : Number(r.sale_price),
    saleAt: r.sale_at,
    saleCost: r.sale_cost == null ? null : Number(r.sale_cost),
    valuationMethod: (r.valuation_method ?? "direct") as ManualAsset["valuationMethod"],
    capRate: r.cap_rate == null ? null : Number(r.cap_rate),
    rtmsLawdCd: r.rtms_lawd_cd,
    rtmsPropertyType: r.rtms_property_type,
    rtmsComplexName: r.rtms_complex_name,
    rtmsExclusiveArea:
      r.rtms_exclusive_area == null ? null : Number(r.rtms_exclusive_area),
  }));
}

/**
 * 한 holding 의 부동산 사업부 임대수익 원장(소프트 삭제 제외).
 * events 와 분리된 자체 원장.
 */
export async function loadManualAssetIncome(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<ManualAssetIncome[]> {
  const { data } = await supabase
    .from("manual_asset_income")
    .select("*")
    .eq("holding_id", holdingId)
    .is("deleted_at", null)
    .order("date", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id,
    assetId: r.manual_asset_id,
    date: r.date,
    amount: Number(r.amount),
    cost: Number(r.cost),
  }));
}
