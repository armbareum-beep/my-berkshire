/**
 * 대시보드 카드 데이터 계산 — 뷰(컴포넌트)와 분리된 순수 로직.
 * 모든 수치는 events + 시세에서 STEP 2 엔진으로 파생. 사용자 입력 수익률 없음.
 */
import type { Portfolio } from "./portfolio";
import {
  cashBalance,
  totalDeposits,
  totalWithdrawals,
} from "./finance/valuation";
import { daysSince } from "./finance/xirr";
import { findCatalogItem } from "./finance/catalog";
import { journeyMilestones } from "./finance/milestones";
import {
  computeCompoundingStreak,
  type CompoundingStreak,
} from "./finance/compoundingStreak";
import { todayKST } from "./date";
import type { Currency } from "./format";

export interface AllocationSlice {
  symbol: string;
  name: string;
  quantity: number;
  price: number; // 주당 현재가
  value: number; // 평가액(수량×현재가)
  weight: number; // 0~1 (보유자산 대비)
  avgCost: number; // 평균단가
  changeRate: number | null; // 평단 대비 등락(소수). 평단 0이면 null
  /** ETF 기초자산 국가 태그(자산구성 카드 국가별 집계용). ETF만 세팅, 그 외 undefined. */
  countryTag?: string;
}

export interface ActivityFeedItem {
  type: Portfolio["events"][number]["type"];
  symbol: string | null;
  name: string | null;
  quantity: number | null;
  priceOrAmount: number;
  date: string;
  daysAgo: number;
}

export interface TimelineItem {
  date: string;
  label: string;
}

export interface DashboardData {
  /** 표시 통화(모든 금액 필드가 이 통화로 환산되어 있음). */
  currency: Currency;
  priceAvailable: boolean;
  valuation: number | null; // 현재 총 자산
  /** 투입 원금 = 설립자본 + 증자 − 인출(내가 그간 넣은 순 자금). */
  invested: number;
  /** 투자 누적수익률 분모 = 설립자본 + 증자(인출 차감 전 총 투입). 총자산 수익률 합산용. */
  investedGross: number;
  dailyChange: number | null; // 어제(전일 종가) 대비 평가액 변동(금액)
  profit: number | null; // 누적 수익(금액) = 실현 + 미실현
  realized: number | null; // 실현 손익(매매차익 + 배당 − 비용)
  unrealized: number | null; // 미실현 손익(보유 평가차익)
  cash: number; // 현금잔고
  cashWeight: number | null; // 현금 비중(0~1)
  friction: number; // 누적 마찰비용(수수료+세금)
  drag: number | null; // 마찰비용 / 투자원금 (0~1)
  allocation: AllocationSlice[];
  recent: ActivityFeedItem[];
  timeline: TimelineItem[];
  /** 복리 무중단 — 소비성 인출 없이 복리를 지켜온 연속 기간(통화 무관). */
  compoundingStreak: CompoundingStreak;
}

