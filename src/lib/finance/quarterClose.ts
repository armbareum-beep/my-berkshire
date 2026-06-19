/**
 * CFO 분기 결산 — "이번 분기, 내 지주회사 실적".
 *
 * 새 데이터 없이 기존 events·시세·배당에서 전부 파생:
 *  · 분기 수익률(periodReturn — 분기초 평가액 재구성 + 구간 흐름)
 *  · 분기 활동(매수/매도·순투입·받은 배당·마찰비용 — events 날짜로 정확)
 *  · 종목 성적(분기초 종가 대비 현재가 등락)
 *  · CFO 코멘트(규율 관점 한마디)
 *
 * 순수함수 — 화면은 호출만. 모든 금액 ₩.
 */

import { pointAt, closeOnOrBefore, type HoldingSeed } from "./valueSeries";
import { periodReturn } from "./periodReturns";
import { netQuantities, type InvestmentEvent } from "./valuation";
import type { DailyBar } from "./prices";

export interface StockQuarterPerf {
  symbol: string;
  name: string;
  /** 분기초 종가 대비 현재가 등락(소수). 종가 없으면 null. */
  changePct: number | null;
}

export interface QuarterActivity {
  buys: number;
  sells: number;
  /** 분기 내 순투입 = 증자 − 인출(₩). */
  netInvested: number;
  /** 분기 내 받은 배당(₩, 세전). */
  dividends: number;
  /** 분기 내 마찰비용(수수료·세금, ₩). */
  fees: number;
}

export interface QuarterReport {
  label: string; // "2026 2분기"
  start: string; // 분기 시작(설립일로 클램프)
  days: number;
  /** 구간 누적 수익률(소수). 시세 없으면 null. */
  cumulative: number | null;
  /** 연환산(90일 이상 구간만). 보통 분기는 null. */
  xirr: number | null;
  activity: QuarterActivity;
  best: StockQuarterPerf | null;
  worst: StockQuarterPerf | null;
  stocks: StockQuarterPerf[];
  /** CFO 한마디(규율 관점). */
  comment: string;
}

/** today 가 속한 분기의 시작일·라벨. */
export function quarterBounds(today: string): { label: string; start: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const q = Math.floor((m - 1) / 3); // 0~3
  const startMonth = q * 3 + 1;
  return {
    label: `${y} ${q + 1}분기`,
    start: `${y}-${String(startMonth).padStart(2, "0")}-01`,
  };
}

/**
 * foundedAt 분기부터 today 분기까지 각 분기의 라벨·분기말(YYYY-MM-DD).
 * 현재 분기는 end=today(진행 중). 투시 분기별 진화 시계열 축에 쓰임.
 */
