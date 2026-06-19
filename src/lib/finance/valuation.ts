/**
 * 평가액·현금잔고 계산 — /docs/xirr-spec-v1.md 1·4.
 *
 * 현재 평가액 = Σ(보유수량 × 시세) + 현금잔고
 * 현금잔고 = 입금 − 출금 + 배당 + 매도대금 − 매수대금 − Σ(fee_and_tax)
 *
 * 모두 events에서 파생. 실시간 시세는 저장하지 않고 인자로 주입받는다.
 */

export type EventType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "EXCHANGE";

/** UI/DB와 분리된 순수 계산용 이벤트 형태. */
export interface InvestmentEvent {
  type: EventType;
  symbol?: string | null;
  quantity?: number | null;
  /** 거래는 주당 가격, 현금흐름(입금/출금/배당)은 금액. 모두 ₩(기능통화). */
  priceOrAmount: number;
  feeAndTax: number;
  date: string; // YYYY-MM-DD
  /** 네이티브 통화(거래=종목 통화, 현금흐름=해당 통화). 기본 KRW. */
  currency?: string;
  /** 이벤트 시점 1 네이티브당 ₩ 환율(KRW=1). 네이티브 금액 = ₩금액 / fxRate. */
  fxRate?: number;
  /** 환전(EXCHANGE) 받은 통화. */
  toCurrency?: string | null;
  /** 환전(EXCHANGE) 받은 네이티브 금액. */
  toAmount?: number | null;
}

/** 종목별 시세 맵(목업/실시간 공통 인터페이스). */
export type PriceMap = Record<string, number>;

function sum(events: InvestmentEvent[], pred: (e: InvestmentEvent) => number): number {
  return events.reduce((acc, e) => acc + pred(e), 0);
}

/** 종목별 순보유수량(매수 − 매도). */
export function netQuantities(events: InvestmentEvent[]): Record<string, number> {
  const q: Record<string, number> = {};
  for (const e of events) {
    if ((e.type === "BUY" || e.type === "SELL") && e.symbol && e.quantity) {
      const delta = e.type === "BUY" ? e.quantity : -e.quantity;
      q[e.symbol] = (q[e.symbol] ?? 0) + delta;
    }
  }
  return q;
}

/**
 * 현금잔고 = 입금 − 출금 + 배당 + 매도대금 − 매수대금 − Σ(fee_and_tax).
 */
export function cashBalance(events: InvestmentEvent[]): number {
  const deposits = sum(events, (e) => (e.type === "DEPOSIT" ? e.priceOrAmount : 0));
  const withdrawals = sum(events, (e) => (e.type === "WITHDRAWAL" ? e.priceOrAmount : 0));
  const dividends = sum(events, (e) => (e.type === "DIVIDEND" ? e.priceOrAmount : 0));
  const sellProceeds = sum(events, (e) =>
    e.type === "SELL" && e.quantity ? e.quantity * e.priceOrAmount : 0,
  );
  const buyCosts = sum(events, (e) =>
    e.type === "BUY" && e.quantity ? e.quantity * e.priceOrAmount : 0,
  );
  const fees = sum(events, (e) => e.feeAndTax);

  return deposits - withdrawals + dividends + sellProceeds - buyCosts - fees;
}

/** 보유 종목 평가액 = Σ(순수량 × 시세). 시세 없는 종목이 있으면 missing 에 기록. */
export function positionsValue(
  events: InvestmentEvent[],
  prices: PriceMap,
): { value: number; missingSymbols: string[] } {
  const nets = netQuantities(events);
  let value = 0;
  const missingSymbols: string[] = [];
  for (const [symbol, qty] of Object.entries(nets)) {
    if (qty === 0) continue;
    const price = prices[symbol];
    if (price == null) {
      missingSymbols.push(symbol);
      continue;
    }
    value += qty * price;
  }
  return { value, missingSymbols };
}

/** 현재 총 평가액 = 보유 평가액 + 현금잔고. */
export function totalValuation(
  events: InvestmentEvent[],
  prices: PriceMap,
): { value: number; missingSymbols: string[] } {
  const { value: posValue, missingSymbols } = positionsValue(events, prices);
  return { value: posValue + cashBalance(events), missingSymbols };
}

/**
 * 통화별 현금 풀(네이티브 단위). ₩ 장부(cashBalance)와 별개로, 실제 보유 통화를 추적한다.
 * 매수/매도/입금/출금/배당/환전의 현금 효과를 각 통화 풀에 반영.
 *   네이티브 금액 = ₩금액 / fxRate (KRW=1). 환전은 from 풀 차감 + to 풀 가산.
 * 표시·매수자금 판정용 — 평가액(cashBalance)은 여전히 ₩ 진입환율 기준.
 */
export function cashPools(events: InvestmentEvent[]): Record<string, number> {
  const pools: Record<string, number> = {};
  const add = (ccy: string, native: number) => {
    pools[ccy] = (pools[ccy] ?? 0) + native;
  };
  for (const e of events) {
    const ccy = e.currency ?? "KRW";
    const fx = e.fxRate && e.fxRate > 0 ? e.fxRate : 1;
    const toNative = (krw: number) => krw / fx; // ₩ → 네이티브
    switch (e.type) {
      case "DEPOSIT":
        add(ccy, toNative(e.priceOrAmount));
        break;
      case "DIVIDEND":
        // 배당은 원천징수(feeAndTax) 차감 후 순액이 통화 풀에 들어온다.
        add(ccy, toNative(e.priceOrAmount - e.feeAndTax));
        break;
      case "WITHDRAWAL":
        add(ccy, -toNative(e.priceOrAmount));
        break;
      case "BUY":
        if (e.quantity)
          add(ccy, -toNative(e.quantity * e.priceOrAmount + e.feeAndTax));
        break;
      case "SELL":
        if (e.quantity)
          add(ccy, toNative(e.quantity * e.priceOrAmount - e.feeAndTax));
        break;
      case "EXCHANGE":
        add(ccy, -toNative(e.priceOrAmount)); // 보낸 쪽
        if (e.toCurrency && e.toAmount != null) add(e.toCurrency, e.toAmount); // 받은 쪽
        break;
    }
  }
  return pools;
}

/**
 * 회사 통화별 현금 풀 = 설립자본(₩, KRW 풀 시드) + 이벤트 풀 효과.
 * 0(또는 음수 잔여) 통화도 키로 남을 수 있으니 표시 측에서 필터.
 */
export function companyCashPools(
  events: InvestmentEvent[],
  initialValuation: number,
): Record<string, number> {
  const pools = cashPools(events);
  pools.KRW = (pools.KRW ?? 0) + initialValuation;
  return pools;
}

/** 합계 헬퍼 — 입금/출금 총액. */
export function totalDeposits(events: InvestmentEvent[]): number {
  return sum(events, (e) => (e.type === "DEPOSIT" ? e.priceOrAmount : 0));
}
export function totalWithdrawals(events: InvestmentEvent[]): number {
  return sum(events, (e) => (e.type === "WITHDRAWAL" ? e.priceOrAmount : 0));
}
