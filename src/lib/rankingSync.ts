/**
 * 랭킹 점수 upsert — /ranking, /dashboard 양쪽에서 공유하는 코어.
 *
 * 채점(computeRankingScore)은 순수 함수라 호출부에서 이미 계산해 넘긴다.
 * 이 함수는 "저장"만 담당 — 거래가 없으면(events.length===0) 저장할 점수가
 * 없으므로 skip(랭킹 테이블에 무의미한 0점 로우가 쌓이지 않게).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Portfolio } from "@/lib/portfolio";
import type { BenchmarkResult } from "@/lib/finance/benchmark";
import { computeRankingScore } from "@/lib/ranking";

/**
 * 활성 holding 의 랭킹 점수를 계산해 ranking_scores 에 upsert 한다.
 * events 가 없으면(아직 거래 기록 없는 유저) 아무 것도 하지 않는다.
 */
export async function upsertRankingScore(
  supabase: SupabaseClient<Database>,
  portfolio: Portfolio,
  benchmark: BenchmarkResult,
  today: string,
): Promise<void> {
  const { holding, events, prices, result } = portfolio;
  if (events.length === 0) return;

  const score = computeRankingScore(
    events,
    prices,
    holding.founded_at,
    result,
    benchmark,
    today,
  );

  const { error } = await supabase.from("ranking_scores").upsert(
    {
      holding_id: holding.id,
      holding_name: holding.name,
      total_score: score.total,
      holding_period_score: score.holdingPeriod,
      contrarian_score: score.contrarian,
      market_score: score.marketOutperformance,
      diversification_score: score.diversification,
      deposit_score: score.deposit,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "holding_id" },
  );
  if (error) {
    // 조용히 삼키면 랭킹이 스테일한 채로 방치돼도 알 수 없다(배당 sync와 동일 관례).
    console.error(`[ranking] upsert failed (holding=${holding.id}):`, error.message);
  }
}
