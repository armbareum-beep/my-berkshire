/**
 * `/allocate` 계열 화면의 공통 데이터 로더.
 *
 * 재설계 전에는 이 로직이 `/allocate/page.tsx` 안에 통째로 있었다. 화면이 셋으로 갈리면서
 * (보기 / 배분 / 설정) 같은 계산을 세 번 쓰게 되어 한 곳으로 뺀다 —
 * **세 화면이 서로 다른 숫자를 보여주는 것**이 이 앱에서 가장 위험한 버그다.
 *
 * 계산 자체는 전부 기존 모듈을 부른다. 여기서 새로 하는 계산은 없다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { Currency } from "./format";
import { getPortfolio } from "./portfolio";
import { computeDashboard } from "./dashboard";
import { loadSecurityMeta } from "./securities";
import { readTargets } from "./targetWeights";
import { approvedSymbols, loadUniverseStatuses, resolveUniverse } from "./universe";
import { loadExpectedReturnAssumptions } from "./expectedReturnAssumptions";
import {
  attractivenessFromCagr,
  computeExpectedReturn,
} from "./finance/expectedReturn";
import { effectiveHurdle, houseHurdle } from "./hurdle";
import { loadCachedEps, nativeCurrencyOf, toNativeEps } from "./finance/cachedEps";
import type { AllocateTarget } from "./allocate";

/** 배분 대상 한 종목 — 엔진 입력 + 화면 표시용 값. */
export interface AllocateRow extends AllocateTarget {
  symbol: string;
  /** 요구수익률을 만족하는 최대 매수가(종목 통화). 가정이 없으면 null. */
  buyPrice?: number | null;
  /** 현재가(`buyPrice` 와 같은 통화). */
  nativePrice?: number | null;
  /** 위 두 가격의 통화 — 공시 경로는 해외 종목이어도 ₩ 다. */
  nativeCcy?: "KRW" | "USD";
  /** 한 주라도 들고 있는가. 미보유 후보는 평가액 0 으로 참여한다. */
  held: boolean;
  /** 현재가(표시통화). 배분 금액을 주수로 바꿀 때 쓴다. 모르면 0. */
  price: number;
}

export interface AllocateData {
  rows: AllocateRow[];
  currency: Currency;
  /** 전사 기본 요구수익률("내 허들"). */
  house: number;
  /** 자본배분 후보 심볼(보유 ∪ APPROVED). */
  candidates: string[];
  /** 보유 현금 전액. */
  cash: number;
  /**
   * 투자 가능 현금 — 사용자가 정한 값, 없으면 보유 현금 전액(스펙 §16.4).
   * 전체 현금과 분리하는 이유는 "생활비까지 다 넣지는 않는다"이기 때문이다.
   */
  investableCash: number;
  /** 사용자가 투자 가능 현금을 직접 정했는가(= 보유 현금 폴백이 아닌가). */
  investableCashSet: boolean;
  priceAvailable: boolean;
  /** 목표비중이 하나라도 있는가. 없으면 배분할 근거가 없다. */
  hasTargets: boolean;
  /** 허들을 넘긴 종목 수 / 가정이 있어 판정 가능한 종목 수. */
  passing: number;
  judged: number;
}

