/**
 * 랭킹 점수 엔진 — 7가지 투자 규율 지표.
 * 모든 계산은 events + 현재가만 사용 (과거 시세 불필요).
 *
 * 지표(가중치는 RANKING_WEIGHTS):
 *  1. 보유기간 가중 수익률 (24%) — 오래 들고 있을수록 수익률을 더 크게 인정
 *  2. 역발상 매수율       (20%) — 기존 보유 종목이 하락했을 때 추가매수한 비율
 *  3. 시장 대비 성과      (16%) — 동일 현금흐름을 코스피에 넣었을 때 대비 XIRR 초과분
 *  4. 분산도 일관성       (12%) — 매 거래 시점 HHI 시간평균의 역수
 *  5. 적립 일관성         (8%)  — 월별 입금 이벤트 비율
 *  6. 저레버리지          (10%) — 부채/자산(0=무차입 만점, 40%↑=0점)
 *  7. 저비용              (10%) — 마찰비용(수수료+세금)/원금(0=만점, 2%↑=0점)
 */

import type { InvestmentEvent } from "./finance/valuation";
import type { PriceMap } from "./finance/valuation";
import type { BenchmarkResult } from "./finance/benchmark";
import type { ReturnResult } from "./finance/returns";
import {
  computeDrag,
  lowCostScore01,
  debtToAssets,
  lowLeverageScore01,
} from "./finance/discipline";

/** 랭킹 채점 스키마 버전 — DB ranking_scores.score_version 과 대응. */
export const SCORE_VERSION = 2;

/** 7개 지표 가중치. 합계 = 1.00(테스트로 검증). */
export const RANKING_WEIGHTS = {
  holdingPeriod: 0.24,
  contrarian: 0.2,
  marketOutperformance: 0.16,
  diversification: 0.12,
  deposit: 0.08,
  lowLeverage: 0.1,
  lowCost: 0.1,
} as const;

export interface RankingScore {
  total: number;
  grade: string;
  holdingPeriod: number;
  contrarian: number;
  marketOutperformance: number;
  diversification: number;
  deposit: number;
  lowLeverage: number;
  lowCost: number;
  holdingPeriodInsufficient: boolean;
  contrarianInsufficient: boolean;
  marketInsufficient: boolean;
  diversificationInsufficient: boolean;
  depositInsufficient: boolean;
  leverageInsufficient: boolean;
  costInsufficient: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function daysBetween(a: string, b: string): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
    ),
  );
}

/**
 * 보유기간 가중 수익률 (30%)
 * 각 매수 lot 마다 return_rate × log(1 + days/30) 를 원가 가중 평균.
 * 장기 보유 + 수익일수록 점수 높음.
 */
function holdingPeriodScore(
  events: InvestmentEvent[],
  prices: PriceMap,
  today: string,
): { score: number; insufficient: boolean } {
  const tradeEvents = events
    .filter((e) => e.symbol && (e.type === "BUY" || e.type === "SELL"))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const symbols = [...new Set(tradeEvents.map((e) => e.symbol as string))];

  let totalCost = 0;
  let weightedContrib = 0;

  for (const sym of symbols) {
    const symEvs = tradeEvents.filter((e) => e.symbol === sym);
    const lots: { date: string; price: number; qty: number }[] = [];

    for (const e of symEvs) {
      const qty = Number(e.quantity ?? 0);
      if (qty <= 0) continue;

      if (e.type === "BUY") {
        lots.push({ date: e.date, price: e.priceOrAmount, qty });
      } else {
        let remaining = qty;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          const matched = Math.min(lot.qty, remaining);
          const days = daysBetween(lot.date, e.date);
          const ret = lot.price > 0 ? e.priceOrAmount / lot.price - 1 : 0;
          const timeW = Math.log(1 + days / 30);
          const cost = matched * lot.price;
          weightedContrib += ret * timeW * cost;
          totalCost += cost;
          remaining -= matched;
          lot.qty -= matched;
          if (lot.qty < 1e-9) lots.shift();
        }
      }
    }

    // 미청산 lot — 현재가로 평가
    const currentPrice = prices[sym];
    for (const lot of lots) {
      if (lot.qty < 1e-9) continue;
      const days = daysBetween(lot.date, today);
      const ret =
        currentPrice != null && lot.price > 0
          ? currentPrice / lot.price - 1
          : 0;
      const timeW = Math.log(1 + days / 30);
      const cost = lot.qty * lot.price;
      weightedContrib += ret * timeW * cost;
      totalCost += cost;
    }
  }

  if (totalCost === 0) return { score: 50, insufficient: true };

  const raw = weightedContrib / totalCost;
  // raw ≈ 0 at break-even. [-1, 1] → [0, 100]
  const score = clamp(((raw + 1) / 2) * 100, 0, 100);
  return { score, insufficient: false };
}

