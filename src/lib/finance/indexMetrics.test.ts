import { describe, it, expect } from "vitest";
import { metricStatus, statusText } from "./indexMetrics";

const KR_MISSING = { isKoreaIndex: true, krxAvailable: false };
const KR_OK = { isKoreaIndex: true, krxAvailable: true };
const US = { isKoreaIndex: false, krxAvailable: false };

describe("metricStatus", () => {
  it("값이 있으면 항상 value", () => {
    expect(metricStatus(12.3, KR_MISSING, true)).toBe("value");
    expect(metricStatus(0, US, true)).toBe("value");
  });

  it("한국 지수 + KRX 캐시 빔 + KRX 출처 지표 → pending", () => {
    expect(metricStatus(null, KR_MISSING, true)).toBe("pending");
  });

  it("한국 지수라도 KRX 출처가 아닌 지표(ROE)는 unavailable", () => {
    expect(metricStatus(null, KR_MISSING, false)).toBe("unavailable");
  });

  it("한국 지수 + KRX 캐시 있는데 값이 null → unavailable", () => {
    expect(metricStatus(null, KR_OK, true)).toBe("unavailable");
  });

  it("미국/기타 지수에서 값 없음 → unavailable (pending 아님)", () => {
    expect(metricStatus(null, US, true)).toBe("unavailable");
    expect(metricStatus(null, US, false)).toBe("unavailable");
  });

  it("statusText: pending→데이터 준비 중, 그 외→정보 없음", () => {
    expect(statusText("pending")).toBe("데이터 준비 중");
    expect(statusText("unavailable")).toBe("정보 없음");
    expect(statusText("value")).toBe("정보 없음");
  });
});
