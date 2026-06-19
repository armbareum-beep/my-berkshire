import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/** 연도 무관 가치평가 가정(할인율·성장률). */
export interface ValuationAssumptions {
  /** 할인율(요구수익률, 소수). null=기본 규칙(10년물×2, floor 8%). */
  discountRate: number | null;
  /** 성장률(고든, 소수). null=0%(무성장). */
  growthRate: number | null;
}

/** 한 연도의 수기 금액(D&A·유지CapEx). */
export interface ManualMagnitude {
  /** 감가상각비(D&A, ₩). 한국 공시 미제공분 수기. */
  dna: number | null;
  /** 유지(maintenance)CapEx(₩). null=총CapEx 전액(보수적). */
  maintCapex: number | null;
}

/** 종목의 가치평가 가정(연도 무관). 없으면 null. */
export async function loadValuationAssumptions(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  symbol: string,
): Promise<ValuationAssumptions | null> {
  const { data } = await supabase
    .from("valuation_assumptions")
    .select("discount_rate, growth_rate")
    .eq("holding_id", holdingId)
    .eq("symbol", symbol)
    .maybeSingle();
  if (!data) return null;
  return {
    discountRate: data.discount_rate == null ? null : Number(data.discount_rate),
    growthRate: data.growth_rate == null ? null : Number(data.growth_rate),
  };
}

/** 종목의 연도별 수기 금액 맵(fiscal_year → {dna, maintCapex}). 다년 정규화용. */
export async function loadManualMagnitudes(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  symbol: string,
): Promise<Map<number, ManualMagnitude>> {
  const { data } = await supabase
    .from("manual_fundamentals")
    .select("dna, maint_capex, fiscal_year")
    .eq("holding_id", holdingId)
    .eq("symbol", symbol);
  const map = new Map<number, ManualMagnitude>();
  for (const r of data ?? []) {
    map.set(r.fiscal_year, {
      dna: r.dna == null ? null : Number(r.dna),
      maintCapex: r.maint_capex == null ? null : Number(r.maint_capex),
    });
  }
  return map;
}
