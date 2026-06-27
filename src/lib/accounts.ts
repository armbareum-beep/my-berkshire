/**
 * 계좌별 집계 — 자산 탭의 "계좌별 접이식" 뷰용.
 * 각 계좌의 보유종목·평가액·현금을 표시 통화로 계산.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { netQuantities, type InvestmentEvent } from "./finance/valuation";
import { activeEventRows } from "./portfolio";
import { findCatalogItem } from "./finance/catalog";
import type { AccountType } from "./config/tax";

export interface AccountHolding {
  symbol: string;
  name: string;
  quantity: number;
  value: number; // 표시 통화
  /** 평단 대비 현재가 등락(소수). 평단 0이면 null. 비율이라 통화 무관. */
  changeRate: number | null;
  /** 평가차익(표시 통화) = (현재가 − 평단) × 수량. 평단 0이면 null. */
  gain: number | null;
}

export interface AccountGroup {
  id: string;
  name: string;
  accountType: AccountType;
  /** 소속 컴퍼니(CEO) id. null = 미지정(기본 컴퍼니 '본인'). */
  memberId: string | null;
  /** 증권사 id(lib/config/brokers). null = 직접 입력 — 로고 폴백. */
  broker: string | null;
  value: number; // 보유 종목 평가액(표시 통화). 현금은 회사 레벨이라 제외.
  /** 계좌 전체 평단 대비 등락(소수) = 평단확인 보유의 (현재가합/평단합 − 1). 비율이라 통화 무관. */
  changeRate: number | null;
  /** 계좌 전체 평가차익(표시 통화) = Σ 평단확인 보유의 (현재가−평단)×수량. */
  gain: number | null;
  /** 평단확인 보유의 원가 합(표시 통화). 컴퍼니 단위 재집계용(rate는 평균 불가, 원가/차익은 가산). */
  costBasis: number;
  holdings: AccountHolding[];
}

/** 종목별 통합 보유(여러 계좌 합산). 홈화면 종목 통합 뷰용. */
export interface ConsolidatedHolding {
  symbol: string;
  name: string;
  /** 전 계좌 합산 수량. */
  totalQuantity: number;
  /** 전 계좌 합산 평가액(표시통화). */
  totalValue: number;
  /** 평단확인 보유의 합산 평가차익(표시통화). 평단 없으면 null. */
  totalGain: number | null;
  /** 가중평균 등락률. 평단 없으면 null. */
  changeRate: number | null;
}

/**
 * AccountGroup[] → 종목 단위로 병합. 같은 심볼은 전 계좌에 걸쳐 합산.
 * 등락률은 원가 가중평균, 평단 없는 보유는 비율 계산 제외.
 */
