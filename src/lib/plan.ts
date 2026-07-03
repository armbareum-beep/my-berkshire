/**
 * 리밸런싱 계획(자본배분 작전명령서) — 계산기 결과를 저장하고,
 * 진행률은 events(계획일 이후 매수)에서 파생한다(별도 done 상태 없음 → 불일치 방지).
 */
import { type InvestmentEvent } from "./finance/valuation";

export interface PlanLeg {
  symbol: string;
  name: string;
  shares: number; // 계획 매수 주수
  /** 계획 저장 시점의 누적 매수 주수(기준선). 이후 증가분만 진행으로 인정 → 날짜·모드 무관. */
  baseBought: number;
}

export interface RebalancePlan {
  /** 저장일(YYYY-MM-DD) — 표시용. 진행 판정은 baseBought 기준. */
  createdAt: string;
  legs: PlanLeg[];
}

export interface PlanLegProgress extends PlanLeg {
  /** 계획일 이후 그 종목 누적 매수 주수. */
  bought: number;
  done: boolean;
}

export interface PlanProgress {
  createdAt: string;
  legs: PlanLegProgress[];
  doneCount: number;
  total: number;
  /** 전부 체결됐는지. */
  complete: boolean;
}

/** jsonb → RebalancePlan(방어적 파싱). 형식이 깨졌으면 null. */
export function parsePlan(raw: unknown): RebalancePlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.createdAt !== "string" || !Array.isArray(o.legs)) return null;
  const legs: PlanLeg[] = [];
  for (const l of o.legs) {
    if (!l || typeof l !== "object") continue;
    const leg = l as Record<string, unknown>;
    if (typeof leg.symbol === "string" && typeof leg.shares === "number")
      legs.push({
        symbol: leg.symbol,
        name: typeof leg.name === "string" ? leg.name : leg.symbol,
        shares: leg.shares,
        baseBought: typeof leg.baseBought === "number" ? leg.baseBought : 0,
      });
  }
  if (legs.length === 0) return null;
  return { createdAt: o.createdAt, legs };
}

/** 종목별 누적 매수 주수(활성 이벤트 전체, 날짜 무관). */
export function cumulativeBought(
  events: InvestmentEvent[],
): Record<string, number> {
  const by: Record<string, number> = {};
  for (const e of events) {
    if (e.type === "BUY" && e.symbol && e.quantity)
      by[e.symbol] = (by[e.symbol] ?? 0) + e.quantity;
  }
  return by;
}

/**
 * 계획 진행률 — 저장 시점 기준선(baseBought) 대비 *증가분*으로 체결 판정.
 * 챌린지는 모든 매수가 "오늘"이라 날짜 비교가 불가 → 기준선 방식이 정확.
 * bought(증가분) >= shares 면 done.
 */
export function planProgress(
  plan: RebalancePlan,
  events: InvestmentEvent[],
): PlanProgress {
  const cum = cumulativeBought(events);
  const legs: PlanLegProgress[] = plan.legs.map((l) => {
    const bought = Math.max(0, (cum[l.symbol] ?? 0) - l.baseBought);
    return { ...l, bought, done: bought >= l.shares };
  });
  const doneCount = legs.filter((l) => l.done).length;
  return {
    createdAt: plan.createdAt,
    legs,
    doneCount,
    total: legs.length,
    complete: doneCount === legs.length,
  };
}

/**
 * 계획 완수일 — 연혁 영구화용(완수 여부·날짜는 저장하지 않고 매번 events에서 재판정, 헌장 V).
 * leg별로 그 종목 BUY 이벤트를 날짜순 누적해 baseBought+shares(목표 누적치)에 처음 도달한
 * 날짜를 구한다. 모든 leg가 도달했으면 그중 가장 늦은 날짜(전부 체결된 시점)를 반환.
 * 하나라도 미도달이면 null(미완수 상태로 아카이브된 계획).
 */
export function planCompletionDate(
  plan: RebalancePlan,
  events: InvestmentEvent[],
): string | null {
  const bySymbol = new Map<string, InvestmentEvent[]>();
  for (const e of events) {
    if (e.type === "BUY" && e.symbol && e.quantity) {
      const arr = bySymbol.get(e.symbol);
      if (arr) arr.push(e);
      else bySymbol.set(e.symbol, [e]);
    }
  }

  let latestDate: string | null = null;
  for (const leg of plan.legs) {
    const target = leg.baseBought + leg.shares;
    const legEvents = [...(bySymbol.get(leg.symbol) ?? [])].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );

    let cum = 0;
    let reachedAt: string | null = null;
    for (const e of legEvents) {
      cum += e.quantity as number;
      if (cum >= target) {
        reachedAt = e.date;
        break;
      }
    }
    if (reachedAt === null) return null; // 이 leg 미도달 → 계획 전체 미완수
    if (latestDate === null || reachedAt > latestDate) latestDate = reachedAt;
  }
  return latestDate;
}
