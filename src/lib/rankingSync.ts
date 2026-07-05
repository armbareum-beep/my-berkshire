/**
 * 랭킹 점수 upsert — /ranking, /dashboard 양쪽에서 공유하는 코어.
 *
 * 채점(computeRankingScore)은 순수 함수라 호출부에서 이미 계산해 넘긴다.
 * 이 함수는 "저장"만 담당 — 거래가 없으면(events.length===0) 저장할 점수가
 * 없으므로 skip(랭킹 테이블에 무의미한 0점 로우가 쌓이지 않게).
 *
 * 상장(IPO) 게이트(036) — 랭킹 참가는 방문만으로 자동 등록되지 않는다.
 * holding.listed_at 이 null(미상장/폐지)이면 이 함수는 아무 것도 하지 않는다.
 * DB 쪽에도 같은 조건이 ranking_scores 의 own_score_upsert RLS WITH CHECK 로
 * 이중 방어되어 있다(배포 스큐·멀티 디바이스 race에서도 미상장 유저 행이 생기지 않게).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { Portfolio } from "@/lib/portfolio";
import type { BenchmarkResult } from "@/lib/finance/benchmark";
import type { PublicMilestonesV1 } from "@/lib/rankingMilestones";
import type { CompositionV1 } from "@/lib/rankingComposition";
import { computeRankingScore, SCORE_VERSION, assetBucketLabel } from "@/lib/ranking";

/**
 * 활성 holding 의 랭킹 점수를 계산해 ranking_scores 에 upsert 한다.
 * events 가 없으면(아직 거래 기록 없는 유저) 아무 것도 하지 않는다.
 */
export async function upsertRankingScore(
  supabase: SupabaseClient<Database>,
  portfolio: Portfolio,
  benchmark: BenchmarkResult,
  today: string,
  opts: {
    debtKrw: number;
    milestones: PublicMilestonesV1 | null;
    /** 유형별 구성 비중(%만, 035). 시세 실패 등으로 산출 불가면 null. */
    composition: CompositionV1 | null;
  },
): Promise<void> {
  const { holding, events, prices, result } = portfolio;
  if (holding.listed_at == null) return; // 미상장/폐지 — 랭킹 저장 대상 아님(옵트인 게이트)
  if (events.length === 0) return;

  const score = computeRankingScore(
    events,
    prices,
    holding.founded_at,
    result,
    benchmark,
    today,
    { initialValuation: Number(holding.initial_valuation), debtKrw: opts.debtKrw },
  );

  const { error } = await supabase.from("ranking_scores").upsert(
    {
      holding_id: holding.id,
      holding_name: holding.listed_name?.trim() || holding.name,
      total_score: score.total,
      holding_period_score: score.holdingPeriod,
      contrarian_score: score.contrarian,
      market_score: score.marketOutperformance,
      diversification_score: score.diversification,
      deposit_score: score.deposit,
      leverage_score: score.lowLeverage,
      cost_score: score.lowCost,
      score_version: SCORE_VERSION,
      founded_at: holding.founded_at,
      milestones: opts.milestones as unknown as Json,
      // 035 — 점수 산정에는 관여하지 않는 순수 표시 컬럼(XIRR·자산 구간·구성 비중).
      xirr: result.xirr,
      asset_bucket: assetBucketLabel(result.currentValuation),
      composition: opts.composition as unknown as Json,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "holding_id" },
  );
  if (error) {
    // 조용히 삼키면 랭킹이 스테일한 채로 방치돼도 알 수 없다(배당 sync와 동일 관례).
    console.error(`[ranking] upsert failed (holding=${holding.id}):`, error.message);
  }
}
