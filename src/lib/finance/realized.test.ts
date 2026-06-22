import { describe, it, expect } from "vitest";
import { realizedGainKRW } from "./realized";
import type { InvestmentEvent } from "./valuation";

function ev(
  type: "BUY" | "SELL",
  date: string,
  quantity: number,
  priceOrAmount: number,
  feeAndTax = 0,
  symbol = "005930",
): InvestmentEvent {
  return { type, symbol, quantity, priceOrAmount, feeAndTax, date };
}

describe("realizedGainKRW (평균원가)", () => {
  it("일부 매도: (매도가−매수가)×수량", () => {
    const r = realizedGainKRW([
      ev("BUY", "2024-01-01", 10, 100),
      ev("SELL", "2024-06-01", 5, 150),
    ]);
    expect(r).toBe(250); // 5*(150-100)
  });

  it("분할 매수 후 매도: 평균원가 기준", () => {
    const r = realizedGainKRW([
      ev("BUY", "2024-01-01", 10, 100),
      ev("BUY", "2024-02-01", 10, 200), // 평균 150
      ev("SELL", "2024-03-01", 10, 180),
    ]);
    expect(r).toBe(300); // 10*(180-150)
  });

  it("수수료 반영: 매수 수수료는 원가에, 매도 수수료는 차감", () => {
    const r = realizedGainKRW([
      ev("BUY", "2024-01-01", 10, 100, 10), // 평균 (1000+10)/10 = 101
      ev("SELL", "2024-02-01", 10, 120, 5),
    ]);
    expect(r).toBe(185); // 10*120 - 5 - 10*101 = 1200-5-1010
  });

  it("완전 왕복(미보유)도 실현손익 계산", () => {
    const r = realizedGainKRW([
      ev("BUY", "2023-01-01", 4, 1000),
      ev("SELL", "2023-12-01", 4, 1500),
    ]);
    expect(r).toBe(2000); // 4*(1500-1000)
  });

  it("종목별 분리 합산 + symbol 필터", () => {
    const events = [
      ev("BUY", "2024-01-01", 10, 100, 0, "005930"),
      ev("SELL", "2024-02-01", 10, 120, 0, "005930"), // +200
      ev("BUY", "2024-01-01", 1, 1000, 0, "AAPL"),
      ev("SELL", "2024-02-01", 1, 900, 0, "AAPL"), // -100
    ];
    expect(realizedGainKRW(events)).toBe(100); // 200 - 100
    expect(realizedGainKRW(events, "005930")).toBe(200);
    expect(realizedGainKRW(events, "AAPL")).toBe(-100);
  });

  it("매도 없으면 0", () => {
    expect(realizedGainKRW([ev("BUY", "2024-01-01", 10, 100)])).toBe(0);
  });
});
