import {
  computeReturn,
  type HoldingSnapshot,
  type ReturnResult,
} from "./returns";
import type { InvestmentEvent, PriceMap } from "./valuation";

export interface BusinessCandidate {
  symbol: string;
  name: string;
  eventCount: number;
}

/** 매수·매도·배당 이력이 있는 모든 사업부. 전량 매각한 종목도 분석에 남긴다. */
export function businessCandidates(
  events: InvestmentEvent[],
  names: Record<string, string>,
): BusinessCandidate[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (!event.symbol) continue;
    if (event.type !== "BUY" && event.type !== "SELL" && event.type !== "DIVIDEND")
      continue;
    counts.set(event.symbol, (counts.get(event.symbol) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([symbol, eventCount]) => ({
      symbol,
      name: names[symbol] ?? symbol,
      eventCount,
    }))
    .sort(
      (a, b) =>
        b.eventCount - a.eventCount ||
        a.name.localeCompare(b.name, "ko"),
    );
}

/**
 * 선택한 사업부가 없었다면 어땠을지 계산한다.
 * 종목 내부 이벤트만 제거하고 증자·인출은 유지하므로, 쓰지 않은 인수대금은 현금으로 남는다.
 */
export function computeReturnWithoutBusinesses(
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  prices: PriceMap,
  today: string,
  excludedSymbols: Iterable<string>,
  pricesAvailable = true,
): ReturnResult {
  const excluded = new Set(excludedSymbols);
  const counterfactualEvents = events.filter((event) => {
    const isBusinessEvent =
      event.type === "BUY" ||
      event.type === "SELL" ||
      event.type === "DIVIDEND";
    return !isBusinessEvent || !event.symbol || !excluded.has(event.symbol);
  });
  return computeReturn(
    holding,
    counterfactualEvents,
    prices,
    today,
    pricesAvailable,
  );
}
