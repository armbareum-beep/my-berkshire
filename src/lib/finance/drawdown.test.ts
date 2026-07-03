import { describe, it, expect } from "vitest";
import { computeDrawdownEpisodes } from "./drawdown";
import type { ValuePoint } from "./valueSeries";
import type { InvestmentEvent } from "./valuation";

/**
 * 드로다운 인내 엔진 — design-notes.md 기능1 검증 계획 6케이스.
 * 흐름조정 TWR 체인이 인출/증자로 인한 가짜 낙폭을 제거하는지, 러닝피크+에피소드 판정
 * (−10% 진입~회복)이 정확한지, 매도 유무로 passed 가 갈리는지 확인한다.
 */

const pt = (date: string, value: number, invested: number): ValuePoint => ({
  date,
  value,
  invested,
});

const sell = (date: string): InvestmentEvent => ({
  type: "SELL",
  date,
  symbol: "AAA",
  quantity: 1,
  priceOrAmount: 1000,
  feeAndTax: 0,
});

describe("computeDrawdownEpisodes — 6케이스(design-notes.md 검증 계획)", () => {
  it("케이스1: V자 회복, 매도 없음 → passed=true, bucket=10", () => {
    const points = [
      pt("2024-01-01", 1_000_000, 1_000_000), // 기준
      pt("2024-01-02", 1_000_000, 1_000_000), // 피크
      pt("2024-01-03", 850_000, 1_000_000), // -15%
      pt("2024-01-04", 1_050_000, 1_000_000), // 회복(피크 상회)
    ];
    const episodes = computeDrawdownEpisodes(points, []);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      peakDate: "2024-01-02",
      startDate: "2024-01-03",
      troughDate: "2024-01-03",
      recoveryDate: "2024-01-04",
      bucket: 10,
      passed: true,
    });
    expect(episodes[0].depth).toBeCloseTo(-0.15, 6);
  });

  it("케이스2: 도중 매도 → passed=false(마일스톤·축하 대상 아님)", () => {
    const points = [
      pt("2024-02-01", 1_000_000, 1_000_000),
      pt("2024-02-02", 1_000_000, 1_000_000), // 피크
      pt("2024-02-03", 750_000, 1_000_000), // -25%(최심)
      pt("2024-02-04", 1_050_000, 1_000_000), // 회복
    ];
    const events = [sell("2024-02-03")]; // 창 [peakDate, recoveryDate] 안
    const episodes = computeDrawdownEpisodes(points, events);
    expect(episodes).toHaveLength(1);
    expect(episodes[0].passed).toBe(false);
    expect(episodes[0].bucket).toBe(20);
    expect(episodes[0].recoveryDate).toBe("2024-02-04");
  });

  it("케이스3: 인출로 인한 가짜 하락 → 흐름조정 후 에피소드 미발생", () => {
    const points = [
      pt("2024-03-01", 1_000_000, 1_000_000),
      pt("2024-03-02", 1_000_000, 1_000_000), // 피크
      pt("2024-03-03", 700_000, 700_000), // 인출 30만원 → value·invested 동시 하락(가짜 낙폭)
    ];
    const episodes = computeDrawdownEpisodes(points, []);
    expect(episodes).toHaveLength(0);
  });

  it("케이스4: 미회복 진행 중 → recoveryDate=null, passed=false(연혁·축하 0건)", () => {
    const points = [
      pt("2024-04-01", 1_000_000, 1_000_000),
      pt("2024-04-02", 1_000_000, 1_000_000), // 피크
      pt("2024-04-03", 800_000, 1_000_000), // -20%(최심)
      pt("2024-04-04", 820_000, 1_000_000), // 아직 미회복(-18%)
    ];
    const episodes = computeDrawdownEpisodes(points, []);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      peakDate: "2024-04-02",
      startDate: "2024-04-03",
      troughDate: "2024-04-03",
      recoveryDate: null,
      bucket: 20,
      passed: false,
    });
  });

  it("케이스5: 다중 에피소드 — 하나는 passed, 하나는 도중 매도로 not passed", () => {
    const points = [
      pt("2024-05-01", 1_000_000, 1_000_000),
      pt("2024-05-02", 1_000_000, 1_000_000), // 피크1
      pt("2024-05-03", 800_000, 1_000_000), // -20%(A 최심)
      pt("2024-05-04", 1_020_000, 1_000_000), // A 회복(신규 피크)
      pt("2024-05-05", 1_020_000, 1_000_000), // 피크 유지
      pt("2024-05-06", 765_000, 1_000_000), // -25%(B 최심)
      pt("2024-05-07", 900_000, 1_000_000), // B 진행 중(매도 발생)
      pt("2024-05-08", 1_050_000, 1_000_000), // B 회복
    ];
    const events = [sell("2024-05-07")]; // B 의 창 [2024-05-05, 2024-05-08] 안
    const episodes = computeDrawdownEpisodes(points, events);
    expect(episodes).toHaveLength(2);
    const [a, b] = episodes;
    expect(a).toMatchObject({ recoveryDate: "2024-05-04", passed: true, bucket: 20 });
    expect(b).toMatchObject({ recoveryDate: "2024-05-08", passed: false, bucket: 20 });
    expect(episodes.filter((e) => e.passed)).toHaveLength(1);
  });

  it("케이스6: 초기 잔고 하한 가드 — 1만원 미만 구간은 체인 미시작(인위적 급등락 없음)", () => {
    const points = [
      pt("2024-06-01", 5_000, 5_000), // 1만원 미만 — 체인 미시작
      pt("2024-06-02", 100, 100), // 98% 폭락이지만 가드로 무시돼야 함
      pt("2024-06-03", 15_000, 15_000), // 여기부터 1만원 이상(체인 기준점)
      pt("2024-06-04", 20_000, 20_000), // 증자 유입, 낙폭 없음
    ];
    const episodes = computeDrawdownEpisodes(points, []);
    expect(episodes).toHaveLength(0);
  });
});
