/**
 * 기대수익률 가정 로드/저장 — Capital Allocator PRD v0.3 §3.2.
 *
 * `valuation_assumptions` 테이블의 `er_*` 컬럼을 다룬다. 같은 테이블의
 * `discount_rate`/`growth_rate`(고든 성장 모형)와는 **별개 모형**이다 —
 * 성장률의 의미가 달라 섞으면 조용히 틀린 값이 나온다(`finance/expectedReturn.ts` 참고).
 *
 * 종목당 1행이라 `manualFundamentals.ts` 의 로더와 같은 테이블을 보지만, 이쪽은
 * **홀딩 전체를 한 번에** 읽는다(Allocate 화면이 보유 종목 전부를 동시에 계산하므로).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { BaseMetric } from "./finance/expectedReturn";

export interface ExpectedReturnAssumption {
  /** 이익력 기준. null = EPS. */
  baseMetric: BaseMetric | null;
  /** 현재 주당 이익력 수기값(종목 통화). null = 공시에서 자동. */
  currentMetric: number | null;
  /** 향후 N년 이익 CAGR(소수). */
  expectedGrowth: number | null;
  /** 종료 시점 배수(PER/PFCF). */
  terminalMultiple: number | null;
  /** 보유기간(년). null = 5. */
  holdingYears: number | null;
  /** 요구수익률(소수). null = 12%. */
  requiredReturn: number | null;
}

/** 계산에 필요한 최소 입력이 갖춰졌는지 — 이익력·성장률·종료배수 셋. */
export function isComplete(
  a: ExpectedReturnAssumption | undefined,
  autoMetric?: number | null,
): boolean {
  if (!a) return false;
  const metric = a.currentMetric ?? autoMetric ?? null;
  return (
    metric != null &&
    metric > 0 &&
    a.expectedGrowth != null &&
    a.terminalMultiple != null &&
    a.terminalMultiple > 0
  );
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));

function toAssumption(row: {
  er_base_metric: string | null;
  er_current_metric: number | null;
  er_expected_growth: number | null;
  er_terminal_multiple: number | null;
  er_holding_years: number | null;
  er_required_return: number | null;
}): ExpectedReturnAssumption {
  return {
    baseMetric: row.er_base_metric === "FCF" ? "FCF" : row.er_base_metric === "EPS" ? "EPS" : null,
    currentMetric: num(row.er_current_metric),
    expectedGrowth: num(row.er_expected_growth),
    terminalMultiple: num(row.er_terminal_multiple),
    holdingYears: row.er_holding_years == null ? null : Number(row.er_holding_years),
    requiredReturn: num(row.er_required_return),
  };
}

/**
 * 홀딩의 모든 기대수익률 가정(symbol → 가정). 가정이 없는 종목은 맵에 없다.
 * 한 줄도 없으면 빈 맵 — 호출부는 `attractiveness = 1`(중립)로 동작한다.
 */
export async function loadExpectedReturnAssumptions(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<Record<string, ExpectedReturnAssumption>> {
  const { data } = await supabase
    .from("valuation_assumptions")
    .select(
      "symbol, er_base_metric, er_current_metric, er_expected_growth, er_terminal_multiple, er_holding_years, er_required_return",
    )
    .eq("holding_id", holdingId);

  const out: Record<string, ExpectedReturnAssumption> = {};
  for (const row of data ?? []) {
    const a = toAssumption(row);
    // 아무 필드도 없는 행(고든 가정만 저장된 종목)은 담지 않는다.
    if (
      a.baseMetric == null &&
      a.currentMetric == null &&
      a.expectedGrowth == null &&
      a.terminalMultiple == null &&
      a.holdingYears == null &&
      a.requiredReturn == null
    )
      continue;
    out[row.symbol] = a;
  }
  return out;
}

/** 한 종목의 기대수익률 가정. 없으면 null. */
export async function loadExpectedReturnAssumption(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  symbol: string,
): Promise<ExpectedReturnAssumption | null> {
  const { data } = await supabase
    .from("valuation_assumptions")
    .select(
      "er_base_metric, er_current_metric, er_expected_growth, er_terminal_multiple, er_holding_years, er_required_return",
    )
    .eq("holding_id", holdingId)
    .eq("symbol", symbol)
    .maybeSingle();
  return data ? toAssumption(data) : null;
}