export function computeDashboard(
  p: Portfolio,
  displayCurrency: Currency = "KRW",
): DashboardData {
  const { holding, events, result, positions, prices, previousCloses, names } = p;
  const today = todayKST();

  // 표시 통화 환산: 내부 계산은 모두 ₩. USD 모드면 현재 환율로 나눠 $ 표기.
  // usdKrw 없으면 환산 불가 → ₩로 폴백.
  const useUsd = displayCurrency === "USD" && !!p.usdKrw;
  const currency: Currency = useUsd ? "USD" : "KRW";
  const factor = useUsd ? 1 / (p.usdKrw as number) : 1;
  const cv = (n: number) => n * factor; // 금액 환산
  const cvN = (n: number | null) => (n == null ? null : n * factor);

  // 종목명 해석: securities/카탈로그(names) 우선, 없으면 코드 자체.
  const nameOf = (symbol: string) =>
    names[symbol] ?? findCatalogItem(symbol)?.name ?? symbol;

  const initialValuation = Number(holding.initial_valuation);
  const compoundingStreak = computeCompoundingStreak(
    events,
    { foundedAt: holding.founded_at, initialValuation },
    today,
  );
  const cash = initialValuation + cashBalance(events);
  const deposits = totalDeposits(events);
  const withdrawals = totalWithdrawals(events);

  const priceAvailable = result.status !== "price_unavailable";
  const valuation = result.currentValuation; // null when price unavailable

  const profit =
    valuation === null
      ? null
      : valuation + withdrawals - deposits - initialValuation;

  // 보유 종목 평가액 합(현금 제외)
  const posValue = Object.entries(positions).reduce((sum, [s, q]) => {
    const px = prices[s];
    return px != null ? sum + q * px : sum;
  }, 0);

  // 종목별 평균단가(활성 BUY 이벤트 기준)
  const buyAgg: Record<string, { qty: number; cost: number }> = {};
  for (const e of events) {
    if (e.type === "BUY" && e.symbol && e.quantity) {
      const a = (buyAgg[e.symbol] ??= { qty: 0, cost: 0 });
      a.qty += e.quantity;
      a.cost += e.quantity * e.priceOrAmount;
    }
  }

  // 모든 비중은 전체 자산(주식 + 현금) 대비로 통일 → 종목들 + 현금 = 100%
  const totalValue = posValue + cash;

  const allocation: AllocationSlice[] = Object.entries(positions)
    .map(([symbol, quantity]) => {
      const price = prices[symbol] ?? 0;
      const value = quantity * price;
      const agg = buyAgg[symbol];
      const avgCost = agg && agg.qty > 0 ? agg.cost / agg.qty : 0;
      return {
        symbol,
        name: nameOf(symbol),
        quantity,
        price,
        value,
        weight: totalValue > 0 ? value / totalValue : 0,
        avgCost,
        changeRate: avgCost > 0 ? price / avgCost - 1 : null,
      };
    })
    .sort((a, b) => b.value - a.value);

  // 어제(전일 종가) 대비 평가액 변동 = Σ 보유수량 × (현재가 − 전일종가)
  let dailyChange: number | null = null;
  if (priceAvailable) {
    let sum = 0;
    let any = false;
    for (const [s, q] of Object.entries(positions)) {
      const px = prices[s];
      const prev = previousCloses[s];
      if (px != null && prev != null) {
        sum += q * (px - prev);
        any = true;
      }
    }
    dailyChange = any ? sum : null;
  }

  // 미실현 손익 = Σ 보유(평가액 − 평단×수량). 실현 손익 = 누적 − 미실현.
  let unrealized: number | null = null;
  let realized: number | null = null;
  if (priceAvailable) {
    unrealized = allocation.reduce(
      (s, a) => s + (a.value - a.quantity * a.avgCost),
      0,
    );
    realized = profit === null ? null : profit - unrealized;
  }

  const cashWeight =
    valuation && valuation > 0 ? cash / valuation : valuation === 0 ? 1 : null;

  const friction = events.reduce((s, e) => s + e.feeAndTax, 0);
  const investedPrincipal = initialValuation + deposits;
  const drag = investedPrincipal > 0 ? friction / investedPrincipal : null;

  const recent: ActivityFeedItem[] = [...events]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5)
    .map((e) => ({
      type: e.type,
      symbol: e.symbol ?? null,
      name: e.symbol ? nameOf(e.symbol) : null,
      quantity: e.quantity ?? null,
      priceOrAmount: e.priceOrAmount,
      date: e.date,
      daysAgo: daysSince(e.date, today),
    }));

  // 회사 연혁(자동 생성) — 설립 + 첫 거래
  const timeline: TimelineItem[] = [
    { date: holding.founded_at, label: `${holding.name} 설립` },
  ];
  const firstBuy = [...events]
    .filter((e) => e.type === "BUY")
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (firstBuy) {
    const nm = firstBuy.symbol ? nameOf(firstBuy.symbol) : "";
    timeline.push({ date: firstBuy.date, label: `첫 매수 · ${nm}` });
  }
  // 여정 마일스톤(첫 해외 인수·첫 배당·투입 자본 돌파) — 중립·통제 가능한 것만.
  timeline.push(
    ...journeyMilestones(events, { foundedAt: holding.founded_at, initialValuation }, nameOf),
  );
  timeline.sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    currency,
    priceAvailable,
    valuation: cvN(valuation),
    invested: cv(initialValuation + deposits - withdrawals),
    investedGross: cv(initialValuation + deposits),
    dailyChange: cvN(dailyChange),
    profit: cvN(profit),
    realized: cvN(realized),
    unrealized: cvN(unrealized),
    cash: cv(cash),
    cashWeight, // 비율 — 통화 무관
    friction: cv(friction),
    drag, // 비율 — 통화 무관
    allocation: allocation.map((a) => ({
      ...a,
      price: cv(a.price),
      value: cv(a.value),
      avgCost: cv(a.avgCost),
      // weight·changeRate 는 비율이라 환산하지 않음
    })),
    recent: recent.map((r) => ({ ...r, priceOrAmount: cv(r.priceOrAmount) })),
    timeline,
    compoundingStreak, // 날짜·기간 — 통화 무관
  };
}
