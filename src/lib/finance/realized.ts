import type { InvestmentEvent } from "./valuation";

/**
 * 실현손익(₩) — 평균원가법. 매수 시 평균원가 갱신, 매도 시 (매도가−평균원가)×수량−수수료 누적.
 * priceOrAmount 는 ₩/주, feeAndTax 는 ₩(기능통화). 종목별로 따로 계산해 합산한다.
 * symbol 을 주면 그 종목만, 없으면 전체 종목 합계.
 */
export function realizedGainKRW(
  events: InvestmentEvent[],
  symbol?: string,
): number {
  const rel = (symbol ? events.filter((e) => e.symbol === symbol) : events).filter(
    (e) => e.symbol && (e.type === "BUY" || e.type === "SELL"),
  );

  const bySym = new Map<string, InvestmentEvent[]>();
  for (const e of rel) {
    const k = e.symbol as string;
    const arr = bySym.get(k) ?? [];
    arr.push(e);
    bySym.set(k, arr);
  }

  let realized = 0;
  for (const evs of bySym.values()) {
    const sorted = [...evs].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    let qty = 0; // 보유 수량
    let avg = 0; // 평균원가(₩/주)
    for (const e of sorted) {
      const q = Number(e.quantity ?? 0);
      if (q <= 0) continue;
      const price = Number(e.priceOrAmount); // ₩/주
      const fee = Number(e.feeAndTax ?? 0);
      if (e.type === "BUY") {
        const cost = avg * qty + price * q + fee;
        qty += q;
        avg = qty > 0 ? cost / qty : 0;
      } else {
        const sellQty = Math.min(q, qty); // 보유 초과 매도는 무시(안전)
        realized += sellQty * price - fee - sellQty * avg;
        qty -= sellQty;
        if (qty <= 1e-9) qty = 0;
      }
    }
  }
  return realized;
}
