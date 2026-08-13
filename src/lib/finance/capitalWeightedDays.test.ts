import { describe, expect, it } from "vitest";
import { capitalWeightedDays, computeReturn, MIN_INVESTED_DAYS } from "./returns";
import type { InvestmentEvent } from "./valuation";

const TODAY = "2026-08-13";

const dep = (date: string, amount: number): InvestmentEvent => ({
  type: "DEPOSIT",
  symbol: null,
  quantity: null,
  priceOrAmount: amount,
  feeAndTax: 0,
  date,
});

const buy = (date: string, symbol: string, qty: number, price: number): InvestmentEvent => ({
  type: "BUY",
  symbol,
  quantity: qty,
  priceOrAmount: price,
  feeAndTax: 0,
  date,
});

describe("capitalWeightedDays — 돈이 실제로 일한 기간", () => {
  it("설립 평가액 하나면 설립일부터의 일수", () => {
    const d = capitalWeightedDays(
      { foundedAt: "2026-05-15", initialValuation: 1_000 },
      [],
      TODAY,
    );
    expect(d).toBe(90);
  });

  it("금액이 클수록 그 시점 쪽으로 끌린다", () => {
    // 100일 전 100원 + 10일 전 900원 → (100×100 + 900×10)/1000 = 19일
    const d = capitalWeightedDays(
      { foundedAt: "2026-05-05", initialValuation: 100 },
      [dep("2026-08-03", 900)],
      TODAY,
    );
    expect(d).toBeCloseTo(19, 6);
  });

  it("설립 평가액이 0이면 그 시점은 기간을 늘리지 않는다", () => {
    // 실제 보고된 상황: 설립 91일 전이지만 평가액 0, 돈은 최근에 들어옴.
    const d = capitalWeightedDays(
      { foundedAt: "2026-05-14", initialValuation: 0 },
      [dep("2026-06-26", 100_000_000), dep("2026-08-12", 300_000_000)],
      TODAY,
    );
    // 48일 × 1억 + 1일 × 3억 = 5.1억 / 4억 = 12.75일 — 달력 91일과 전혀 다르다.
    expect(d).toBeCloseTo(12.75, 6);
    expect(d).toBeLessThan(MIN_INVESTED_DAYS);
  });

  it("투입이 없으면 0", () => {
    expect(
      capitalWeightedDays({ foundedAt: "2020-01-01", initialValuation: 0 }, [], TODAY),
    ).toBe(0);
  });

  it("출금은 기간을 늘리지 않는다", () => {
    const withOut = capitalWeightedDays(
      { foundedAt: "2026-05-15", initialValuation: 1_000 },
      [
        {
          type: "WITHDRAWAL",
          symbol: null,
          quantity: null,
          priceOrAmount: 500,
          feeAndTax: 0,
          date: "2020-01-01", // 아주 과거여도 가중에 안 들어간다
        },
      ],
      TODAY,
    );
    expect(withOut).toBe(90);
  });
});

describe("computeReturn — 달력이 아니라 자본 기준으로 연환산을 연다", () => {
  it("달력 91일이어도 돈이 며칠이면 연환산하지 않는다 (보고된 400% 케이스)", () => {
    const events = [
      dep("2026-06-26", 100_000_000),
      dep("2026-08-12", 300_000_000),
      buy("2026-08-12", "AAPL", 1_000, 400_000),
    ];
    const result = computeReturn(
      { foundedAt: "2026-05-14", initialValuation: 0 },
      events,
      { AAPL: 440_000 }, // 10% 상승 — 며칠 만에
      TODAY,
    );

    expect(result.status).toBe("cumulative_only");
    expect(result.xirr).toBeNull(); // 연환산 금지
    expect(result.cumulativeReturn).toBeCloseTo(0.1, 6); // 누적은 정직하게 +10%
    expect(result.message).toMatch(/^연환산 수익률 공개까지 D-/);
  });

  it("자본이 충분히 오래 굴렀으면 연환산한다", () => {
    const events = [buy("2025-08-13", "AAPL", 100, 10_000)];
    const result = computeReturn(
      { foundedAt: "2025-08-13", initialValuation: 1_000_000 },
      events,
      { AAPL: 12_000 },
      TODAY,
    );
    expect(result.status).toBe("xirr");
    expect(result.xirr).not.toBeNull();
    // 1년에 +20% 수준 → 상식적인 범위
    expect(result.xirr!).toBeGreaterThan(0);
    expect(result.xirr!).toBeLessThan(1);
  });

  it("D-day 는 남은 자본 가중 일수로 센다", () => {
    const result = computeReturn(
      { foundedAt: "2026-05-14", initialValuation: 0 },
      [dep("2026-08-12", 1_000_000)],
      {},
      TODAY,
    );
    // 하루밖에 안 굴렀으니 D-89
    expect(result.message).toBe(`연환산 수익률 공개까지 D-${MIN_INVESTED_DAYS - 1}`);
  });
});