export function quartersBetween(
  foundedAt: string,
  today: string,
): { label: string; end: string }[] {
  const out: { label: string; end: string }[] = [];
  let y = Number(foundedAt.slice(0, 4));
  let q = Math.floor((Number(foundedAt.slice(5, 7)) - 1) / 3); // 0~3
  const endY = Number(today.slice(0, 4));
  const endQ = Math.floor((Number(today.slice(5, 7)) - 1) / 3);
  // 안전 상한(설립일 파싱 이상 시 무한루프 방지)
  for (let guard = 0; guard < 400; guard++) {
    if (y > endY || (y === endY && q > endQ)) break;
    const lastMonth = q * 3 + 3; // 3·6·9·12
    const lastDay = new Date(Date.UTC(y, lastMonth, 0)).getUTCDate();
    let end = `${y}-${String(lastMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    if (end > today) end = today;
    out.push({ label: `${y} ${q + 1}분기`, end });
    q += 1;
    if (q > 3) {
      q = 0;
      y += 1;
    }
  }
  return out;
}

/** home_signal_dismissals 의 `report:{라벨}` 키 집합 → 결산한 분기 라벨 집합. */
export function reviewedQuarters(dismissed: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const k of dismissed) {
    if (k.startsWith("report:")) out.add(k.slice("report:".length));
  }
  return out;
}

/**
 * 결산 스트릭 — 현재 분기부터 거꾸로 "연속으로 결산한 분기" 수.
 * 진행 중인 현재 분기를 아직 안 봤어도 스트릭을 끊지 않는다(유예).
 * 새 데이터 없이 /report 열람이 남긴 디스미스(reviewed)에서 파생.
 * @param quarterLabels 설립~현재 분기 라벨(시간순, quartersBetween 결과).
 * @param reviewed 결산한 분기 라벨 집합(reviewedQuarters).
 */
export function reportStreak(
  quarterLabels: string[],
  reviewed: Set<string>,
): number {
  if (quarterLabels.length === 0) return 0;
  let i = quarterLabels.length - 1;
  // 현재 분기 미열람이면 직전 분기부터 센다(현재는 진행 중이라 유예).
  if (!reviewed.has(quarterLabels[i])) i -= 1;
  let streak = 0;
  for (; i >= 0; i--) {
    if (reviewed.has(quarterLabels[i])) streak += 1;
    else break;
  }
  return streak;
}

function buildComment(
  cumulative: number | null,
  a: QuarterActivity,
  best: StockQuarterPerf | null,
): string {
  const trades = a.buys + a.sells;
  // 규율 관점(스타일 중립): 거래 빈도가 아니라 '비용·차분함'을 칭찬.
  if (trades === 0) {
    return "이번 분기 거래 0건 — 가만히 들고 가는 것도 훌륭한 자본배분이에요.";
  }
  if (cumulative != null && cumulative >= 0) {
    const top = best && best.changePct != null ? ` ${best.name}가 끌었어요.` : "";
    return `분기 ${trades}건 거래, 평가액은 플러스로 마감 중이에요.${top}`;
  }
  if (cumulative != null && cumulative < 0) {
    return "평가액이 분기 중 마이너스예요 — 좋은 기업이라면 가격 하락은 기회일 수 있어요.";
  }
  return `이번 분기 ${trades}건 거래했어요.`;
}

export function computeQuarterReport(
  holding: HoldingSeed,
  events: InvestmentEvent[],
  series: Record<string, DailyBar[]>,
  prices: Record<string, number>,
  names: Record<string, string>,
  /** 현재 총 투자평가액(₩) — returns.currentValuation. null=시세 실패. */
  currentValuation: number | null,
  today: string,
): QuarterReport {
  const { label } = quarterBounds(today);
  const rawStart = quarterBounds(today).start;
  // 설립일 이전이면 설립일로 클램프(분기 중 설립 시 설립~현재).
  const start = rawStart < holding.foundedAt ? holding.foundedAt : rawStart;

  // 분기 활동(시작일 포함 ~ 오늘)
  const activity: QuarterActivity = {
    buys: 0,
    sells: 0,
    netInvested: 0,
    dividends: 0,
    fees: 0,
  };
  for (const e of events) {
    if (e.date < start || e.date > today) continue;
    activity.fees += e.feeAndTax;
    if (e.type === "BUY") activity.buys += 1;
    else if (e.type === "SELL") activity.sells += 1;
    else if (e.type === "DEPOSIT") activity.netInvested += e.priceOrAmount;
    else if (e.type === "WITHDRAWAL") activity.netInvested -= e.priceOrAmount;
    else if (e.type === "DIVIDEND") activity.dividends += e.priceOrAmount;
  }

  // 분기 수익률(시세 있을 때만)
  let cumulative: number | null = null;
  let xirr: number | null = null;
  if (currentValuation != null) {
    const startValue = pointAt(holding, events, series, start).value;
    const pr = periodReturn(start, startValue, events, currentValuation, today);
    cumulative = pr.cumulative;
    xirr = pr.xirr;
  }

  // 종목 성적(분기초 종가 → 현재가)
  const nets = netQuantities(events);
  const stocks: StockQuarterPerf[] = [];
  for (const [symbol, qty] of Object.entries(nets)) {
    if (qty <= 0) continue;
    const bars = series[symbol];
    const startClose = bars ? closeOnOrBefore(bars, start) : null;
    const cur = prices[symbol] ?? null;
    const changePct =
      startClose != null && startClose > 0 && cur != null
        ? cur / startClose - 1
        : null;
    stocks.push({ symbol, name: names[symbol] ?? symbol, changePct });
  }
  const ranked = stocks
    .filter((s) => s.changePct != null)
    .sort((a, b) => (b.changePct as number) - (a.changePct as number));
  const best = ranked.length ? ranked[0] : null;
  const worst = ranked.length ? ranked[ranked.length - 1] : null;

  return {
    label,
    start,
    days: Math.max(
      0,
      Math.round(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
          86400000,
      ),
    ),
    cumulative,
    xirr,
    activity,
    best,
    worst,
    stocks,
    comment: buildComment(cumulative, activity, best),
  };
}
