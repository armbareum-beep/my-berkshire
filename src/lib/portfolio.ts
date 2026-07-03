import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "./supabase/database.types";
import {
  computeReturn,
  type ReturnResult,
  type HoldingSnapshot,
} from "./finance/returns";
import { getKrwPrices } from "./finance/prices";
import { netQuantities, type InvestmentEvent } from "./finance/valuation";
import { daysSince } from "./finance/xirr";
import { loadSecurityNames } from "./securities";
import { todayKST } from "./date";
import { getActiveHolding, type Holding } from "./holdings";

export interface Portfolio {
  holding: Holding;
  events: InvestmentEvent[];
  result: ReturnResult;
  /** 종목별 순보유수량(0 제외). */
  positions: Record<string, number>;
  /** 현재가 — 모두 원화(KRW) 환산값(외국 종목은 현재 환율 적용). */
  prices: Record<string, number>;
  previousCloses: Record<string, number>;
  /** 종목코드 → 종목명(securities 적재분 우선, 없으면 카탈로그). */
  names: Record<string, string>;
  /** USD→KRW 현재 환율(표시 $ 모드용). 못 받으면 null. */
  usdKrw: number | null;
  /** 활성 이벤트 수(삭제·상쇄 제외). */
  eventCount: number;
  /** 마지막 활성 이벤트 후 경과일(이벤트 없으면 null). */
  daysSinceLastEvent: number | null;
}

type EventRow = Database["public"]["Tables"]["events"]["Row"];

/**
 * 계산 대상 활성 이벤트만 추린다(PRD 4):
 *  · 소프트 삭제(deleted_at) 제외
 *  · 상쇄 마커(reverses_event_id) 제외
 *  · 상쇄당한 원본 제외
 */
export function activeEventRows<
  T extends Pick<EventRow, "id" | "deleted_at" | "reverses_event_id">,
>(rows: T[]): T[] {
  const cancelled = new Set(
    rows
      .filter((r) => r.reverses_event_id && !r.deleted_at)
      .map((r) => r.reverses_event_id as string),
  );
  return rows.filter(
    (r) => !r.deleted_at && !r.reverses_event_id && !cancelled.has(r.id),
  );
}

/**
 * 컴퍼니 토글 적용 — included=false 컴퍼니의 계좌 이벤트를 제거.
 * 전원 포함(또는 컴퍼니 없음)이면 입력을 그대로 반환(추가 쿼리·필터 없음 → 회귀 0).
 * member_id=null 계좌는 기본 컴퍼니(정렬 첫 컴퍼니)에 귀속해 판정.
 */
async function scopeToIncludedMembers<T extends { account_id: string }>(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  rows: T[],
): Promise<T[]> {
  const { data: memberRows } = await supabase
    .from("members")
    .select("id, included, sort_order, created_at")
    .eq("holding_id", holdingId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const members = memberRows ?? [];
  if (members.length === 0) return rows; // 컴퍼니 미도입 — 그대로
  if (members.every((m) => m.included)) return rows; // 전원 포함 — 그대로

  const defaultMemberId = members[0].id;
  const includedIds = new Set(
    members.filter((m) => m.included).map((m) => m.id),
  );

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, member_id")
    .eq("holding_id", holdingId);
  const memberOf = new Map(
    (accountRows ?? []).map((a) => [a.id, a.member_id ?? defaultMemberId]),
  );

  return rows.filter((r) => {
    const memberId = memberOf.get(r.account_id) ?? defaultMemberId;
    return includedIds.has(memberId);
  });
}

/**
 * 활성 holding 의 이벤트를 모아 수익률·포지션을 계산한 스냅샷.
 * 시세는 getKrwPrices 로 실연동(₩ 환산, FINANCE_SOURCE 로 yahoo/kis 분기). 비즈니스 로직은 finance/ 모듈을 호출만 한다.
 */
export const getPortfolio = cache(async function getPortfolio(
  supabase: SupabaseClient<Database>,
): Promise<Portfolio | null> {
  const holding = await getActiveHolding(supabase);
  if (!holding) return null;

  // 사용 컬럼만 명시(전송량↓). activeEventRows(id·deleted_at·reverses_event_id) +
  // 매핑(type·symbol·quantity·price_or_amount·fee_and_tax·date·currency·fx_rate·to_currency·to_amount).
  const { data: rows } = await supabase
    .from("events")
    .select(
      "id, account_id, type, symbol, quantity, price_or_amount, fee_and_tax, date, currency, fx_rate, to_currency, to_amount, deleted_at, reverses_event_id, accounts!inner(holding_id)",
    )
    .eq("accounts.holding_id", holding.id)
    .order("date", { ascending: true }) as unknown as { data: Database["public"]["Tables"]["events"]["Row"][] | null };

  // 컴퍼니(CEO) 토글 — included=false 컴퍼니의 계좌 이벤트는 연결(합산)에서 제외.
  // 전원 포함이면 필터를 건너뛰어 기존과 100% 동일 결과(회귀 0).
  const scoped = await scopeToIncludedMembers(supabase, holding.id, rows ?? []);

  const active = activeEventRows(scoped);
  const events: InvestmentEvent[] = active.map((r) => ({
    type: r.type,
    symbol: r.symbol,
    quantity: r.quantity === null ? null : Number(r.quantity),
    priceOrAmount: Number(r.price_or_amount),
    feeAndTax: Number(r.fee_and_tax),
    date: r.date,
    currency: r.currency ?? "KRW",
    fxRate: r.fx_rate == null ? 1 : Number(r.fx_rate),
    toCurrency: r.to_currency,
    toAmount: r.to_amount == null ? null : Number(r.to_amount),
  }));

  const today = todayKST();
  const lastDate = active.reduce<string | null>(
    (max, r) => (max === null || r.date > max ? r.date : max),
    null,
  );
  const daysSinceLastEvent =
    lastDate === null ? null : daysSince(lastDate, today);

  const symbols = [
    ...new Set(events.filter((e) => e.symbol).map((e) => e.symbol as string)),
  ];
  // 현재가는 모두 ₩ 환산(외국 종목은 현재 환율 적용). 기능통화=KRW.
  const { prices, previousCloses, usdKrw, available } =
    await getKrwPrices(symbols);
  const names = await loadSecurityNames(supabase, symbols);

  const snapshot: HoldingSnapshot = {
    foundedAt: holding.founded_at,
    initialValuation: Number(holding.initial_valuation),
  };

  const result = computeReturn(snapshot, events, prices, today, available);

  const nets = netQuantities(events);
  const positions: Record<string, number> = {};
  for (const [s, q] of Object.entries(nets)) if (q !== 0) positions[s] = q;

  return {
    holding,
    events,
    result,
    positions,
    prices,
    previousCloses,
    names,
    usdKrw,
    eventCount: events.length,
    daysSinceLastEvent,
  };
});
