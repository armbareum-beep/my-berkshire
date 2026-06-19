/**
 * 다년 정규화 — 펀더멘털 카드의 "기준(basis)"을 만든다.
 *
 * 선택(Selection): 평균(3/5/10년) 또는 단년(2024…). 단년 노이즈를 줄이려 평균이 기본(§12).
 *   · 지표(매출~현금흐름)는 기간 평균 또는 그 해 값.
 *   · 오너이익은 **연도별로** 순이익+D&A−CapEx 를 구해 평균(정규화). D&A 없는 해는 제외.
 * 시총·안전마진은 항상 "오늘" 기준이라 여기 안 들어옴(매수 판단은 현재 시점).
 */

import type { Fundamentals } from "./dart";
import type { ManualMagnitude } from "../manualFundamentals";

export type Selection =
  | { kind: "avg"; years: number }
  | { kind: "year"; year: number };

/**
 * ?fy= 파싱. "2024"→단년, "5Y"→평균(과거 URL 호환). 기본 = 최신 연도(단년).
 * 셀렉터는 연도만 노출 — 다년 평균/추세는 "최근 실적 추이" 차트가 담당.
 */
export function parseSelection(
  fy: string | undefined,
  fallbackYear: number,
): Selection {
  if (fy) {
    const m = fy.match(/^(\d+)Y$/i);
    if (m) return { kind: "avg", years: Number(m[1]) };
    const y = Number(fy);
    if (Number.isInteger(y) && y > 1900) return { kind: "year", year: y };
  }
  return { kind: "year", year: fallbackYear };
}

export interface Basis {
  label: string; // "5년 평균" | "2024년"
  isAverage: boolean;
  /** 단년일 때 그 연도(수기 입력 대상). 평균이면 null. */
  year: number | null;
  /** 기준에 포함된 연도(최신순) — 입력 패널·근거 표시용. */
  years: number[];

  // 지표(평균 또는 단년)
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  intangibles: number | null;
  ocf: number | null;
  icf: number | null;
  ffcf: number | null;
  interestExpense: number | null;
  capex: number | null;
  fcf: number | null;

  // 오너이익(정규화)
  ownerEarnings: number | null; // D&A 있는 연도만 평균
  oeDna: number | null; // 기준 D&A(평균 또는 단년)
  oeCapex: number | null; // 기준 CapEx(유지 우선)
  oeYearsUsed: number; // 오너이익 계산에 쓰인 연도 수
  oeYearsTotal: number; // 기간 내 연도 수
  usingMaintCapex: boolean; // 유지CapEx 사용 연도 존재

  // 비율(기준 지표에서 파생)
  roe: number | null;
  debtRatio: number | null;
  operatingMargin: number | null;
}

/** TTM처럼 이미 한 기간으로 정규화된 펀더멘털을 화면 Basis로 변환한다. */
export function basisFromFundamentals(
  data: Fundamentals,
  label: string,
): Basis {
  return {
    label,
    isAverage: false,
    year: null,
    years: [],
    revenue: data.revenue,
    operatingIncome: data.operatingIncome,
    netIncome: data.netIncome,
    assets: data.assets,
    liabilities: data.liabilities,
    equity: data.equity,
    intangibles: data.intangibles,
    ocf: data.ocf,
    icf: data.icf,
    ffcf: data.ffcf,
    interestExpense: data.interestExpense,
    capex: data.capex,
    fcf: data.fcf,
    ownerEarnings: data.ownerEarnings,
    oeDna: data.dna,
    oeCapex: data.capex,
    oeYearsUsed: data.ownerEarnings != null ? 1 : 0,
    oeYearsTotal: 1,
    usingMaintCapex: false,
    roe: data.roe,
    debtRatio: data.debtRatio,
    operatingMargin: data.operatingMargin,
  };
}

