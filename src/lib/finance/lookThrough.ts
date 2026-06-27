/**
 * 투시 펀더멘털(look-through) — 내가 소유한 사업체들의 진짜 실적(PRD §8-2).
 *
 * 지분율 = 내 보유수량 / 총발행주식수. 각 회사 재무항목에 곱해 "내 몫"을 구하고 합산.
 * 절대값(매출·순이익 등)은 내 지분만큼이라 소액이 정상. 비율은 합산값에서 파생(scale-free).
 *
 * V1 = 한국 주식(DART)만 합산. 그래도 **모든 보유 자산을 legs 로 반환**(상태 라벨과 함께) —
 * 미국(EDGAR 연동 예정)·ETF(구성종목 펼치기)·코인/원자재(이익 없는 자산)는 숨기지 않고 사유 표기.
 * 오너이익은 추정(유지CapEx) 필요 → 자동 합산 안 함(§8-2). FCF·D&A·CapEx 는 공시값 그대로.
 *
 * 분기별 진화(computeLookThroughSeries)는 **저장 없이 events+공시+과거주가에서 온더플라이 복원** —
 * XIRR·대시보드와 동일한 "파생" 철학. 연간 재무 기준(분기 움직임=자본배분+시장가치+연간보고서 스텝).
 *
 * 세 층위 분리: XIRR(시장수익률) / 순자산(내 지갑) / 투시(소유 사업의 실체).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import {
  getFundamentals,
  getLatestFundamentalSet,
  type Fundamentals,
} from "./dart";
import { getEtfStats } from "./etfStats";
import { findCatalogItem } from "./catalog";
import { loadSecurityMeta } from "../securities";
import { isCrypto } from "../securities";
import {
  netQuantities,
  totalDeposits,
  totalWithdrawals,
  type InvestmentEvent,
} from "./valuation";
import { closeOnOrBefore } from "./valueSeries";
import { quartersBetween } from "./quarterClose";
import type { DailyBar } from "./prices";
import type { AllocationSlice } from "../dashboard";

export type LegStatus =
  | "included" // 한국·미국 주식 공시 있음, 또는 ETF PER로 귀속 순이익 산출 → 합산됨
  | "no_disclosure" // 한국 주식인데 공시/발행주식수 없음
  | "us_pending" // 미국 주식 — EDGAR 연동 시 채워짐(후속)
  | "etf_pending" // ETF — 과거 분기 시리즈(당시 PER 없음)
  | "etf_no_per" // ETF — Yahoo PER 미제공(채권·소형 한국 ETF 등)
  | "no_earnings"; // 코인·금·원자재 — 이익 없는 자산(항상 해당없음)

export interface LookThroughLeg {
  symbol: string;
  name: string;
  assetType: string;
  /** 보유 시장가치(₩). */
  value: number;
  status: LegStatus;
  reason: string;
  /** included 만 — 지분율(내 주식수/총발행). */
  ownership?: number;
  /** included 만 — 내 몫 순이익(₩). */
  netIncomeMine?: number;
  /** included 만 — 회사 전체 시총(₩) = value / ownership. */
  marketCap?: number;
  /** included 만 — 회사별 밸류에이션·수익성(비율, 통화 무관). */
  per?: number | null;
  pbr?: number | null;
  roe?: number | null;
  netMargin?: number | null;
}

export interface LookThrough {
  asOfNote: string;
  coverage: {
    coveredValue: number;
    totalValue: number;
    ratio: number; // 0~1
    includedCount: number;
    legs: LookThroughLeg[]; // 전체 보유(상태 포함)
  };
  // 내 몫 절대 합산(₩) — included 만
  revenue: number;
  operatingIncome: number;
  netIncome: number;
  assets: number;
  liabilities: number;
  equity: number;
  ocf: number;
  icf: number;
  ffcf: number;
  fcf: number;
  dna: number;
  capex: number;
  interestExpense: number;
  /** 반영된 보유 시장가치(₩) — 투시 PER/PBR/PSR 분자. */
  coveredValue: number;
  // 밸류에이션(반영 시장가치 ÷ 투시 실적) — 종목상세 지표를 투시 레벨로
  per: number | null; // 투시 시총 / 투시 순이익
  pbr: number | null; // / 투시 자본
  psr: number | null; // / 투시 매출
  // 파생(합산 절대값에서 — 가중평균과 동일)
  roe: number | null;
  roa: number | null;
  netMargin: number | null; // 순이익/매출
  operatingMargin: number | null; // 영업이익/매출
  assetTurnover: number | null; // 매출/자산
  leverage: number | null; // 자산/자본(재무레버리지)
  debtRatio: number | null; // 부채/자본
  interestCoverage: number | null; // 영업이익/이자비용
  earningsYield: number | null; // 투시순이익 / 투입원금
}

