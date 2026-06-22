import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/date";
import {
  ActivityList,
  type ActivityItem,
} from "@/components/transactions/ActivityList";
import { loadSecurityNames } from "@/lib/securities";
import type { Database } from "@/lib/supabase/database.types";

type Mode = Database["public"]["Tables"]["holdings"]["Row"]["mode"];

/**
 * 활동 피드 — activity 페이지의 무거운 부분(계좌·이벤트 조회 + 이름).
 * Suspense 경계로 분리해 헤더·타임라인(portfolio 기반)이 이걸 기다리지 않게 한다.
 */
export async function ActivityFeed({
  holdingId,
  mode,
}: {
  holdingId: string;
  mode: Mode;
}) {
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holdingId);
  const accountIds = (accounts ?? []).map((a) => a.id);

  // 사용 컬럼만 명시(전송량↓). ActivityItem 매핑·상태판정이 쓰는 컬럼만.
  const { data: rows } = accountIds.length
    ? await supabase
        .from("events")
        .select(
          "id, type, symbol, quantity, price_or_amount, fee_and_tax, date, currency, fx_rate, to_currency, to_amount, source, deleted_at, reverses_event_id",
        )
        .in("account_id", accountIds)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };

  const all = rows ?? [];
  // 상쇄당한 원본 id 집합
  const reversedIds = new Set(
    all
      .filter((r) => r.reverses_event_id && !r.deleted_at)
      .map((r) => r.reverses_event_id as string),
  );

  const items: ActivityItem[] = all.map((r) => ({
    id: r.id,
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
    source: r.source,
    status: r.deleted_at
      ? "deleted"
      : r.reverses_event_id
        ? "reversal"
        : reversedIds.has(r.id)
          ? "reversed"
          : "active",
  }));

  // 종목명(검색으로 산 종목 포함) — 코드 대신 이름 표시용
  const names = await loadSecurityNames(
    supabase,
    all.map((r) => r.symbol).filter((s): s is string => !!s),
  );

  return (
    <ActivityList items={items} names={names} mode={mode} today={todayKST()} />
  );
}