/** 로그인·온보딩이 끝난 사용자의 배분 데이터. 없으면 null(호출부가 redirect). */
export async function loadAllocateData(
  supabase: SupabaseClient<Database>,
  displayCcy: Currency,
): Promise<AllocateData | null> {
  const portfolio = await getPortfolio(supabase);
  if (!portfolio) return null;

  const data = computeDashboard(portfolio, displayCcy);

  // 후보 = 보유 ∪ APPROVED 관심종목(PRD §3.1). 미보유 후보는 평가액 0 으로 참여한다 —
  // 목표비중만 정해두면 첫 매수부터 배분안에 나온다.
  const heldSymbols = data.allocation.map((a) => a.symbol);
  const statuses = await loadUniverseStatuses(supabase, portfolio.holding.id);
  const candidates = approvedSymbols(resolveUniverse(heldSymbols, statuses));

  const [meta, assumptions, cachedEps] = await Promise.all([
    loadSecurityMeta(supabase, candidates),
    loadExpectedReturnAssumptions(supabase, portfolio.holding.id),
    // 공시 EPS — 캐시만 읽는다(API 호출 없음). 캐시에 없는 종목은 자동값 없이 넘어간다.
    loadCachedEps(supabase, candidates),
  ]);

  const heldValue: Record<string, number> = {};
  const heldName: Record<string, string> = {};
  const heldPrice: Record<string, number> = {};
  for (const a of data.allocation) {
    heldValue[a.symbol] = a.value;
    heldName[a.symbol] = a.name;
    heldPrice[a.symbol] = a.price;
  }

  const house = houseHurdle(portfolio.holding.required_return);

  // 표시통화 환산 계수 — `computeDashboard` 와 같은 규칙(환율을 모르면 ₩ 그대로).
  const factor =
    data.currency === "USD" && portfolio.usdKrw ? 1 / portfolio.usdKrw : 1;

  // 목표비중 — 저장 형식(레거시 2층 / 평면)을 `targetWeights.ts` 가 흡수한다.
  const targets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    candidates.map((symbol) => ({
      symbol,
      assetType: meta[symbol]?.assetType ?? "주식",
    })),
  );

  // 기대 CAGR = (EPS × (1+g)^Y × 배수 ÷ 가격)^(1/Y) − 1 은 **통화 무관**이다.
  // EPS/가격이 비율이라 둘을 같은 통화로만 맞추면 환산해도 답이 같다(환율이 상쇄).
  // 그래서 환산하지 않고 **짝만 맞춘다**:
  //
  //   수기 이익력 있음 → 사용자가 종목 통화로 넣었으므로 가격도 종목 통화로 (환율 필요)
  //   수기 없음(공시)  → 공시 EPS 도 가격도 이미 ₩ 이므로 **환율 없이** 그대로 (해외 포함)
  //
  // 후자가 기본 경로다. 환율을 못 가져와도 해외 종목 밸류에이션이 살아 있다.
  const usdKrw = portfolio.usdKrw;
  const metricAndPrice = (
    symbol: string,
    manual: number | null,
    autoKrw: number | undefined,
  ): { metric: number; price: number | null; ccy: "KRW" | "USD" } | null => {
    const priceKrw = portfolio.prices[symbol];
    if (manual != null && manual > 0) {
      const native = toNativeEps(priceKrw, symbol, usdKrw);
      return { metric: manual, price: native, ccy: nativeCurrencyOf(symbol) };
    }
    if (autoKrw != null && autoKrw > 0)
      return { metric: autoKrw, price: priceKrw > 0 ? priceKrw : null, ccy: "KRW" };
    return null;
  };

  const rows: AllocateRow[] = candidates.map((symbol) => {
    const value = heldValue[symbol] ?? 0;
    const label = heldName[symbol] ?? meta[symbol]?.name ?? symbol;
    const held = heldValue[symbol] != null;
    // 캡 오버라이드는 평면 저장에만 있다. 미지정이면 엔진이 기본 배수(1.25/1.50)를 쓴다.
    const rule = targets[symbol];
    const base = {
      key: symbol,
      symbol,
      label,
      value,
      held,
      // 미보유 후보는 dashboard 에 없으므로 원본 시세(₩)를 직접 환산한다.
      price: heldPrice[symbol] ?? (portfolio.prices[symbol] ?? 0) * factor,
      target: rule?.target ?? 0,
      softCap: rule?.softCap,
      hardCap: rule?.hardCap,
    };

    const assumption = assumptions[symbol];
    const pair = metricAndPrice(
      symbol,
      assumption?.currentMetric ?? null,
      cachedEps[symbol],
    );
    // 성장률·종료배수는 판단이라 자동값이 없다 — 둘 중 하나라도 없으면 비중 기반 배분.
    const usable =
      pair != null &&
      assumption?.expectedGrowth != null &&
      assumption?.terminalMultiple != null &&
      assumption.terminalMultiple > 0;
    if (!usable) return base;

    // 종목별 값 > 전사 기본값("난이도") > 코드 기본값 12%.
    const requiredReturn = effectiveHurdle(assumption.requiredReturn, house);
    const er = computeExpectedReturn(
      {
        currentMetric: pair.metric,
        expectedGrowth: assumption.expectedGrowth as number,
        terminalMultiple: assumption.terminalMultiple as number,
        holdingYears: assumption.holdingYears ?? undefined,
        requiredReturn,
      },
      pair.price,
    );
    return {
      ...base,
      attractiveness: attractivenessFromCagr(er?.expectedCagr ?? null, requiredReturn),
      expectedCagr: er?.expectedCagr ?? null,
      requiredReturn,
      buyPrice: er?.buyPrice ?? null,
      nativePrice: pair.price,
      nativeCcy: pair.ccy,
    };
  });

  const judged = rows.filter((r) => r.expectedCagr != null);
  const passing = judged.filter(
    (r) => (r.expectedCagr as number) >= (r.requiredReturn ?? house),
  ).length;

  // 투자 가능 현금은 **₩로 저장**하고 읽을 때 표시통화로 환산한다(스펙 §16.3).
  // 표시통화 그대로 저장하면 USD 로 보다가 저장한 값이 ₩ 화면에서 1/1400 로 보인다.
  const saved = portfolio.holding.investable_cash;
  const investableCashSet = saved != null && Number(saved) >= 0;

  return {
    rows,
    currency: data.currency,
    house,
    candidates,
    cash: data.cash,
    investableCash: investableCashSet ? Number(saved) * factor : data.cash,
    investableCashSet,
    priceAvailable: data.priceAvailable,
    hasTargets: rows.some((r) => r.target > 0),
    passing,
    judged: judged.length,
  };
}