const REASON: Record<Exclude<LegStatus, "included">, string> = {
  no_disclosure: "공시·발행주식수 없음",
  us_pending: "미국 — 펀더멘털 연동 예정",
  etf_pending: "ETF — PER 데이터 없음",
  etf_no_per: "ETF — PER 데이터 없음",
  no_earnings: "이익이 없는 자산",
};

/** 자산 분류 → 합산 후보(한국 주식)인지, 아니면 어떤 미반영 상태인지. */
function classify(
  symbol: string,
  assetType: string,
): "candidate" | "us_pending" | "etf_pending" | "no_earnings" {
  if (isCrypto(symbol)) return "no_earnings";
  if (assetType === "원자재") return "no_earnings"; // 금·원유 등 — 회사 이익 없음
  if (assetType === "ETF") return "etf_pending";
  // 한국(DART)·미국(EDGAR) 주식 모두 합산 후보 — getFundamentals 가 심볼로 분기.
  // EDGAR 실패(미상장·매핑 없음)면 aggregate 에서 no_disclosure 처리.
  return "candidate";
}

/** 합산 입력 — 한 보유 자산(분류 결과 + 한국주식이면 공시). */
interface AggItem {
  symbol: string;
  name: string;
  assetType: string;
  value: number; // 보유 시장가치(₩)
  quantity: number; // 내 보유수량
  kind: "candidate" | "us_pending" | "etf_included" | "etf_no_per" | "etf_pending" | "no_earnings";
  fund: Fundamentals | null; // candidate 만(없으면 no_disclosure)
  etfPer?: number; // etf_included 만 — Yahoo equityHoldings.per
}

/**
 * 순수 합산 코어 — 분류된 보유 + 투입원금 → 투시 펀더멘털.
 * 현재 시점(computeLookThrough)과 과거 분기(computeLookThroughSeries)가 공유.
 */
function aggregate(
  items: AggItem[],
  invested: number,
  requestedBasis: "ttm" | "fy" = "fy",
): LookThrough {
  const sum = {
    revenue: 0, operatingIncome: 0, netIncome: 0,
    assets: 0, liabilities: 0, equity: 0,
    ocf: 0, icf: 0, ffcf: 0, fcf: 0, dna: 0, capex: 0,
    interestExpense: 0,
  };
  const add = (k: keyof typeof sum, v: number | null, own: number) => {
    if (v != null) sum[k] += v * own;
  };

  const legs: LookThroughLeg[] = [];
  const years: number[] = [];
  let coveredValue = 0;
  let ttmCount = 0;
  let fyFallbackCount = 0;
  const ratioOrNull = (num: number, den: number) => (den > 0 ? num / den : null);

  for (const it of items) {
    const base: LookThroughLeg = {
      symbol: it.symbol,
      name: it.name,
      assetType: it.assetType,
      value: it.value,
    } as LookThroughLeg;

    // ETF — PER 있으면 귀속 순이익(보유 시장가치 ÷ PER)만 합산. 나머지 재무항목은 없음.
    if (it.kind === "etf_included" && it.etfPer != null && it.etfPer > 0) {
      const netIncomeMine = it.value / it.etfPer;
      sum.netIncome += netIncomeMine;
      coveredValue += it.value;
      legs.push({
        ...base,
        status: "included",
        reason: "",
        netIncomeMine,
        per: it.etfPer,
      });
      continue;
    }

    if (it.kind !== "candidate") {
      const status: Exclude<LegStatus, "included"> =
        it.kind === "etf_included" ? "etf_no_per" : it.kind;
      legs.push({ ...base, status, reason: REASON[status] });
      continue;
    }

    const f = it.fund;
    if (!f || !f.shares || f.shares <= 0) {
      legs.push({ ...base, status: "no_disclosure", reason: REASON.no_disclosure });
      continue;
    }

    const ownership = it.quantity / f.shares;
    if (requestedBasis === "ttm") {
      if ("basis" in f && f.basis === "TTM") ttmCount += 1;
      else fyFallbackCount += 1;
    }
    add("revenue", f.revenue, ownership);
    add("operatingIncome", f.operatingIncome, ownership);
    add("netIncome", f.netIncome, ownership);
    add("assets", f.assets, ownership);
    add("liabilities", f.liabilities, ownership);
    add("equity", f.equity, ownership);
    add("ocf", f.ocf, ownership);
    add("icf", f.icf, ownership);
    add("ffcf", f.ffcf, ownership);
    add("fcf", f.fcf, ownership);
    add("dna", f.dna, ownership);
    add("capex", f.capex, ownership);
    add("interestExpense", f.interestExpense, ownership);

    years.push(f.year);
    coveredValue += it.value;
    const marketCap = ownership > 0 ? it.value / ownership : 0;
    legs.push({
      ...base,
      status: "included",
      reason: "",
      ownership,
      netIncomeMine: f.netIncome != null ? f.netIncome * ownership : 0,
      marketCap,
      per: ratioOrNull(marketCap, f.netIncome ?? 0),
      pbr: ratioOrNull(marketCap, f.equity ?? 0),
      roe: f.roe ?? ratioOrNull(f.netIncome ?? 0, f.equity ?? 0),
      netMargin: ratioOrNull(f.netIncome ?? 0, f.revenue ?? 0),
    });
  }

  const totalValue = items.reduce((s, it) => s + it.value, 0);
  const includedCount = legs.filter((l) => l.status === "included").length;

  const minY = years.length ? Math.min(...years) : null;
  const maxY = years.length ? Math.max(...years) : null;
  const asOfNote = minY == null
      ? "반영할 한국 주식 공시가 없습니다."
      : requestedBasis === "ttm" && ttmCount > 0
        ? fyFallbackCount > 0
          ? `최근 12개월 기준 · ${fyFallbackCount}개 사업부는 직전 연간으로 대체`
          : "최근 12개월 기준"
      : requestedBasis === "ttm"
        ? "분기 공시가 부족해 직전 연간 기준으로 대체"
      : minY === maxY
        ? `${minY}년 연간 기준`
        : `${minY}~${maxY}년 연간 기준(종목마다 최신 공시연도가 달라요)`;

  return {
    asOfNote,
    coverage: {
      coveredValue,
      totalValue,
      ratio: totalValue > 0 ? coveredValue / totalValue : 0,
      includedCount,
      legs,
    },
    ...sum,
    coveredValue,
    per: ratioOrNull(coveredValue, sum.netIncome),
    pbr: ratioOrNull(coveredValue, sum.equity),
    psr: ratioOrNull(coveredValue, sum.revenue),
    roe: ratioOrNull(sum.netIncome, sum.equity),
    roa: ratioOrNull(sum.netIncome, sum.assets),
    netMargin: ratioOrNull(sum.netIncome, sum.revenue),
    operatingMargin: ratioOrNull(sum.operatingIncome, sum.revenue),
    assetTurnover: ratioOrNull(sum.revenue, sum.assets),
    leverage: ratioOrNull(sum.assets, sum.equity),
    debtRatio: ratioOrNull(sum.liabilities, sum.equity),
    interestCoverage: ratioOrNull(sum.operatingIncome, sum.interestExpense),
    earningsYield: ratioOrNull(sum.netIncome, invested),
  };
}

