import { describe, expect, it } from "vitest";
import { convertBarsToKrw, type DailyBar } from "./prices";
import type { FxBar } from "./fx";

const bars: DailyBar[] = [
  { date: "2026-03-05", close: 100, open: 98, high: 101, low: 97, volume: 1_000 },
  { date: "2026-03-06", close: 110 },
  { date: "2026-03-09", close: 120 },
];

const fxBars: FxBar[] = [
  { date: "2026-03-05", close: 1_300 },
  { date: "2026-03-06", close: 1_350 },
  { date: "2026-03-09", close: 1_400 },
];

describe("convertBarsToKrw — 봉마다 그날 환율", () => {
  it("각 봉이 자기 날짜 환율로 환산된다", () => {
    const out = convertBarsToKrw(bars, fxBars, 9_999);
    expect(out[0].close).toBeCloseTo(100 * 1_300);
    expect(out[1].close).toBeCloseTo(110 * 1_350);
    expect(out[2].close).toBeCloseTo(120 * 1_400);
  });

  it("하나의 환율로 전 구간을 곱하지 않는다 (회귀 방지)", () => {
    // 예전 동작: 전부 마지막(오늘) 환율 1400. 그러면 과거 봉이 부풀려진다.
    const out = convertBarsToKrw(bars, fxBars, 9_999);
    expect(out[0].close).not.toBeCloseTo(100 * 1_400);
    expect(out[1].close).not.toBeCloseTo(110 * 1_400);
  });

  it("오늘 환율이 변해도 과거 봉은 그대로다", () => {
    const before = convertBarsToKrw(bars, fxBars, 1_400);
    // 오늘 환율만 크게 움직인 상황 — 과거 환율 봉은 그대로다.
    const after = convertBarsToKrw(bars, fxBars, 2_000);
    expect(after[0].close).toBeCloseTo(before[0].close);
    expect(after[1].close).toBeCloseTo(before[1].close);
  });

  it("open·high·low 도 같은 환율로 환산된다", () => {
    const out = convertBarsToKrw(bars, fxBars, 9_999);
    expect(out[0].open).toBeCloseTo(98 * 1_300);
    expect(out[0].high).toBeCloseTo(101 * 1_300);
    expect(out[0].low).toBeCloseTo(97 * 1_300);
  });

  it("거래량은 수량이라 환산하지 않는다", () => {
    const out = convertBarsToKrw(bars, fxBars, 9_999);
    expect(out[0].volume).toBe(1_000);
  });

  it("그날 환율 봉이 없으면 직전 거래일 환율", () => {
    // 3/7(토)·3/8(일) 봉이 주가에만 있는 상황 — 환율은 금요일 값을 쓴다.
    const weekend: DailyBar[] = [{ date: "2026-03-07", close: 100 }];
    const out = convertBarsToKrw(weekend, fxBars, 9_999);
    expect(out[0].close).toBeCloseTo(100 * 1_350); // 3/6 종가
  });

  it("환율 시계열이 비면 폴백 환율을 쓴다", () => {
    const out = convertBarsToKrw(bars, [], 1_500);
    expect(out[0].close).toBeCloseTo(100 * 1_500);
    expect(out[2].close).toBeCloseTo(120 * 1_500);
  });

  it("환율 시계열보다 이른 날짜는 폴백 (look-ahead 금지)", () => {
    // 2026-03-01 은 환율 봉 시작(3/5) 이전 → 3/5 환율을 끌어오면 안 된다.
    const early: DailyBar[] = [{ date: "2026-03-01", close: 100 }];
    const out = convertBarsToKrw(early, fxBars, 1_250);
    expect(out[0].close).toBeCloseTo(100 * 1_250);
  });

  it("원화 종목(환율 1 폴백, 빈 시계열)은 값이 그대로", () => {
    const krw: DailyBar[] = [{ date: "2026-03-05", close: 70_000 }];
    const out = convertBarsToKrw(krw, [], 1);
    expect(out[0].close).toBe(70_000);
  });
});
