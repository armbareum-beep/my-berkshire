import { describe, it, expect } from "vitest";
import { xirr, type Flow } from "./xirr";
import { computeReturn, type HoldingSnapshot } from "./returns";
import { cashBalance, totalValuation, type InvestmentEvent } from "./valuation";

/**
 * /docs/xirr-spec-v1.md 7번 테스트 케이스 A/B/C — 반드시 통과.
 * 통과 못 하면 구현이 틀린 것이다.
 */
describe("xirr — 명세 테스트 케이스", () => {
  // 케이스 A: 2025-01-01 1,000만 등기 → 2026-01-01 평가액 1,200만 → ≈ 20.0%
  it("케이스 A: 단순 1년 → XIRR ≈ 20%", () => {
    const flows: Flow[] = [
      { date: "2025-01-01", amount: -10_000_000 },
      { date: "2026-01-01", amount: +12_000_000 },
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.2, 3); // 20.0%
  });

  // 케이스 B: 중간 입금 타이밍 반영 → 13.0~13.5% 범위
  it("케이스 B: 중간 입금 → XIRR 13.0~13.5%", () => {
    const flows: Flow[] = [
      { date: "2025-01-01", amount: -10_000_000 },
      { date: "2025-07-01", amount: -10_000_000 },
      { date: "2026-01-01", amount: +22_000_000 },
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThanOrEqual(0.13);
    expect(r!).toBeLessThanOrEqual(0.135);
  });

  // 케이스 C: 단순 수익률 10%와 XIRR이 달라야 함(머니가중 반영 확인)
  it("케이스 C: XIRR ≠ 단순수익률(10%)", () => {
    const flows: Flow[] = [
      { date: "2025-01-01", amount: -10_000_000 },
      { date: "2025-07-01", amount: -10_000_000 },
      { date: "2026-01-01", amount: +22_000_000 },
    ];
    const simpleReturn = (22_000_000 - 20_000_000) / 20_000_000; // 0.10
    const r = xirr(flows)!;
    expect(Math.abs(r - simpleReturn)).toBeGreaterThan(0.02); // 의미 있게 다름
  });
});

describe("xirr — 해 없음 처리", () => {
  it("부호가 한쪽뿐이면 null", () => {
    expect(xirr([{ date: "2025-01-01", amount: -100 }, { date: "2026-01-01", amount: -50 }])).toBeNull();
  });
  it("흐름 1개면 null", () => {
    expect(xirr([{ date: "2025-01-01", amount: -100 }])).toBeNull();
  });
  it("음수 수익률도 계산(반토막)", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -10_000_000 },
      { date: "2026-01-01", amount: +5_000_000 },
    ]);
    expect(r!).toBeCloseTo(-0.5, 3);
  });
});

describe("현금잔고·평가액", () => {
  const events: InvestmentEvent[] = [
    { type: "DEPOSIT", priceOrAmount: 1_000_000, feeAndTax: 0, date: "2025-01-01" },
    { type: "BUY", symbol: "005930", quantity: 10, priceOrAmount: 70_000, feeAndTax: 100, date: "2025-01-02" },
    { type: "DIVIDEND", symbol: "005930", priceOrAmount: 3_000, feeAndTax: 462, date: "2025-03-01" },
  ];
  it("현금잔고 = 입금 − 매수대금 + 배당 − 수수료/세금", () => {
    // 1,000,000 − (10×70,000) + 3,000 − (100+462) = 302,438
    expect(cashBalance(events)).toBe(302_438);
  });
  it("총 평가액 = 보유(10×75,000) + 현금잔고", () => {
    const { value, missingSymbols } = totalValuation(events, { "005930": 75_000 });
    expect(missingSymbols).toHaveLength(0);
    expect(value).toBe(750_000 + 302_438);
  });
});

describe("computeReturn — 엣지케이스", () => {
  const holding: HoldingSnapshot = { foundedAt: "2025-01-01", initialValuation: 10_000_000 };

  it("엣지 1: 90일 미만 → cumulative_only, xirr null", () => {
    const res = computeReturn(holding, [], { }, "2025-02-15"); // ~45일
    expect(res.status).toBe("cumulative_only");
    expect(res.xirr).toBeNull();
    expect(res.message).toContain("D-45"); // 90 - 45일 경과 = D-day 카운트다운
  });

  it("엣지 2: 설립 보유종목만(추가 이벤트 0건) → 2점 XIRR 계산됨", () => {
    // 설립 시 1,000만(initial_valuation)으로 삼성전자 100주를 등기(평단 100,000).
    // 설립 매수는 BUY 이벤트로 기록되고 매입대금은 설립자본에서 지불됨(현금 0).
    const events: InvestmentEvent[] = [
      { type: "BUY", symbol: "005930", quantity: 100, priceOrAmount: 100_000, feeAndTax: 0, date: "2025-01-01" },
    ];
    // 1년 뒤: 보유 100주 × 120,000 = 1,200만, 현금 = iv(1,000만) − 매수(1,000만) = 0 → terminal 1,200만
    const res = computeReturn(holding, events, { "005930": 120_000 }, "2026-01-01");
    expect(res.status).toBe("xirr");
    expect(res.xirr).not.toBeNull();
    expect(res.currentValuation).toBe(12_000_000);
    expect(res.xirr!).toBeCloseTo(0.2, 2); // 1,000만→1,200만, 1년 ≈ 20%
  });

  it("엣지 3: 시세 미확보 → price_unavailable, 평가액 null", () => {
    const events: InvestmentEvent[] = [
      { type: "BUY", symbol: "999999", quantity: 10, priceOrAmount: 1000, feeAndTax: 0, date: "2025-01-01" },
    ];
    const res = computeReturn(holding, events, {}, "2026-01-01"); // 시세 맵에 없음
    expect(res.status).toBe("price_unavailable");
    expect(res.currentValuation).toBeNull();
    expect(res.missingSymbols).toContain("999999");
  });

  it("엣지 3-b: pricesAvailable=false 면 보유 없어도 price_unavailable", () => {
    const res = computeReturn(holding, [], {}, "2026-01-01", false);
    expect(res.status).toBe("price_unavailable");
  });
});