/**
 * 현재 시점 투시 펀더멘털. allocation(종목별 ₩가치·수량) + 투입원금으로.
 * 한국 주식만 getFundamentals(year) 로 합산, 나머지는 상태 라벨과 함께 legs 로.
 */
export async function computeLookThrough(
  supabase: SupabaseClient<Database>,
  opts: {
    allocation: AllocationSlice[];
    year: number; // 기준 연도(todayKST 의 year)
    invested: number; // 투입 원금(₩)
    basis?: "ttm" | "fy";
  },
): Promise<LookThrough> {
  const { allocation, year, invested, basis = "fy" } = opts;
  const meta = await loadSecurityMeta(
    supabase,
    allocation.map((a) => a.symbol),
  );

  const classified = allocation.map((a) => {
    const assetType = meta[a.symbol]?.assetType ?? "주식";
    return { slice: a, assetType, kind: classify(a.symbol, assetType) };
  });

  const candidates = classified.filter((c) => c.kind === "candidate");
  const etfs = classified.filter((c) => c.kind === "etf_pending");

  const [funds, etfResults] = await Promise.all([
    Promise.all(
      candidates.map(async (c) => {
        if (basis === "fy")
          return getFundamentals(c.slice.symbol, year, supabase);
        const set = await getLatestFundamentalSet(c.slice.symbol, year, supabase);
        return set.ttm ?? set.latestAnnual;
      }),
    ),
    Promise.all(
      etfs.map(async (c) => {
        try {
          const proxy = findCatalogItem(c.slice.symbol)?.yahooProxy;
          return await getEtfStats(c.slice.symbol, proxy);
        } catch {
          return null;
        }
      }),
    ),
  ]);

  const fundOf = new Map<string, Fundamentals | null>(
    candidates.map((c, i) => [c.slice.symbol, funds[i]]),
  );
  const etfPerOf = new Map<string, number | null>(
    etfs.map((c, i) => [c.slice.symbol, etfResults[i]?.equityHoldings.per ?? null]),
  );

  const items: AggItem[] = classified.map((c) => {
    if (c.kind === "etf_pending") {
      const etfPer = etfPerOf.get(c.slice.symbol) ?? null;
      return {
        symbol: c.slice.symbol,
        name: c.slice.name,
        assetType: c.assetType,
        value: c.slice.value,
        quantity: c.slice.quantity,
        kind: etfPer != null && etfPer > 0 ? "etf_included" : "etf_no_per",
        fund: null,
        etfPer: etfPer ?? undefined,
      };
    }
    return {
      symbol: c.slice.symbol,
      name: c.slice.name,
      assetType: c.assetType,
      value: c.slice.value,
      quantity: c.slice.quantity,
      kind: c.kind,
      fund: c.kind === "candidate" ? (fundOf.get(c.slice.symbol) ?? null) : null,
    };
  });

  return aggregate(items, invested, basis);
}