function avg(nums: (number | null)[]): number | null {
  const v = nums.filter((n): n is number => typeof n === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** 한 연도의 유효 D&A·CapEx(수기 우선). */
function yearDnaCapex(
  f: Fundamentals,
  m: ManualMagnitude | undefined,
): { dna: number | null; capex: number | null; usedMaint: boolean } {
  const dna = m?.dna ?? f.dna ?? null;
  // 출처가 D&A 를 제공하면(미국 EDGAR) D&A·총CapEx 가 둘 다 자동이라, 유지CapEx 수기 없이도
  // 오너이익이 잡혀버린다. 이 경우 유지CapEx 를 수기로 받아야만 산출(총CapEx 자동 폴백 금지).
  // D&A 가 수기(한국 DART)면 유지CapEx 를 비울 때 총CapEx 보수적 폴백.
  if (f.dna != null) {
    const capex = m?.maintCapex ?? null;
    return { dna, capex, usedMaint: capex != null };
  }
  const capex = m?.maintCapex ?? f.capex ?? null;
  return { dna, capex, usedMaint: m?.maintCapex != null };
}

/**
 * 선택 기준의 basis 계산. series 는 최신순 Fundamentals[], magnitudes 는 연도→수기금액.
 */
export function computeBasis(
  series: Fundamentals[],
  magnitudes: Map<number, ManualMagnitude>,
  selection: Selection,
): Basis | null {
  if (!series.length) return null;

  const window =
    selection.kind === "year"
      ? series.filter((f) => f.year === selection.year)
      : series.slice(0, selection.years);
  if (!window.length) return null;

  const isAverage = selection.kind === "avg";
  const years = window.map((f) => f.year);
  const label = isAverage ? `${window.length}년 평균` : `${window[0].year}년`;

  const revenue = avg(window.map((f) => f.revenue));
  const operatingIncome = avg(window.map((f) => f.operatingIncome));
  const netIncome = avg(window.map((f) => f.netIncome));
  const assets = avg(window.map((f) => f.assets));
  const liabilities = avg(window.map((f) => f.liabilities));
  const equity = avg(window.map((f) => f.equity));
  const intangibles = avg(window.map((f) => f.intangibles));
  const ocf = avg(window.map((f) => f.ocf));
  const icf = avg(window.map((f) => f.icf));
  const ffcf = avg(window.map((f) => f.ffcf));
  const interestExpense = avg(window.map((f) => f.interestExpense));
  const capex = avg(window.map((f) => f.capex));
  const fcf = ocf != null && capex != null ? ocf - capex : null;

  // 오너이익 정규화 — 연도별로 구해 평균(D&A 있는 해만).
  const oeList: number[] = [];
  const dnaList: number[] = [];
  const oeCapexList: number[] = [];
  let usingMaintCapex = false;
  for (const f of window) {
    const { dna, capex: cx, usedMaint } = yearDnaCapex(f, magnitudes.get(f.year));
    if (f.netIncome != null && dna != null && cx != null) {
      oeList.push(f.netIncome + dna - cx);
      dnaList.push(dna);
      oeCapexList.push(cx);
      if (usedMaint) usingMaintCapex = true;
    }
  }
  const ownerEarnings = oeList.length ? avg(oeList) : null;

  const roe =
    netIncome != null && equity && equity > 0 ? netIncome / equity : null;
  const debtRatio =
    liabilities != null && equity && equity > 0 ? liabilities / equity : null;
  const operatingMargin =
    operatingIncome != null && revenue && revenue > 0
      ? operatingIncome / revenue
      : null;

  return {
    label,
    isAverage,
    year: selection.kind === "year" ? selection.year : null,
    years,
    revenue,
    operatingIncome,
    netIncome,
    assets,
    liabilities,
    equity,
    intangibles,
    ocf,
    icf,
    ffcf,
    interestExpense,
    capex,
    fcf,
    ownerEarnings,
    oeDna: avg(dnaList),
    oeCapex: avg(oeCapexList),
    oeYearsUsed: oeList.length,
    oeYearsTotal: window.length,
    usingMaintCapex,
    roe,
    debtRatio,
    operatingMargin,
  };
}
