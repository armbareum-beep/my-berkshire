/**
 * 드로다운 에피소드 로더 — loadPortfolioValueSeries 가 이미 캐시해 둔 일별 ₩ 종가
 * (closes)를 재사용해 buildValueSeries 를 다운샘플 없이(풀해상도) 재구성하고
 * computeDrawdownEpisodes 를 호출한다. 신규 가격 fetch·신규 저장 0(순수 CPU 재계산,
 * calculation_snapshots 신규 kind 없음 — design-notes.md 기능1).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { InvestmentEvent } from "./finance/valuation";
import { buildValueSeries } from "./finance/valueSeries";
import { computeDrawdownEpisodes, type DrawdownEpisode } from "./finance/drawdown";
import { loadPortfolioValueSeries } from "./portfolioValueSeries";

/** 다운샘플 없이 사실상 전체 해상도를 보장하는 상한(약 100년 일수). */
const FULL_RESOLUTION_MAX_POINTS = 36_600;

export async function loadDrawdownEpisodes({
  supabase,
  holdingId,
  portfolioRevision,
  foundedAt,
  initialValuation,
  events,
  today,
}: {
  supabase: SupabaseClient<Database>;
  holdingId: string;
  portfolioRevision: number;
  foundedAt: string;
  initialValuation: number;
  events: InvestmentEvent[];
  today: string;
}): Promise<DrawdownEpisode[]> {
  const { data: valueSeries } = await loadPortfolioValueSeries({
    supabase,
    holdingId,
    portfolioRevision,
    foundedAt,
    initialValuation,
    events,
    today,
  });

  const points = buildValueSeries(
    { foundedAt, initialValuation },
    events,
    valueSeries.closes,
    today,
    FULL_RESOLUTION_MAX_POINTS,
  );

  return computeDrawdownEpisodes(points, events);
}