/** 분기별 한 포인트 — 차트용(연결 핵심 지표만). */
export interface QuarterPoint {
  label: string;
  netIncome: number;
  revenue: number;
  operatingIncome: number;
  equity: number;
  assets: number;
  fcf: number;
  coveredValue: number;
  per: number | null;
  pbr: number | null;
  psr: number | null;
  roe: number | null;
  roa: number | null;
  netMargin: number | null;
  operatingMargin: number | null;
}

/**
 * 분기별 진화 — 저장 없이 events+공시+과거주가에서 복원.
 * 각 분기말 시점의 보유수량·당시 종가·해당 회계연도 공시로 aggregate 를 재호출.
 * getFundamentals 는 (종목,연도) 단위 메모이즈(분기 여러 개라도 연도 중복은 1회).
 */
export async function computeLookThroughSeries(
  supabase: SupabaseClient<Database>,
  opts: {
    events: InvestmentEvent[];
    foundedAt: string;
    today: string;
    initialValuation: number;
    /** 보유 종목 일별 ₩ 종가(getDailyKrwCloses). */
    priceSeries: Record<string, DailyBar[]>;
  },
): Promise<QuarterPoint[]> {
  const { events, foundedAt, today, initialValuation, priceSeries } = opts;
  const symbols = [
    ...new Set(events.filter((e) => e.symbol).map((e) => e.symbol as string)),
  ];
  if (symbols.length === 0) return [];

  const meta = await loadSecurityMeta(supabase, symbols);
  const assetTypeOf = (s: string) => meta[s]?.assetType ?? "주식";
  const nameOf = (s: string) => meta[s]?.name ?? s;

  // (종목,연도) 메모이즈 — 분기 반복 호출 시 중복 fetch 방지.
  const fundCache = new Map<string, Promise<Fundamentals | null>>();
  const fundFor = (symbol: string, year: number) => {
    const key = `${symbol}|${year}`;
    let p = fundCache.get(key);
    if (!p) {
      p = getFundamentals(symbol, year, supabase);
      fundCache.set(key, p);
    }
    return p;
  };

  const quarters = quartersBetween(foundedAt, today);

  // 분기를 병렬로 — 각 분기는 독립이고, fundFor 메모이즈(동기 set)가 (종목,연도) 중복 fetch 를
  // 막아 준다. 기존 순차 루프는 분기 수만큼 DART 왕복을 줄세웠다 → 콜드 로딩의 가장 큰 직렬 비용.
  const points: QuarterPoint[] = await Promise.all(
    quarters.map(async (q) => {
      const upto = events.filter((e) => e.date <= q.end);
      const positions = netQuantities(upto);
      const held = Object.entries(positions).filter(([, qty]) => qty > 0);
      const fiscalYear = Number(q.end.slice(0, 4));

      const items: AggItem[] = await Promise.all(
        held.map(async ([symbol, qty]) => {
          const assetType = assetTypeOf(symbol);
          const rawKind = classify(symbol, assetType);
          // 과거 분기 시점에는 ETF PER 데이터가 없으므로 etf_no_per 처리.
          const kind = rawKind === "etf_pending" ? "etf_no_per" : rawKind;
          const price = closeOnOrBefore(priceSeries[symbol] ?? [], q.end) ?? 0;
          const fund =
            kind === "candidate" ? await fundFor(symbol, fiscalYear) : null;
          return {
            symbol,
            name: nameOf(symbol),
            assetType,
            value: qty * price,
            quantity: qty,
            kind,
            fund,
          };
        }),
      );

      const invested =
        initialValuation + totalDeposits(upto) - totalWithdrawals(upto);
      const lt = aggregate(items, invested);
      return {
        label: q.label,
        netIncome: lt.netIncome,
        revenue: lt.revenue,
        operatingIncome: lt.operatingIncome,
        equity: lt.equity,
        assets: lt.assets,
        fcf: lt.fcf,
        coveredValue: lt.coveredValue,
        per: lt.per,
        pbr: lt.pbr,
        psr: lt.psr,
        roe: lt.roe,
        roa: lt.roa,
        netMargin: lt.netMargin,
        operatingMargin: lt.operatingMargin,
      };
    }),
  );

  return points;
}
