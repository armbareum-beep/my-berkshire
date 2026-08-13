import { describe, expect, it } from "vitest";
import { nativeCurrencyOf, toNativeEps } from "./cachedEps";

describe("nativeCurrencyOf", () => {
  it("6자리 숫자 코드는 원화", () => {
    expect(nativeCurrencyOf("005930")).toBe("KRW");
    expect(nativeCurrencyOf("000660")).toBe("KRW");
  });

  it("그 외는 달러", () => {
    expect(nativeCurrencyOf("PLTR")).toBe("USD");
    expect(nativeCurrencyOf("BRK-B")).toBe("USD");
  });
});

describe("toNativeEps — ₩ 파이프라인 → 종목 통화 역환산", () => {
  it("국내 종목은 그대로 둔다", () => {
    expect(toNativeEps(5_000, "005930", 1400)).toBe(5_000);
  });

  it("해외 종목은 환율로 되돌린다", () => {
    // ₩1,890 / 1400 = $1.35
    expect(toNativeEps(1_890, "PLTR", 1400)).toBeCloseTo(1.35, 6);
  });

  it("환율을 모르면 계산하지 않는다 (가짜 정밀 금지)", () => {
    expect(toNativeEps(1_890, "PLTR", null)).toBeNull();
    expect(toNativeEps(1_890, "PLTR", 0)).toBeNull();
  });

  it("환율을 몰라도 국내 종목은 영향 없다", () => {
    expect(toNativeEps(5_000, "005930", null)).toBe(5_000);
  });

  it("적자·0·결측은 담지 않는다", () => {
    expect(toNativeEps(-100, "PLTR", 1400)).toBeNull();
    expect(toNativeEps(0, "005930", 1400)).toBeNull();
    expect(toNativeEps(null, "005930", 1400)).toBeNull();
    expect(toNativeEps(undefined, "005930", 1400)).toBeNull();
  });

  it("왕복 변환이 원값을 보존한다", () => {
    const nativeEps = 1.35;
    const fx = 1382.5;
    const krw = nativeEps * fx;
    expect(toNativeEps(krw, "PLTR", fx)).toBeCloseTo(nativeEps, 9);
  });
});
