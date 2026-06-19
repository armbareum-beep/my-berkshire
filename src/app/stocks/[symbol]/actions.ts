"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHolding } from "@/lib/holdings";

type Result = { ok: true } | { ok: false; error: string };

/** 활성 holding id. */
async function getHoldingId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  return (await getActiveHolding(supabase))?.id ?? null;
}

/**
 * 수기 펀더멘털(연도별 금액) 저장 — 오너이익(순이익 + D&A − CapEx) 산출용.
 * D&A: 한국 DART 는 주석에만 둬 자동 불가 → 직접 입력.
 * 유지CapEx: 공시는 유지/성장 CapEx 를 안 나눠줌 → 비우면 총CapEx 전액(보수적), 넣으면 대체.
 * **연도별 1행**(holding,symbol,fiscal_year) → 연도가 섞이지 않음(다년 정규화 기반).
 */
export async function setManualFundamentals(
  symbol: string,
  fields: { dna: number | null; maintCapex: number | null },
  fiscalYear: number,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };
  if (!fiscalYear) return { ok: false, error: "사업연도가 올바르지 않습니다." };
  if (fields.dna != null && !(fields.dna >= 0))
    return { ok: false, error: "감가상각비가 올바르지 않습니다." };
  if (fields.maintCapex != null && !(fields.maintCapex >= 0))
    return { ok: false, error: "유지CapEx가 올바르지 않습니다." };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  // 둘 다 비면 그 연도 행 삭제(빈 행 방지).
  if (fields.dna == null && fields.maintCapex == null) {
    await supabase
      .from("manual_fundamentals")
      .delete()
      .eq("holding_id", holdingId)
      .eq("symbol", symbol)
      .eq("fiscal_year", fiscalYear);
    revalidatePath(`/stocks/${symbol}`);
    return { ok: true };
  }

  const { error } = await supabase.from("manual_fundamentals").upsert(
    {
      holding_id: holdingId,
      symbol,
      dna: fields.dna,
      maint_capex: fields.maintCapex,
      fiscal_year: fiscalYear,
    },
    { onConflict: "holding_id,symbol,fiscal_year" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/stocks/${symbol}`);
  return { ok: true };
}

/** 한 연도의 수기 금액 삭제(자동/공시값으로 복귀). */
export async function clearManualFundamentals(
  symbol: string,
  fiscalYear: number,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("manual_fundamentals")
    .delete()
    .eq("holding_id", holdingId)
    .eq("symbol", symbol)
    .eq("fiscal_year", fiscalYear);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/stocks/${symbol}`);
  return { ok: true };
}

/** valuation_assumptions(종목당 1행) 부분 upsert 헬퍼 — 한 필드만 갱신, 다른 필드 보존. */
async function upsertAssumption(
  symbol: string,
  patch: { discount_rate?: number | null; growth_rate?: number | null },
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "로그인이 필요합니다." };
  if (!symbol) return { ok: false, error: "종목이 올바르지 않습니다." };

  const holdingId = await getHoldingId(supabase);
  if (!holdingId) return { ok: false, error: "회사를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("valuation_assumptions")
    .upsert(
      { holding_id: holdingId, symbol, ...patch },
      { onConflict: "holding_id,symbol" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/stocks/${symbol}`);
  return { ok: true };
}

/**
 * 할인율(요구수익률) 저장/초기화 — 내재가치 = 오너이익 / (할인율 − 성장률).
 * rate=null → 기본 규칙(10년물×2, floor 8%) 복귀. 소수(0.09=9%). 연도 무관.
 */
export async function setDiscountRate(
  symbol: string,
  rate: number | null,
): Promise<Result> {
  if (rate != null && !(rate > 0 && rate <= 1))
    return { ok: false, error: "할인율은 0~100% 사이여야 합니다." };
  return upsertAssumption(symbol, { discount_rate: rate });
}

/**
 * 성장률(고든) 저장/초기화 — rate=null → 0%(무성장). 소수(0.04=4%). 연도 무관.
 * g<할인율 가드는 호출부(컴포넌트)에서.
 */
export async function setGrowthRate(
  symbol: string,
  rate: number | null,
): Promise<Result> {
  if (rate != null && !(rate >= 0 && rate < 1))
    return { ok: false, error: "성장률은 0~100% 미만이어야 합니다." };
  return upsertAssumption(symbol, { growth_rate: rate });
}
