/**
 * 레버리지 금융비용 — 대출 이자를 수익률에 정직하게 반영(spec 012).
 *
 * 핵심: 이자는 **저장 행이 아니라 조회 시 계산식으로 파생**한다.
 *   누적 추정 이자 = Σ(대출별 잔액 × 이율 × 경과개월/12), 기점 = 대출 차입일(startedAt).
 * 추정과 현실의 오차는 **보정 체크포인트**(실제 납부액=비용 / 자본 투입=분모)로 스냅한다.
 *
 * 짝짓기는 대출 종류로 결정한다(담보→부동산 임대료, 마진→주식). 이 모듈은 한 사업부에
 * 짝지어진 대출 배열을 받아 그 사업부의 금융비용만 계산한다(division-level).
 *
 * 모든 금액 ₩(기능통화). 부동산 이자·보정은 events 를 건드리지 않는다(주식 XIRR 불변).
 */

import { annualInterest, weightedAvgRate, type Liability } from "./liabilities";

/** 보정 체크포인트 — 추정 누계를 실제값에 스냅. events 와 분리된 division-level 원장. */
export interface FinancingReconciliation {
  id: string;
  /** 자산군. v1 은 'REAL_ESTATE' 만. */
  division: "REAL_ESTATE";
  /** 보정 기준일(YYYY-MM-DD) — 이 시점까지 확정. */
  date: string;
  /** interest_actual=직전 체크포인트~date 의 확정 이자(비용). capital=투입 자본(분모). */
  kind: "interest_actual" | "capital";
  /** ₩, >= 0. */
  amount: number;
  note: string | null;
}

export interface FinancingInput {
  /** 해당 사업부에 짝지어진 대출(예: mortgageLiabilities 결과). */
  liabilities: Liability[];
  reconciliations: FinancingReconciliation[];
  /** 대출 startedAt 이 null 일 때의 누적 기점 폴백(부동산 취득일/기록 시작일). */
  accrualStartFallback: string;
  /** 연결 물건 id → 취득일. 대출이 물건에 연결됐고 startedAt 이 null 이면 이 날짜를 기점으로(spec 012). */
  assetAcquiredById?: Record<string, string>;
  /** 오늘(YYYY-MM-DD, KST). */
  asOf: string;
}

export interface DivisionFinancingCost {
  /** Σ interest_actual.amount — 확정 이자. */
  confirmedInterest: number;
  /** 마지막 확정 시점 이후 ~ asOf 의 파생 추정 이자. */
  estimatedInterest: number;
  /** confirmed + estimated — 사업부 수익(분자)에서 차감. */
  totalInterest: number;
  /** Σ capital.amount — 사업부 원가(분모)에 가산. */
  capitalAdded: number;
  /** 표시용 가중평균 이율(없으면 null). */
  weightedAvgRate: number | null;
  /** 표시용 월 추정 이자 = Σ(잔액×이율)/12. */
  monthlyEstimate: number;
}

/**
 * 두 YYYY-MM-DD 사이 경과 개월(소수). 완전 경과월 + 잔여일 일할.
 * `to <= from` 이면 0(미래·역전 클램프). UTC 달력 기준(배당 모듈과 동일 안정화).
 */
export function monthsBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return 0;
  }
  // 완전 경과월: from 에서 1개월씩 전진하며 to 를 넘지 않는 횟수.
  const cursor = new Date(fromMs);
  let whole = 0;
  while (true) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + 1);
    if (next.getTime() <= toMs) {
      whole += 1;
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    } else {
      break;
    }
  }
  // 잔여 일할: (to − cursor) / (다음 달 경계 − cursor).
  const next = new Date(cursor);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const span = next.getTime() - cursor.getTime();
  const frac = span > 0 ? (toMs - cursor.getTime()) / span : 0;
  return whole + frac;
}

/** 두 YYYY-MM-DD 중 더 늦은 날(ISO 문자열 비교). */
function laterDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * 한 사업부의 금융비용 — 확정(보정) + 파생 추정 이자, 자본 투입.
 * 저장하지 않는다(순수 파생). 대출 0개면 전부 0.
 */
export function divisionFinancingCost(
  input: FinancingInput,
): DivisionFinancingCost {
  const {
    liabilities,
    reconciliations,
    accrualStartFallback,
    assetAcquiredById,
    asOf,
  } = input;

  const interestActuals = reconciliations.filter(
    (r) => r.kind === "interest_actual",
  );
  const confirmedInterest = interestActuals.reduce((s, r) => s + r.amount, 0);
  const capitalAdded = reconciliations
    .filter((r) => r.kind === "capital")
    .reduce((s, r) => s + r.amount, 0);

  // 마지막 확정 시점(없으면 null) — 그 이후만 추정.
  const latestCheckpoint = interestActuals.reduce<string | null>(
    (latest, r) => (latest == null || r.date > latest ? r.date : latest),
    null,
  );

  let estimatedInterest = 0;
  for (const l of liabilities) {
    if (!(l.principal > 0) || !(l.interestRate > 0)) continue;
    // 기점 우선순위: 차입일 > 연결 물건 취득일 > 사업부 폴백.
    const linkedAcquired =
      l.manualAssetId != null
        ? assetAcquiredById?.[l.manualAssetId]
        : undefined;
    const loanStart = l.startedAt ?? linkedAcquired ?? accrualStartFallback;
    const start =
      latestCheckpoint != null ? laterDate(loanStart, latestCheckpoint) : loanStart;
    estimatedInterest += l.principal * l.interestRate * (monthsBetween(start, asOf) / 12);
  }

  return {
    confirmedInterest,
    estimatedInterest,
    totalInterest: confirmedInterest + estimatedInterest,
    capitalAdded,
    weightedAvgRate: weightedAvgRate(liabilities),
    monthlyEstimate: annualInterest(liabilities) / 12,
  };
}
