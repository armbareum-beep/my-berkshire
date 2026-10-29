import { describe, expect, it } from "vitest";
import { alertStages, readAlertBasis, type AlertMethod } from "./valuation-alerts";

const method: AlertMethod = { id: "DCF", label: "역DCF", down: [300, 200, 100], up: [500, 600, 700], note: "간이값" };
const now = Date.parse("2026-10-29T06:30:00Z"), time = now / 1000;
const basis = { currency: "KRW", updatedAt: "2026-10-29T00:00:00Z", basisDate: "2026-06-30", methods: [method] };
describe("국가별 종목 가격 단계", () => {
  it("이하·이상 경계 포함, 세 단계 독립 판정", () => {
    expect(alertStages(method, 200, time, now).down).toEqual([true, true, false]);
    expect(alertStages(method, 600, time, now).up).toEqual([true, true, false]);
    expect(alertStages(method, 400, time, now)).toMatchObject({ down: [false, false, false], up: [false, false, false] });
    expect(alertStages(method, 50, time, now).down).toEqual([true, true, true]);
  });
  it("DCF와 P/TBV를 합치거나 한쪽의 도달을 다른 쪽에 복사하지 않음", () => {
    const ptbv = { ...method, down: [800, 700, 600], up: [900, 1000, 1100] };
    expect(alertStages(method, 600, time, now).down).toEqual([false, false, false]);
    expect(alertStages(ptbv, 600, time, now).down).toEqual([true, true, true]);
  });
  it("누락·0·NaN 시세, 시각 미확인·오래된·미래 시세는 미도달이 아닌 보류", () => {
    for (const p of [null, 0, NaN]) expect(alertStages(method, p, time, now).down).toEqual([null, null, null]);
    for (const t of [undefined, 0, time - 5 * 86400, time + 3600]) expect(alertStages(method, 50, t, now).up).toEqual([null, null, null]);
  });
  it("휴일 직전 종가도 날짜를 가진 비교값으로 허용, 기준 보류는 도달 표시 안 함", () => {
    expect(alertStages(method, 200, time - 3 * 86400, now).usable).toBe(true);
    expect(alertStages({ ...method, status: "hold" }, 50, time, now).down).toEqual([null, null, null]);
  });
  it("저평가 두 단계·고평가 세 단계와 단방향도 유지", () => {
    const m = { ...method, down: [200, 100] };
    expect(readAlertBasis({ ...basis, methods: [m] })).not.toBeNull();
    expect(alertStages(m, 100, time, now).down).toEqual([true, true]);
    expect(readAlertBasis({ ...basis, methods: [{ ...method, up: [] }] })).not.toBeNull();
  });
  it("숫자·방향·통화가 잘못된 기준은 판정하지 않음", () => {
    for (const down of [[100, 200], [200, 200], [200, null], [Infinity], [0], [4, 3, 2, 1]]) expect(readAlertBasis({ ...basis, methods: [{ ...method, down }] })).toBeNull();
    expect(readAlertBasis({ ...basis, currency: "USD" })).toBeNull();
    expect(readAlertBasis({ ...basis, basisDate: "2026-02-30" })).toBeNull();
    expect(readAlertBasis({ ...basis, methods: [method, method] })).toBeNull();
  });
});
