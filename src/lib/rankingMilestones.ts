/**
 * 랭킹 프로필 시트 공개 연혁 — 금액·종목명 없이 "날짜"만 담는 jsonb(v1).
 *
 * 원천: finance/milestones.ts의 journeyMilestones() 로직을 참고하되, 계획 완수·드로다운
 * 통과·최초 이벤트는 "날짜"만 남기고 투입자본 돌파(금액 노출)·종목명 라벨은 제외한다
 * (비공개 불변식 — 033 헌법 정합, 자산 금액·종목·XIRR 절대값은 항상 비공개).
 * 설립 N주년은 저장하지 않고 ranking_scores.founded_at 에서 매 조회 시 파생(호출부 책임).
 */
import type { InvestmentEvent } from "./finance/valuation";
import type { DrawdownEpisode } from "./finance/drawdown";
import { parsePlan, planCompletionDate } from "./plan";
import { countryOf } from "./securities";

export interface PublicMilestonesV1 {
  v: 1;
  plans_completed: number;
  plan_completed_dates: string[];
  drawdowns_passed: { bucket: number; recovered_at: string }[];
  first_buy_at: string | null;
  first_overseas_at: string | null;
  first_dividend_at: string | null;
}

const earliestDate = (events: InvestmentEvent[]): string | null =>
  events.length === 0
    ? null
    : [...events].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date;

/**
 * 공개 연혁 빌드 — 호출부가 events·아카이브 계획·드로다운 에피소드를 이미 로드해서 넘긴다
 * (로딩·시세 재조회는 이 함수 책임이 아님, 순수 CPU 계산).
 */
export function buildPublicMilestones(params: {
  holding: { archived_plans: unknown };
  events: InvestmentEvent[];
  /** 전체 드로다운 에피소드(필터 안 됨) — passed 만 내부에서 골라 쓴다. */
  drawdownEpisodes: DrawdownEpisode[];
  today: string;
}): PublicMilestonesV1 {
  const { holding, events, drawdownEpisodes } = params;

  // archived_plans는 방어적 파싱 — 배열이 아니거나 항목이 손상됐으면 []/스킵(milestones.ts와 동일 관례).
  const archivedPlans = Array.isArray(holding.archived_plans)
    ? (holding.archived_plans as unknown[])
        .map((raw) => parsePlan(raw))
        .filter((p): p is NonNullable<ReturnType<typeof parsePlan>> => p !== null)
    : [];
  const planCompletedDates = archivedPlans
    .map((plan) => planCompletionDate(plan, events))
    .filter((d): d is string => d !== null)
    .sort();

  const drawdownsPassed = drawdownEpisodes
    .filter((e) => e.passed)
    .map((e) => ({ bucket: e.bucket, recovered_at: e.recoveryDate as string }))
    .sort((a, b) => (a.recovered_at < b.recovered_at ? -1 : 1));

  const firstBuy = earliestDate(events.filter((e) => e.type === "BUY"));
  const firstOverseas = earliestDate(
    events.filter(
      (e) => e.type === "BUY" && e.symbol && countryOf(e.symbol) !== "한국",
    ),
  );
  const firstDividend = earliestDate(
    events.filter((e) => e.type === "DIVIDEND"),
  );

  return {
    v: 1,
    plans_completed: planCompletedDates.length,
    plan_completed_dates: planCompletedDates,
    drawdowns_passed: drawdownsPassed,
    first_buy_at: firstBuy,
    first_overseas_at: firstOverseas,
    first_dividend_at: firstDividend,
  };
}

/** jsonb → PublicMilestonesV1(방어적 파싱). 스키마 불일치·구버전(v≠1)이면 null. */
export function parsePublicMilestones(raw: unknown): PublicMilestonesV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (
    typeof o.plans_completed !== "number" ||
    !Array.isArray(o.plan_completed_dates) ||
    !Array.isArray(o.drawdowns_passed)
  ) {
    return null;
  }

  return {
    v: 1,
    plans_completed: o.plans_completed,
    plan_completed_dates: o.plan_completed_dates.filter(
      (d): d is string => typeof d === "string",
    ),
    drawdowns_passed: o.drawdowns_passed.filter(
      (d): d is { bucket: number; recovered_at: string } =>
        !!d &&
        typeof d === "object" &&
        typeof (d as Record<string, unknown>).bucket === "number" &&
        typeof (d as Record<string, unknown>).recovered_at === "string",
    ),
    first_buy_at: typeof o.first_buy_at === "string" ? o.first_buy_at : null,
    first_overseas_at:
      typeof o.first_overseas_at === "string" ? o.first_overseas_at : null,
    first_dividend_at:
      typeof o.first_dividend_at === "string" ? o.first_dividend_at : null,
  };
}