/**
 * 역발상 매수율 (25%)
 * 기존 보유 종목을 추가 매수할 때 평균단가보다 낮으면 역발상.
 * 추가매수가 없으면 insufficient.
 */
function contrarianScore(events: InvestmentEvent[]): {
  score: number;
  insufficient: boolean;
} {
  const tradeEvents = events
    .filter((e) => e.symbol && (e.type === "BUY" || e.type === "SELL"))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const state: Record<string, { qty: number; avgCost: number }> = {};
  let addOnBuys = 0;
  let contrarianBuys = 0;

  for (const e of tradeEvents) {
    const sym = e.symbol as string;
    const qty = Number(e.quantity ?? 0);
    if (qty <= 0) continue;

    const s = state[sym] ?? { qty: 0, avgCost: 0 };

    if (e.type === "BUY") {
      if (s.qty > 1e-9) {
        addOnBuys++;
        if (e.priceOrAmount < s.avgCost) contrarianBuys++;
      }
      const newCost = s.qty * s.avgCost + qty * e.priceOrAmount;
      s.qty += qty;
      s.avgCost = s.qty > 0 ? newCost / s.qty : 0;
    } else {
      s.qty = Math.max(0, s.qty - qty);
      if (s.qty < 1e-9) { s.qty = 0; s.avgCost = 0; }
    }
    state[sym] = s;
  }

  if (addOnBuys === 0) return { score: 50, insufficient: true };
  return {
    score: clamp((contrarianBuys / addOnBuys) * 100, 0, 100),
    insufficient: false,
  };
}

/**
 * 시장 대비 성과 (20%)
 * 내 XIRR - 코스피 PME XIRR. +10%p 초과 → 100점, -10%p → 0점.
 */
function marketOutperformanceScore(
  result: ReturnResult,
  benchmark: BenchmarkResult,
): { score: number; insufficient: boolean } {
  if (
    result.xirr === null ||
    benchmark.status !== "ok" ||
    benchmark.benchmarkXirr === null
  ) {
    return { score: 50, insufficient: true };
  }
  const diff = result.xirr - benchmark.benchmarkXirr;
  // diff +0.10 → 100, 0 → 50, -0.10 → 0
  const score = clamp(((diff + 0.1) / 0.2) * 100, 0, 100);
  return { score, insufficient: false };
}

/**
 * 분산도 일관성 (15%)
 * 매 거래 시점마다 원가 기준 HHI 계산, 시간 평균.
 * HHI=1(집중)→0점, 낮을수록(분산)→100점.
 */
function diversificationScore(events: InvestmentEvent[]): {
  score: number;
  insufficient: boolean;
} {
  const tradeEvents = events
    .filter((e) => e.symbol && (e.type === "BUY" || e.type === "SELL"))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  if (tradeEvents.length < 2) return { score: 50, insufficient: true };

  const state: Record<string, { qty: number; avgCost: number }> = {};
  const hhis: number[] = [];

  for (const e of tradeEvents) {
    const sym = e.symbol as string;
    const qty = Number(e.quantity ?? 0);
    if (qty <= 0) continue;

    const s = state[sym] ?? { qty: 0, avgCost: 0 };
    if (e.type === "BUY") {
      const newCost = s.qty * s.avgCost + qty * e.priceOrAmount;
      s.qty += qty;
      s.avgCost = s.qty > 0 ? newCost / s.qty : 0;
    } else {
      s.qty = Math.max(0, s.qty - qty);
      if (s.qty < 1e-9) { s.qty = 0; s.avgCost = 0; }
    }
    state[sym] = s;

    const values = Object.values(state)
      .filter((v) => v.qty > 1e-9)
      .map((v) => v.qty * v.avgCost);
    const total = values.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const hhi = values.reduce((sum, v) => sum + (v / total) ** 2, 0);
      hhis.push(hhi);
    }
  }

  if (hhis.length === 0) return { score: 50, insufficient: true };

  const avgHhi = hhis.reduce((a, b) => a + b, 0) / hhis.length;
  return { score: clamp((1 - avgHhi) * 100, 0, 100), insufficient: false };
}

