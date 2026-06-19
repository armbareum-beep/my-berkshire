/**
 * PME 벤치마크 — "같은 현금흐름을 KOSPI에 넣었다면?" (xirr-spec 비교 1층: vs 시장).
 *
 * 방법(Public Market Equivalent):
 *  · 사용자의 외부 현금흐름(설립자본·증자=매수, 인출=매도)을 그대로 KOSPI 지수에 투입.
 *  · 각 시점 지수로 지분(units) 누적/차감 → 현재 지수로 평가 = 벤치마크 terminal.
 *  · 같은 외부 흐름 + 벤치마크 terminal 로 동일한 xirr() 엔진 호출 → 시장 수익률.
 *  · 내 XIRR 과 비교해 "시장을 이겼는가".
 *
 * 소스: 야후 `^KS11`(KOSPI) 일별 종가. 토스 교체 시 fetchKospiSeries 만 바꾼다.
 */

import { xirr, daysSince, type Flow } from "./xirr";
import {
  totalDeposits,
  totalWithdrawals,
  type InvestmentEvent,
} from "./valuation";
import type { HoldingSnapshot } from "./returns";
import type { Currency } from "../format";

/** 표시 통화별 비교 지수 — 원화=KOSPI, 달러=S&P 500. */
const INDEX_BY_CURRENCY: Record<Currency, { symbol: string; label: string }> = {
  KRW: { symbol: "^KS11", label: "KOSPI" },
  USD: { symbol: "^GSPC", label: "S&P 500" },
};

export interface BenchmarkResult {
  /** ok=비교 가능, unavailable=지수 데이터 실패, insufficient=흐름 부족. */
  status: "ok" | "unavailable" | "insufficient";
  /** 비교 지수 표시명(KOSPI / S&P 500). */
  label: string;
  /** 동일현금흐름 XIRR(소수). 90일 미만이면 null. */
  benchmarkXirr: number | null;
  /** 동일현금흐름 누적수익률(소수). */
  benchmarkCumulative: number | null;
  /** 벤치마크 현재 평가액(₩). */
  benchmarkTerminal: number | null;
}

interface IndexSeries {
  /** 오름차순 정렬된 일별 종가. */
  bars: { date: string; close: number }[];
  /** 현재(최근) 지수. */
  now: number;
}

function toYMD(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/** 지수 일별 종가 시계열(설립일~오늘). 실패 시 null. */
async function fetchIndexSeries(
  symbol: string,
  foundedAt: string,
  today: string,
): Promise<IndexSeries | null> {
  try {
    // 설립일 14일 전부터 조회 — 설립 당일 봉이 아직 없거나(장 마감 전·휴장),
    // 시장별 시차(미국장이 한국 오후엔 오늘 봉 미생성)로 빈 결과가 나오는 걸 방지.
    // closeOnOrBefore 가 설립일 직전 거래일 종가를 골라낸다.
    const p1 =
      Math.floor(new Date(`${foundedAt}T00:00:00Z`).getTime() / 1000) -
      14 * 86400;
    const p2 = Math.floor(new Date(`${today}T23:59:59Z`).getTime() / 1000) + 86400;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol,
      )}?period1=${p1}&period2=${p2}&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] =
      result?.indicators?.quote?.[0]?.close ?? [];
    const bars: { date: string; close: number }[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (typeof c === "number") bars.push({ date: toYMD(ts[i]), close: c });
    }
    if (bars.length === 0) return null;
    const metaNow = result?.meta?.regularMarketPrice;
    const now = typeof metaNow === "number" ? metaNow : bars[bars.length - 1].close;
    return { bars, now };
  } catch {
    return null;
  }
}

/**
 * 비교 지수 일별 종가 시계열(₩ 환산 아님 — 지수 포인트). 벤치마크 라인 차트용.
 * @returns IndexSeries | null. label 은 호출부에서 INDEX_BY_CURRENCY 로.
 */
export async function getIndexSeries(
  currency: Currency,
  foundedAt: string,
  today: string,
): Promise<IndexSeries | null> {
  return fetchIndexSeries(INDEX_BY_CURRENCY[currency].symbol, foundedAt, today);
}

/** 비교 지수 표시명. */
export function indexLabel(currency: Currency): string {
  return INDEX_BY_CURRENCY[currency].label;
}

/**
 * "동일 현금흐름을 지수에 넣었다면" 특정 날짜 d 의 ₩ 평가액.
 * 지분(units) 누적: 설립자본·증자=매수, 인출=매도 — 각 흐름일 지수로. d 시점 지수로 평가.
 * value series 와 같은 ₩·같은 투입원금 → 직접 비교 가능(나 vs 시장 라인).
 */
export function benchmarkValueOn(
  series: IndexSeries,
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  date: string,
): number {
  let units = holding.initialValuation / closeOnOrBefore(series, holding.foundedAt);
  for (const e of events) {
    if (e.date > date) continue;
    if (e.type === "DEPOSIT") units += e.priceOrAmount / closeOnOrBefore(series, e.date);
    else if (e.type === "WITHDRAWAL")
      units -= e.priceOrAmount / closeOnOrBefore(series, e.date);
  }
  return units * closeOnOrBefore(series, date);
}

