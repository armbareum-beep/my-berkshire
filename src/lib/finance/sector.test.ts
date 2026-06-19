import { describe, it, expect } from "vitest";
import { sectorFromKsic, sectorFromSic } from "./sector";

describe("섹터 매핑 — KSIC(한국)", () => {
  it("26 전자부품·통신장비 → IT·반도체 (삼성전자·SK하이닉스류)", () => {
    expect(sectorFromKsic("26410")).toBe("IT·반도체");
    expect(sectorFromKsic("26")).toBe("IT·반도체");
  });
  it("21 의약품 → 헬스케어", () => {
    expect(sectorFromKsic("21020")).toBe("헬스케어");
  });
  it("30 자동차 → 경기소비재", () => {
    expect(sectorFromKsic("30121")).toBe("경기소비재");
  });
  it("64~66 금융·보험 → 금융", () => {
    expect(sectorFromKsic("64110")).toBe("금융");
    expect(sectorFromKsic("65")).toBe("금융");
  });
  it("58~63 정보통신 → 커뮤니케이션 (NAVER·카카오류)", () => {
    expect(sectorFromKsic("63120")).toBe("커뮤니케이션");
  });
  it("20 화학 → 소재", () => {
    expect(sectorFromKsic("20")).toBe("소재");
  });
  it("35 전기·가스 → 유틸리티", () => {
    expect(sectorFromKsic("35110")).toBe("유틸리티");
  });
  it("매핑 없는 코드 → null", () => {
    expect(sectorFromKsic("99")).toBeNull();
    expect(sectorFromKsic("")).toBeNull();
  });
});

describe("섹터 매핑 — SIC(미국)", () => {
  const cases: [string, string][] = [
    ["Semiconductors & Related Devices", "IT·반도체"],
    ["Services-Prepackaged Software", "IT·반도체"],
    ["Pharmaceutical Preparations", "헬스케어"],
    ["State Commercial Banks", "금융"],
    ["Fire, Marine & Casualty Insurance", "금융"],
    ["Real Estate Investment Trusts", "부동산"],
    ["Crude Petroleum & Natural Gas", "에너지"],
    ["Electric Services", "유틸리티"],
    ["Television Broadcasting Stations", "커뮤니케이션"],
    ["Retail-Variety Stores", "경기소비재"],
    ["Motor Vehicles & Passenger Car Bodies", "경기소비재"],
    ["Beverages", "필수소비재"],
  ];
  for (const [desc, expected] of cases) {
    it(`"${desc}" → ${expected}`, () => {
      expect(sectorFromSic(desc)).toBe(expected);
    });
  }
  it("매핑 안 되는 설명 → null", () => {
    expect(sectorFromSic("Blank Checks")).toBeNull();
  });
});
