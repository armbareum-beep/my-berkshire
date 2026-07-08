import { describe, expect, it } from "vitest";
import { isShareClassUnitMismatch } from "./lookThrough";

describe("isShareClassUnitMismatch", () => {
  // 버크셔 B주 시나리오: 보유 61주, 순이익 ₩120조, 시세 있는 보유가치 ₩3,870만.
  // 발행주식수를 A주 환산(~144만)으로 잡으면 지분율이 1500× 부풀어 내재 PER≈0.0004 → 불일치.
  it("A주 환산 주식수로 계산된 B주 보유 → 불일치 감지", () => {
    const value = 38_700_000; // ₩ 보유 시장가치
    const netIncome = 120_000_000_000_000; // ₩ 회사 순이익(120조)
    const ownershipWrong = 61 / 1_440_000; // A주 환산 주식수 사용(잘못)
    expect(isShareClassUnitMismatch(value, netIncome, ownershipWrong)).toBe(true);
  });

  it("올바른 B주 총수(≈21억)로 계산하면 정상 PER → 통과", () => {
    const value = 38_700_000;
    const netIncome = 120_000_000_000_000;
    const ownershipRight = 61 / 2_125_000_000; // B주 환산 총수 사용(정상)
    expect(isShareClassUnitMismatch(value, netIncome, ownershipRight)).toBe(false);
  });

  it("일반 종목(내재 PER ~15) → 통과", () => {
    // 보유가치 1,500만, 순이익 1조, 지분율 = 1500만 / (1조×15) = 1e-6
    const value = 15_000_000;
    const netIncome = 1_000_000_000_000;
    const ownership = value / (netIncome * 15);
    expect(isShareClassUnitMismatch(value, netIncome, ownership)).toBe(false);
  });

  it("적자 기업(순이익<0)도 단위 불일치면 감지(절댓값 기준)", () => {
    const value = 38_700_000;
    const netIncome = -120_000_000_000_000;
    const ownershipWrong = 61 / 1_440_000;
    expect(isShareClassUnitMismatch(value, netIncome, ownershipWrong)).toBe(true);
  });

  it("시세 미확보(value=0) → 판정 불가로 통과", () => {
    expect(isShareClassUnitMismatch(0, 120_000_000_000_000, 0.001)).toBe(false);
  });

  it("순이익 0/null → 판정 불가로 통과", () => {
    expect(isShareClassUnitMismatch(1_000_000, 0, 0.001)).toBe(false);
    expect(isShareClassUnitMismatch(1_000_000, null, 0.001)).toBe(false);
  });
});
