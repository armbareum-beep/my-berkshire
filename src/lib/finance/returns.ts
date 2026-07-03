/**
 * 수익률 계산 오케스트레이션 — /docs/xirr-spec-v1.md 1·4·5.
 *
 * 화면(STEP 5)이 이 결과 객체 하나만 소비하도록, 엣지케이스 분기를 여기서 모두 처리.
 * UI는 status 에 따라 표시만 결정한다(직접 판단 금지).
 */

import { xirr, daysSince, type Flow } from "./xirr";
import {
  cashBalance,
  positionsValue,
  totalDeposits,
  totalWithdrawals,
  type InvestmentEvent,
  type PriceMap,
} from "./valuation";

const MIN_DAYS_FOR_ANNUALIZED = 90; // 설립 90일 미만은 연환산 금지(명세 4-1)

export type ReturnStatus =
  | "xirr" // 연환산 XIRR 표시
  | "cumulative_only" // 90일 미만 → 누적수익률만
  | "price_unavailable" // 시세 조회 실패 → "시세 갱신 필요"
  | "insufficient_data"; // 흐름 부족(해 없음)

export interface HoldingSnapshot {
  foundedAt: string; // YYYY-MM-DD
  initialValuation: number; // 설립 등기 평가액(현금흐름 t0, 음수로 들어감)
}

export interface ReturnResult {
  status: ReturnStatus;
  /** 연환산 수익률(소수, 예 0.2 = 20%). status==='xirr' 일 때만 값. */
  xirr: number | null;
  /** 누적 수익률(소수). 90일 미만 등에서 사용. */
  cumulativeReturn: number | null;
  /** CAGR(보조 지표, 소수). */
  cagr: number | null;
  /** 현재 총 평가액(terminal). 시세 실패 시 null. */
  currentValuation: number | null;
  days: number;
  /** 시세 미확보 종목(있으면 price_unavailable 원인). */
  missingSymbols: string[];
  message?: string;
}

/** 설립평가액(−), 입금(−), 출금(+), 오늘 평가액(+) 으로 flows 구성(명세 1). */
export function buildFlows(
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  terminalValue: number,
  today: string,
): Flow[] {
  const flows: Flow[] = [
    { date: holding.foundedAt, amount: -holding.initialValuation },
  ];
  for (const e of events) {
    if (e.type === "DEPOSIT") flows.push({ date: e.date, amount: -e.priceOrAmount });
    else if (e.type === "WITHDRAWAL") flows.push({ date: e.date, amount: +e.priceOrAmount });
    // 배당·매수·매도는 넣지 않는다(명세 1).
  }
  flows.push({ date: today, amount: +terminalValue });
  return flows;
}

/**
 * 누적 수익률(명세 4-1):
 * (terminal + Σ출금 − Σ입금 − initial_valuation) / (initial_valuation + Σ입금)
 */
export function cumulativeReturn(
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  terminalValue: number,
): number | null {
  const deposits = totalDeposits(events);
  const withdrawals = totalWithdrawals(events);
  const invested = holding.initialValuation + deposits;
  if (invested === 0) return null;
  return (
    (terminalValue + withdrawals - deposits - holding.initialValuation) / invested
  );
}

/**
 * CAGR(명세 5):
 * (terminal / (initial_valuation + Σ입금 − Σ출금))^(1/years) − 1
 */
export function cagr(
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  terminalValue: number,
  days: number,
): number | null {
  const base =
    holding.initialValuation + totalDeposits(events) - totalWithdrawals(events);
  if (base <= 0 || terminalValue <= 0) return null;
  const years = days / 365;
  if (years <= 0) return null;
  return Math.pow(terminalValue / base, 1 / years) - 1;
}

/**
 * 메인 진입점 — 모든 엣지케이스 분기 후 단일 결과 반환.
 *
 * @param pricesAvailable 시세 피드가 정상인지(false면 무조건 price_unavailable).
 */
export function computeReturn(
  holding: HoldingSnapshot,
  events: InvestmentEvent[],
  prices: PriceMap,
  today: string,
  pricesAvailable = true,
): ReturnResult {
  const days = daysSince(holding.foundedAt, today);
  const { value: posValue, missingSymbols } = positionsValue(events, prices);
  // 현재 평가액 = 보유평가 + 현금.
  // 현금 = 설립자본(첫 입금) + 현금흐름잔고. 설립 보유종목은 BUY 이벤트로 기록되어
  // cashBalance 에서 매입대금이 차감되며, 그 매입은 설립자본에서 지불된 것이므로
  // initial_valuation 을 더해 현금을 보존한다(설립자본 = founded_at 의 음수 흐름).
  const terminalValue =
    posValue + holding.initialValuation + cashBalance(events);

  const base: Omit<ReturnResult, "status" | "message"> = {
    xirr: null,
    cumulativeReturn: null,
    cagr: null,
    currentValuation: terminalValue,
    days,
    missingSymbols,
  };

  // 엣지 3: 시세 조회 실패 → 절대 0/이전값으로 대체하지 않음.
  if (!pricesAvailable || missingSymbols.length > 0) {
    return {
      ...base,
      currentValuation: null,
      status: "price_unavailable",
      message: "시세 갱신 필요",
    };
  }

  const cumulative = cumulativeReturn(holding, events, terminalValue);
  const cagrValue = cagr(holding, events, terminalValue, days);

  // 엣지 1: 설립 90일 미만 → 연환산 금지, 누적수익률만.
  // 기다림이 결핍처럼 느껴지지 않도록 정적 안내 대신 D-day 카운트다운으로 보여준다.
  if (days < MIN_DAYS_FOR_ANNUALIZED) {
    const remaining = Math.max(1, MIN_DAYS_FOR_ANNUALIZED - days);
    return {
      ...base,
      cumulativeReturn: cumulative,
      cagr: cagrValue,
      status: "cumulative_only",
      message: `연환산 수익률 공개까지 D-${remaining}`,
    };
  }

  // 정상: XIRR(엣지 2 — 이벤트 0건이어도 등기↔현재 2점으로 계산됨).
  const flows = buildFlows(holding, events, terminalValue, today);
  const rate = xirr(flows);

  if (rate === null) {
    return {
      ...base,
      cumulativeReturn: cumulative,
      cagr: cagrValue,
      status: "insufficient_data",
      message: "수익률을 계산할 흐름이 부족합니다.",
    };
  }

  return {
    ...base,
    xirr: rate,
    cumulativeReturn: cumulative,
    cagr: cagrValue,
    status: "xirr",
  };
}