/**
 * 적립 일관성 (10%)
 * DEPOSIT 이벤트가 있는 달 / 설립~오늘 총 달수.
 */
function depositScore(
  events: InvestmentEvent[],
  foundedAt: string,
  today: string,
): { score: number; insufficient: boolean } {
  const deposits = events.filter((e) => e.type === "DEPOSIT");
  if (deposits.length === 0) return { score: 0, insufficient: true };

  const monthsWithDeposit = new Set(deposits.map((e) => e.date.slice(0, 7)));
  const [sy, sm] = foundedAt.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const totalMonths = Math.max(1, (ty - sy) * 12 + (tm - sm) + 1);

  return {
    score: clamp((monthsWithDeposit.size / totalMonths) * 100, 0, 100),
    insufficient: false,
  };
}

/**
 * 저비용 점수 (10%)
 * drag(마찰비용/원금)가 null(원금 없음)이면 insufficient(50점).
 */
function lowCostRankingScore(
  events: InvestmentEvent[],
  initialValuation: number,
): { score: number; insufficient: boolean } {
  const drag = computeDrag(events, initialValuation);
  if (drag == null) return { score: 50, insufficient: true };
  return { score: lowCostScore01(drag) * 100, insufficient: false };
}

/**
 * 저레버리지 점수 (10%)
 * 부채가 있는데 현재 평가액(시세)을 알 수 없으면 insufficient(50점).
 * 무차입(debtKrw<=0)이면 만점.
 */
function lowLeverageRankingScore(
  debtKrw: number,
  currentValuation: number | null,
): { score: number; insufficient: boolean } {
  if (debtKrw > 0 && currentValuation == null) {
    return { score: 50, insufficient: true };
  }
  const ratio = debtToAssets(debtKrw, currentValuation ?? 0);
  return { score: lowLeverageScore01(ratio) * 100, insufficient: false };
}

export function toGrade(total: number): string {
  if (total >= 90) return "S";
  if (total >= 80) return "A+";
  if (total >= 70) return "A";
  if (total >= 60) return "B+";
  if (total >= 50) return "B";
  return "C";
}

export function computeRankingScore(
  events: InvestmentEvent[],
  prices: PriceMap,
  foundedAt: string,
  result: ReturnResult,
  benchmark: BenchmarkResult,
  today: string,
  /** 저레버리지·저비용 채점에 쓰는 규율 지표 입력. 안 넘기면 무차입·원금 0 취급(호출부 배선 전 임시값). */
  discipline: { initialValuation: number; debtKrw: number } = {
    initialValuation: 0,
    debtKrw: 0,
  },
): RankingScore {
  const hp = holdingPeriodScore(events, prices, today);
  const ct = contrarianScore(events);
  const mkt = marketOutperformanceScore(result, benchmark);
  const dv = diversificationScore(events);
  const dp = depositScore(events, foundedAt, today);
  const lev = lowLeverageRankingScore(discipline.debtKrw, result.currentValuation);
  const cost = lowCostRankingScore(events, discipline.initialValuation);

  const total =
    hp.score * RANKING_WEIGHTS.holdingPeriod +
    ct.score * RANKING_WEIGHTS.contrarian +
    mkt.score * RANKING_WEIGHTS.marketOutperformance +
    dv.score * RANKING_WEIGHTS.diversification +
    dp.score * RANKING_WEIGHTS.deposit +
    lev.score * RANKING_WEIGHTS.lowLeverage +
    cost.score * RANKING_WEIGHTS.lowCost;

  return {
    total: Math.round(total),
    grade: toGrade(total),
    holdingPeriod: Math.round(hp.score),
    contrarian: Math.round(ct.score),
    marketOutperformance: Math.round(mkt.score),
    diversification: Math.round(dv.score),
    deposit: Math.round(dp.score),
    lowLeverage: Math.round(lev.score),
    lowCost: Math.round(cost.score),
    holdingPeriodInsufficient: hp.insufficient,
    contrarianInsufficient: ct.insufficient,
    marketInsufficient: mkt.insufficient,
    diversificationInsufficient: dv.insufficient,
    depositInsufficient: dp.insufficient,
    leverageInsufficient: lev.insufficient,
    costInsufficient: cost.insufficient,
  };
}
