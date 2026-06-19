import { daysSince } from "./xirr";
import type { EventType } from "./valuation";

export interface FrictionEvent {
  type: EventType;
  date: string;
  feeAndTax: number;
  priceOrAmount: number;
  quantity?: number | null;
  accountId: string;
  accountName: string;
}

export interface TerHolding {
  symbol: string;
  name: string;
  value: number;
  ter: number;
  firstBuyDate: string;
}

export interface FrictionAnalysis {
  recordedTotal: number;
  investedPrincipal: number;
  drag: number | null;
  thisYear: number;
  last12Months: number;
  byType: { type: EventType; label: string; value: number }[];
  byAccount: { id: string; name: string; value: number }[];
  monthly: { month: string; value: number }[];
  yearly: {
    year: number;
    total: number;
    monthly: { month: string; value: number }[];
  }[];
  turnover: {
    sellGross: number;
    ratio: number | null;
    annualized: number | null;
  };
  ter: {
    annualTotal: number;
    cumulativeTotal: number;
    holdings: (TerHolding & {
      annualCost: number;
      cumulativeCost: number;
      holdingDays: number;
    })[];
  };
}

const TYPE_LABEL: Record<EventType, string> = {
  BUY: "매수 비용",
  SELL: "매도 비용",
  DIVIDEND: "배당 원천비용",
  DEPOSIT: "증자 비용",
  WITHDRAWAL: "인출 비용",
  EXCHANGE: "환전 비용",
};

function shiftMonth(month: string, amount: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

export function computeFrictionAnalysis({
  events,
  terHoldings,
  initialValuation,
  foundedAt,
  today,
}: {
  events: FrictionEvent[];
  terHoldings: TerHolding[];
  initialValuation: number;
  foundedAt: string;
  today: string;
}): FrictionAnalysis {
  const recordedTotal = events.reduce((sum, event) => sum + event.feeAndTax, 0);
  const deposits = events
    .filter((event) => event.type === "DEPOSIT")
    .reduce((sum, event) => sum + event.priceOrAmount, 0);
  const investedPrincipal = initialValuation + deposits;
  const drag = investedPrincipal > 0 ? recordedTotal / investedPrincipal : null;
  const year = today.slice(0, 4);
  const currentMonth = today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, index) =>
    shiftMonth(currentMonth, index - 11),
  );
  const monthSet = new Set(months);
  const monthly = months.map((month) => ({
    month,
    value: events
      .filter((event) => event.date.startsWith(month))
      .reduce((sum, event) => sum + event.feeAndTax, 0),
  }));

  const typeMap = new Map<EventType, number>();
  const accountMap = new Map<string, { name: string; value: number }>();
  for (const event of events) {
    typeMap.set(event.type, (typeMap.get(event.type) ?? 0) + event.feeAndTax);
    const account = accountMap.get(event.accountId) ?? {
      name: event.accountName,
      value: 0,
    };
    account.value += event.feeAndTax;
    accountMap.set(event.accountId, account);
  }

  const sellGross = events
    .filter((event) => event.type === "SELL" && event.quantity)
    .reduce(
      (sum, event) =>
        sum + (event.quantity as number) * event.priceOrAmount,
      0,
    );
  const ratio = investedPrincipal > 0 ? sellGross / investedPrincipal : null;
  const operatingDays = Math.max(1, daysSince(foundedAt, today));
  const annualized = ratio == null ? null : ratio * (365 / operatingDays);

  const terRows = terHoldings.map((holding) => {
    const holdingDays = Math.max(0, daysSince(holding.firstBuyDate, today));
    const annualCost = holding.value * holding.ter;
    return {
      ...holding,
      holdingDays,
      annualCost,
      cumulativeCost: annualCost * (holdingDays / 365),
    };
  });
  const availableYears = [
    ...new Set([
      Number(year),
      ...events.map((event) => Number(event.date.slice(0, 4))),
    ]),
  ].sort((a, b) => a - b);
  const yearly = availableYears.map((yearNumber) => {
    const rows = Array.from({ length: 12 }, (_, index) => {
      const month = `${yearNumber}-${String(index + 1).padStart(2, "0")}`;
      return {
        month,
        value: events
          .filter((event) => event.date.startsWith(month))
          .reduce((sum, event) => sum + event.feeAndTax, 0),
      };
    });
    return {
      year: yearNumber,
      total: rows.reduce((sum, row) => sum + row.value, 0),
      monthly: rows,
    };
  });

  return {
    recordedTotal,
    investedPrincipal,
    drag,
    thisYear: events
      .filter((event) => event.date.startsWith(year))
      .reduce((sum, event) => sum + event.feeAndTax, 0),
    last12Months: events
      .filter((event) => monthSet.has(event.date.slice(0, 7)))
      .reduce((sum, event) => sum + event.feeAndTax, 0),
    byType: [...typeMap.entries()]
      .map(([type, value]) => ({ type, label: TYPE_LABEL[type], value }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value),
    byAccount: [...accountMap.entries()]
      .map(([id, account]) => ({ id, ...account }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value),
    monthly,
    yearly,
    turnover: { sellGross, ratio, annualized },
    ter: {
      annualTotal: terRows.reduce((sum, row) => sum + row.annualCost, 0),
      cumulativeTotal: terRows.reduce(
        (sum, row) => sum + row.cumulativeCost,
        0,
      ),
      holdings: terRows.sort((a, b) => b.annualCost - a.annualCost),
    },
  };
}
