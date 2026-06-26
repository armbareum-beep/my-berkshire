import { describe, it, expect } from "vitest";
import { BROKERS, brokerLogoSrcs, findBroker, type Broker } from "./brokers";

describe("brokerLogoSrcs", () => {
  it("셀프 호스팅(svg·png)을 1·2순위로, 도메인 favicon을 마지막 후보로", () => {
    const toss = findBroker("toss")!;
    const srcs = brokerLogoSrcs(toss);
    expect(srcs[0]).toBe("/brokers/toss.svg");
    expect(srcs[1]).toBe("/brokers/toss.png");
    expect(srcs[srcs.length - 1]).toContain("google.com/s2/favicons");
    expect(srcs[srcs.length - 1]).toContain("tossinvest.com");
  });

  it("도메인 없는 증권사는 favicon 후보를 생략(셀프 호스팅만)", () => {
    const noDomain: Broker = {
      id: "x",
      name: "X증권",
      commissionRate: 0.0001,
      color: "#000000",
    };
    const srcs = brokerLogoSrcs(noDomain);
    expect(srcs).toEqual(["/brokers/x.svg", "/brokers/x.png"]);
    expect(srcs.some((s) => s.includes("favicons"))).toBe(false);
  });

  it("프리셋 9곳 모두 도메인 보유(favicon 폴백 가능)", () => {
    expect(BROKERS.length).toBe(9);
    for (const b of BROKERS) {
      expect(b.domain && b.domain.length > 0).toBe(true);
    }
  });
});