export function flattenHoldings(groups: AccountGroup[]): ConsolidatedHolding[] {
  const map = new Map<
    string,
    {
      name: string;
      qty: number;
      value: number;
      gain: number | null;
      costSum: number; // Σ avgCost*qty*factor (평단 확인 분)
      curSum: number; // Σ price*qty*factor (평단 확인 분)
    }
  >();

  for (const g of groups) {
    for (const h of g.holdings) {
      const e = map.get(h.symbol) ?? {
        name: h.name,
        qty: 0,
        value: 0,
        gain: null,
        costSum: 0,
        curSum: 0,
      };
      e.qty += h.quantity;
      e.value += h.value;
      if (h.gain != null) {
        e.gain = (e.gain ?? 0) + h.gain;
        // costBasis = value - gain (= avgCost * qty * factor)
        e.costSum += h.value - h.gain;
        e.curSum += h.value;
      }
      map.set(h.symbol, e);
    }
  }

  return [...map.entries()]
    .map(([symbol, e]) => ({
      symbol,
      name: e.name,
      totalQuantity: e.qty,
      totalValue: e.value,
      totalGain: e.gain,
      changeRate: e.costSum > 0 ? e.curSum / e.costSum - 1 : null,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * 계좌별 그룹 로드 — 계좌는 자회사(종목)만 담는다. 현금은 계좌 밖(회사 금고).
 * prices 는 ₩, factor 로 표시 통화 환산.
 */
export async function loadAccountGroups(
  supabase: SupabaseClient<Database>,
  opts: {
    holdingId: string;
    prices: Record<string, number>; // ₩
    names: Record<string, string>;
    factor: number; // ₩ → 표시통화
  },
): Promise<AccountGroup[]> {
  const { holdingId, prices, names, factor } = opts;

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, account_type, broker, member_id")
    .eq("holding_id", holdingId)
    .order("created_at", { ascending: true });
  const accounts = accountRows ?? [];
  if (accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);
  // 사용 컬럼만 명시(전송량↓). 필터/매핑/activeEventRows 가 쓰는 컬럼만.
  const { data: eventRows } = await supabase
    .from("events")
    .select(
      "id, account_id, type, symbol, quantity, price_or_amount, fee_and_tax, date, deleted_at, reverses_event_id",
    )
    .in("account_id", accountIds);

  const nameOf = (s: string) => names[s] ?? findCatalogItem(s)?.name ?? s;

  return accounts.map((acc) => {
    const active = activeEventRows(
      (eventRows ?? []).filter((r) => r.account_id === acc.id),
    );
    const mapped: InvestmentEvent[] = active.map((r) => ({
      type: r.type,
      symbol: r.symbol,
      quantity: r.quantity === null ? null : Number(r.quantity),
      priceOrAmount: Number(r.price_or_amount),
      feeAndTax: Number(r.fee_and_tax),
      date: r.date,
    }));

    // 종목별 평단(활성 BUY 기준) — 평단 대비 등락 계산용. computeDashboard 와 동일 방식.
    const buyAgg: Record<string, { qty: number; cost: number }> = {};
    for (const e of mapped) {
      if (e.type === "BUY" && e.symbol && e.quantity) {
        const a = (buyAgg[e.symbol] ??= { qty: 0, cost: 0 });
        a.qty += e.quantity;
        a.cost += e.quantity * e.priceOrAmount;
      }
    }

    const nets = netQuantities(mapped);
    const holdings: AccountHolding[] = [];
    // 계좌 수익률 = 평단확인 보유만 합산(현재가합/평단합). 평단 없는 보유는 비율 왜곡 방지로 제외.
    let curForCostKrw = 0;
    let costKrw = 0;
    for (const [symbol, qty] of Object.entries(nets)) {
      if (qty === 0) continue;
      const price = prices[symbol] ?? 0; // ₩
      const agg = buyAgg[symbol];
      const avgCost = agg && agg.qty > 0 ? agg.cost / agg.qty : 0; // ₩
      if (avgCost > 0) {
        curForCostKrw += price * qty;
        costKrw += avgCost * qty;
      }
      holdings.push({
        symbol,
        name: nameOf(symbol),
        quantity: qty,
        value: qty * price * factor,
        // 평단 대비 등락 = 현재가/평단 − 1. ₩끼리라 factor 무관(비율).
        changeRate: avgCost > 0 ? price / avgCost - 1 : null,
        // 평가차익(표시통화) = (현재가 − 평단) × 수량 × factor.
        gain: avgCost > 0 ? (price - avgCost) * qty * factor : null,
      });
    }
    holdings.sort((a, b) => b.value - a.value);

    return {
      id: acc.id,
      name: acc.name,
      accountType: acc.account_type as AccountType,
      memberId: acc.member_id,
      broker: acc.broker,
      value: holdings.reduce((s, h) => s + h.value, 0),
      changeRate: costKrw > 0 ? curForCostKrw / costKrw - 1 : null,
      gain: costKrw > 0 ? (curForCostKrw - costKrw) * factor : null,
      costBasis: costKrw * factor,
      holdings,
    };
  });
}
