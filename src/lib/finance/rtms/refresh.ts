/**
 * 거래사례비교법 갱신 오케스트레이션.
 *
 * 당월부터 최근 monthsBack개월을 역순으로 조회해 첫 매칭 월의 최신 실거래
 * 1건을 반환한다. 신고 지연(계약 후 30일)으로 최신 월이 비어 있어도 자연히
 * 이전 달로 넘어간다. loadMonth 주입으로 테스트 스텁·cron 메모캐시를 지원.
 */

import { fetchRtmsDealsForMonth, recentDealYmds } from "./client";
import { latestComparableDeal } from "./match";
import type { RtmsDeal, RtmsPropertyType } from "./parse";

export const DEFAULT_MONTHS_BACK = 6;

export async function findLatestComparableDeal(args: {
  type: RtmsPropertyType;
  lawdCd: string;
  complexName: string;
  /** 전용면적(㎡). */
  area: number;
  /** 기준일(YYYY-MM-DD). */
  today: string;
  monthsBack?: number;
  loadMonth?: (dealYmd: string) => Promise<RtmsDeal[]>;
}): Promise<RtmsDeal | null> {
  const { type, lawdCd, complexName, area, today } = args;
  const load =
    args.loadMonth ?? ((ymd: string) => fetchRtmsDealsForMonth(type, lawdCd, ymd));
  for (const ymd of recentDealYmds(today, args.monthsBack ?? DEFAULT_MONTHS_BACK)) {
    const hit = latestComparableDeal(await load(ymd), complexName, area);
    if (hit) return hit;
  }
  return null;
}