/** date 이하(매매일 기준 가장 가까운 과거) 종가. 없으면 첫 종가로 폴백. */
function closeOnOrBefore(series: IndexSeries, date: string): number {
  let chosen = series.bars[0].close;
  for (const b of series.bars) {
    if (b.date <= date) chosen = b.close;
    else break;
  }
  return chosen;
}

/**
 * 동일 현금흐름을 KOSPI에 투입했을 때의 수익률.
 * 외부 흐름 = 설립자본(매수) + 증자(매수) − 인출(매도). 배당·매매는 내부라 제외(buildFlows 와 동일 규칙).
 */
/** 벤치마크 상세 — 지수 수익률 비교 그룹(표시통화 무관, 수익률은 비율). */
export const INDEX_GROUP: { symbol: string; label: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "나스닥" },
  { symbol: "^KS11", label: "코스피" },
  { symbol: "^KQ11", label: "코스닥" },
  { symbol: "000300.SS", label: "CSI 300" },
  { symbol: "HSTECH.HK", label: "항셍테크" },
];

/** 동일 현금흐름을 임의 지수에 넣었을 때의 수익률(PME). 지수 파라미터화. */
export async function computeBenchmarkFor(
  index: { symbol: string; label: string },
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  today: string,
): Promise<BenchmarkResult> {
  const empty: BenchmarkResult = {
    status: "unavailable",
    label: index.label,
    benchmarkXirr: null,
    benchmarkCumulative: null,
    benchmarkTerminal: null,
  };

  const series = await fetchIndexSeries(index.symbol, holding.foundedAt, today);
  if (!series) return empty;

  // 지분 누적: 기여(설립자본·증자)는 매수, 인출은 매도. 같은 외부 흐름을 xirr 에도 넣는다.
  let units = holding.initialValuation / closeOnOrBefore(series, holding.foundedAt);
  const flows: Flow[] = [
    { date: holding.foundedAt, amount: -holding.initialValuation },
  ];
  for (const e of events) {
    if (e.type === "DEPOSIT") {
      units += e.priceOrAmount / closeOnOrBefore(series, e.date);
      flows.push({ date: e.date, amount: -e.priceOrAmount });
    } else if (e.type === "WITHDRAWAL") {
      units -= e.priceOrAmount / closeOnOrBefore(series, e.date);
      flows.push({ date: e.date, amount: +e.priceOrAmount });
    }
  }

  const benchmarkTerminal = units * series.now;
  flows.push({ date: today, amount: +benchmarkTerminal });

  // 누적수익률(내 cumulativeReturn 과 동일 공식)
  const invested = holding.initialValuation + totalDeposits(events);
  const withdrawals = totalWithdrawals(events);
  const benchmarkCumulative =
    invested > 0
      ? (benchmarkTerminal + withdrawals - totalDeposits(events) - holding.initialValuation) /
        invested
      : null;

  const days = daysSince(holding.foundedAt, today);
  if (days < 90) {
    return {
      status: "ok",
      label: index.label,
      benchmarkXirr: null,
      benchmarkCumulative,
      benchmarkTerminal,
    };
  }

  const rate = xirr(flows);
  return {
    status: rate === null ? "insufficient" : "ok",
    label: index.label,
    benchmarkXirr: rate,
    benchmarkCumulative,
    benchmarkTerminal,
  };
}

/** 표시통화 기본 지수(KRW=KOSPI / USD=S&P 500) PME — 기존 호출부(대시보드·/returns) 호환. */
export async function computeBenchmark(
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  today: string,
  currency: Currency = "KRW",
): Promise<BenchmarkResult> {
  return computeBenchmarkFor(INDEX_BY_CURRENCY[currency], holding, events, today);
}

/** 심볼로 직접 지수 시계열(다중 지수 선택 차트용). 실패 시 null. */
export async function getIndexSeriesBySymbol(
  symbol: string,
  foundedAt: string,
  today: string,
): Promise<IndexSeries | null> {
  return fetchIndexSeries(symbol, foundedAt, today);
}

/**
 * 이미 받은 지수 시계열로 PME 요약(연환산·누적) 산출 — 재fetch 없이
 * 차트 라인(benchmarkValueOn)과 요약을 같은 시리즈로 함께 뽑을 때 쓴다.
 */
export function indexSummaryFromSeries(
  series: IndexSeries,
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  today: string,
): { benchmarkXirr: number | null; benchmarkCumulative: number | null } {
  let units = holding.initialValuation / closeOnOrBefore(series, holding.foundedAt);
  const flows: Flow[] = [
    { date: holding.foundedAt, amount: -holding.initialValuation },
  ];
  for (const e of events) {
    if (e.type === "DEPOSIT") {
      units += e.priceOrAmount / closeOnOrBefore(series, e.date);
      flows.push({ date: e.date, amount: -e.priceOrAmount });
    } else if (e.type === "WITHDRAWAL") {
      units -= e.priceOrAmount / closeOnOrBefore(series, e.date);
      flows.push({ date: e.date, amount: +e.priceOrAmount });
    }
  }
  const terminal = units * series.now;
  flows.push({ date: today, amount: +terminal });
  const invested = holding.initialValuation + totalDeposits(events);
  const benchmarkCumulative =
    invested > 0
      ? (terminal + totalWithdrawals(events) - totalDeposits(events) - holding.initialValuation) /
        invested
      : null;
  const benchmarkXirr =
    daysSince(holding.foundedAt, today) < 90 ? null : xirr(flows);
  return { benchmarkXirr, benchmarkCumulative };
}
