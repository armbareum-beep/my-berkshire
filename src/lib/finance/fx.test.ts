import { describe, expect, it } from "vitest";
import { pickRateOnOrBefore, type FxBar } from "./fx";

const bars: FxBar[] = [
  { date: "2026-03-05", close: 1300 }, // 목
  { date: "2026-03-06", close: 1310 }, // 금
  { date: "2026-03-09", close: 1320 }, // 월 (주말 건너뜀)
  { date: "2026-03-10", close: 1330 },
];

describe("pickRateOnOrBefore", () => {
  it("그 날짜 봉이 있으면 그 값", () => {
    expect(pickRateOnOrBefore(bars, "2026-03-09")).toBe(1320);
  });

  it("주말이면 직전 거래일 종가", () => {
    // 토·일에는 봉이 없다 → 금요일 종가
    expect(pickRateOnOrBefore(bars, "2026-03-07")).toBe(1310);
    expect(pickRateOnOrBefore(bars, "2026-03-08")).toBe(1310);
  });

  it("이후 봉은 절대 쓰지 않는다 (look-ahead 금지)", () => {
    // 2026-03-04 이전 봉이 없으므로 null — 뒤에 있는 1300 을 끌어오면 안 된다.
    expect(pickRateOnOrBefore(bars, "2026-03-04")).toBeNull();
  });

  it("마지막 봉보다 뒤 날짜면 마지막 종가", () => {
    expect(pickRateOnOrBefore(bars, "2026-04-01")).toBe(1330);
  });

  it("입력 순서가 뒤섞여도 결과가 같다", () => {
    const shuffled = [bars[2], bars[0], bars[3], bars[1]];
    expect(pickRateOnOrBefore(shuffled, "2026-03-09")).toBe(1320);
    expect(pickRateOnOrBefore(shuffled, "2026-03-07")).toBe(1310);
  });

  it("빈 배열·0 이하 종가는 null", () => {
    expect(pickRateOnOrBefore([], "2026-03-09")).toBeNull();
    expect(pickRateOnOrBefore([{ date: "2026-03-09", close: 0 }], "2026-03-09")).toBeNull();
  });
});
