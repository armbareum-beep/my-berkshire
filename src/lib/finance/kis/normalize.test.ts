import { describe, it, expect } from "vitest";
import {
  normalizeDomesticPrice,
  normalizeOverseasPrice,
  normalizeTRate,
} from "./normalize";

describe("normalizeDomesticPrice", () => {
  it("문자열 현재가·전일종가를 숫자로 변환한다", () => {
    expect(normalizeDomesticPrice({ stck_prpr: "353500", stck_sdpr: "354000" })).toEqual({
      price: 353500,
      prevClose: 354000,
      currency: "KRW",
      instrumentType: "EQUITY",
    });
  });
  it("현재가 없음/0 이면 null", () => {
    expect(normalizeDomesticPrice({ stck_prpr: "0" })).toBeNull();
    expect(normalizeDomesticPrice(undefined)).toBeNull();
  });
});

describe("normalizeOverseasPrice", () => {
  it("last/base 를 USD 시세로 변환한다", () => {
    expect(normalizeOverseasPrice({ last: "298.0100", base: "298.0100" })).toEqual({
      price: 298.01,
      prevClose: 298.01,
      currency: "USD",
      instrumentType: "EQUITY",
    });
  });
  it("last=0(잘못된 거래소)이면 null → 다음 후보 시도", () => {
    expect(normalizeOverseasPrice({ last: "0.0000" })).toBeNull();
  });
});

describe("normalizeTRate", () => {
  it("t_rate 환율을 숫자로", () => {
    expect(normalizeTRate({ t_rate: "1540.30" })).toBe(1540.3);
  });
  it("없거나 0 이면 null", () => {
    expect(normalizeTRate({ t_rate: "0" })).toBeNull();
    expect(normalizeTRate(undefined)).toBeNull();
  });
});
