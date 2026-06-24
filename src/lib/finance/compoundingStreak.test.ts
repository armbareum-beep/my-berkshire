import { describe, it, expect } from "vitest";
import {
  computeCompoundingStreak,
  type CapitalFounding,
} from "./compoundingStreak";
import type { InvestmentEvent } from "./valuation";

/**
 * 복리 무중단 지표 — spec.md Acceptance / quickstart.md 검증.
 * 핵심: 끊김은 소비성 인출(WITHDRAWAL)만. 현금 보유·매매는 끊김 아님.
 */

const TODAY = "2026-06-24";
const ev = (
  type: InvestmentEvent["type"],
  date: string,
  amount = 0,
  extra: Partial<InvestmentEvent> = {},
): InvestmentEvent => ({
  type,
  date,
  priceOrAmount: amount,
  feeAndTax: 0,
  ...extra,
});

const founded = (foundedAt: string, initialValuation = 0): CapitalFounding => ({
  foundedAt,
  initialValuation,
});

describe("복리 무중단 — 기본/표시", () => {
  it("케이스1: 23개월 전 설립·인출 없음 → 23개월", () => {
    const r = computeCompoundingStreak([], founded("2024-07-24", 10_000_000), TODAY);
    expect(r.isEmpty).toBe(false);
    expect(r.startDate).toBe("2024-07-24");
    expect(r.unit).toBe("month");
    expect(r.months).toBe(23);
  });

  it("케이스2: 오늘 설립 → 1개월 미만은 '일' 단위", () => {
    const r = computeCompoundingStreak([], founded(TODAY, 1_000_000), TODAY);
    expect(r.unit).toBe("day");
    expect(r.days).toBe(0);
  });

  it("케이스7: 자본 투입 전 빈 장부 → isEmpty", () => {
    const r = computeCompoundingStreak([], founded(TODAY, 0), TODAY);
    expect(r.isEmpty).toBe(true);
    expect(r.startDate).toBeNull();
  });

  it("설립자본 0이어도 증자가 있으면 첫 증자일부터", () => {
    const r = computeCompoundingStreak(
      [ev("DEPOSIT", "2025-12-24", 5_000_000)],
      founded("2025-12-24", 0),
      TODAY,
    );
    expect(r.isEmpty).toBe(false);
    expect(r.startDate).toBe("2025-12-24");
    expect(r.months).toBe(6);
  });
});

describe("복리 무중단 — 현금/매매 불변(끊김 아님)", () => {
  it("케이스3: 대량 매도로 현금 90%여도 무중단 그대로", () => {
    const withSell = computeCompoundingStreak(
      [
        ev("BUY", "2024-08-01", 70_000, { symbol: "005930", quantity: 100 }),
        ev("SELL", "2026-06-01", 90_000, { symbol: "005930", quantity: 100 }),
      ],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    const noSell = computeCompoundingStreak(
      [],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(withSell.startDate).toBe(noSell.startDate);
    expect(withSell.months).toBe(noSell.months);
    expect(withSell.breaks).toHaveLength(0);
  });

  it("케이스8: 매매/환전만 → 끊김 없음", () => {
    const r = computeCompoundingStreak(
      [
        ev("BUY", "2025-01-01", 1000, { symbol: "AAA", quantity: 10 }),
        ev("SELL", "2025-02-01", 1100, { symbol: "AAA", quantity: 10 }),
        ev("EXCHANGE", "2025-03-01", 1_000_000),
      ],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.breaks).toHaveLength(0);
    expect(r.startDate).toBe("2024-07-24");
  });
});

describe("복리 무중단 — 소비성 인출 끊김", () => {
  it("케이스4: 6개월 전 소비성 인출 → 그 시점부터 재계산", () => {
    const r = computeCompoundingStreak(
      [ev("WITHDRAWAL", "2025-12-24", 3_000_000)],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.startDate).toBe("2025-12-24");
    expect(r.months).toBe(6);
    expect(r.breaks).toHaveLength(1);
  });

  it("케이스5: 배당 인출은 끊김 아님", () => {
    const r = computeCompoundingStreak(
      [ev("DIVIDEND", "2025-12-24", 500_000)],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.breaks).toHaveLength(0);
    expect(r.startDate).toBe("2024-07-24");
  });

  it("케이스9: 같은 날 증자>인출(순유입) → 끊김 아님", () => {
    const r = computeCompoundingStreak(
      [
        ev("DEPOSIT", "2025-12-24", 5_000_000),
        ev("WITHDRAWAL", "2025-12-24", 3_000_000),
      ],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.breaks).toHaveLength(0);
    expect(r.startDate).toBe("2024-07-24");
  });

  it("케이스9b: 같은 날 인출>증자(순유출) → 끊김", () => {
    const r = computeCompoundingStreak(
      [
        ev("DEPOSIT", "2025-12-24", 2_000_000),
        ev("WITHDRAWAL", "2025-12-24", 5_000_000),
      ],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.breaks).toHaveLength(1);
    expect(r.startDate).toBe("2025-12-24");
  });
});

describe("복리 무중단 — 보너스/이력", () => {
  it("케이스6: 최근 30일 내 증자 → bonusRecentDeposit", () => {
    const r = computeCompoundingStreak(
      [ev("DEPOSIT", "2026-06-10", 1_000_000)],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.bonusRecentDeposit).toBe(true);
  });

  it("30일보다 오래된 증자 → 보너스 아님", () => {
    const r = computeCompoundingStreak(
      [ev("DEPOSIT", "2026-04-01", 1_000_000)],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.bonusRecentDeposit).toBe(false);
  });

  it("breaks/deposits 이력이 시간순으로 수집된다", () => {
    const r = computeCompoundingStreak(
      [
        ev("DEPOSIT", "2025-01-01", 1_000_000),
        ev("WITHDRAWAL", "2025-06-01", 2_000_000),
        ev("DEPOSIT", "2025-09-01", 1_000_000),
      ],
      founded("2024-07-24", 10_000_000),
      TODAY,
    );
    expect(r.deposits.map((d) => d.date)).toEqual(["2025-01-01", "2025-09-01"]);
    expect(r.breaks.map((b) => b.date)).toEqual(["2025-06-01"]);
    // 마지막 끊김(2025-06-01) 이후가 시작 — 이후 증자는 끊김 아님.
    expect(r.startDate).toBe("2025-06-01");
  });
});
