/**
 * 기간 선택 수익률 — 같은 XIRR 엔진을 구간에 적용(로드맵 STEP 9 "기간 선택 수익률").
 *
 * 구간 흐름: 시작시점 평가액(−), 구간 내 증자(−)·인출(+), 끝시점 평가액(+).
 * 시작시점 평가액 = 과거 평가액 재구성(valueSeries.pointAt). 90일 미만 구간은 연환산 금지(누적만).
 */

import { xirr, daysSince, type Flow } from "./xirr";
import type { InvestmentEvent } from "./valuation";

export type PeriodKey = "ytd" | "1y" | "3y" | "all";

export interface PeriodResult {
  key: PeriodKey;
  label: string;
  startDate: string;
  days: number;
  /** 연환산 XIRR(소수). 90일 미만이면 null. */
  xirr: number | null;
  /** 누적 수익률(소수). */
  cumulative: number | null;
  /** CAGR(소수). */
  cagr: number | null;
}

const MIN_DAYS = 90; // 연환산 금지 임계(명세 4-1)

/** YYYY-MM-DD 에 days 더한 날짜(UTC). */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** 구간 [startDate, today] 수익률. startValue=시작시점 평가액(₩), endValue=현재 평가액(₩). */
export function periodReturn(
  startDate: string,
  startValue: number,
  events: InvestmentEvent[],
  endValue: number,
  today: string,
): { xirr: number | null; cumulative: number | null; cagr: number | null; days: number } {
  const days = daysSince(startDate, today);
  // 구간 내(시작 이후) 외부 흐름만.
  let deposits = 0;
  let withdrawals = 0;
  const flows: Flow[] = [{ date: startDate, amount: -startValue }];
  for (const e of events) {
    if (e.date <= startDate || e.date > today) continue;
    if (e.type === "DEPOSIT") {
      deposits += e.priceOrAmount;
      flows.push({ date: e.date, amount: -e.priceOrAmount });
    } else if (e.type === "WITHDRAWAL") {
      withdrawals += e.priceOrAmount;
      flows.push({ date: e.date, amount: +e.priceOrAmount });
    }
  }
  flows.push({ date: today, amount: +endValue });

  const investedBase = startValue + deposits;
  const cumulative =
    investedBase > 0
      ? (endValue + withdrawals - deposits - startValue) / investedBase
      : null;
  const cagrBase = startValue + deposits - withdrawals;
  const years = days / 365;
  const cagr =
    cagrBase > 0 && endValue > 0 && years > 0
      ? Math.pow(endValue / cagrBase, 1 / years) - 1
      : null;
  const rate = days >= MIN_DAYS ? xirr(flows) : null;

  return { xirr: rate, cumulative, cagr, days };
}

/** 4개 구간의 시작일(올해/1년/3년/전체). 설립일 이전이면 설립일로 클램프. */
export function periodStartDates(
  foundedAt: string,
  today: string,
): { key: PeriodKey; label: string; start: string }[] {
  const year = today.slice(0, 4);
  const clamp = (d: string) => (d < foundedAt ? foundedAt : d);
  return [
    { key: "ytd", label: "올해", start: clamp(`${year}-01-01`) },
    { key: "1y", label: "1년", start: clamp(addDays(today, -365)) },
    { key: "3y", label: "3년", start: clamp(addDays(today, -3 * 365)) },
    { key: "all", label: "전체", start: foundedAt },
  ];
}
