import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/date";
import {
  ActivityList,
  type ActivityItem,
} from "@/components/transactions/ActivityList";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { TimelineCard } from "@/components/dashboard/cards";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityNames } from "@/lib/securities";

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");
  const holding = portfolio.holding;
  const timeline = computeDashboard(portfolio).timeline;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id);
  const accountIds = (accounts ?? []).map((a) => a.id);

  const { data: rows } = accountIds.length
    ? await supabase
        .from("events")
        .select("*")
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
    <main className="flex min-h-dvh flex-col gap-5 p-6 pb-28">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">회사 연혁</h1>
        <Link
          href="/transactions"
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          거래 기록
        </Link>
      </header>
      {timeline.length > 0 && <TimelineCard timeline={timeline} />}
      <ActivityList
        items={items}
        names={names}
        mode={holding.mode}
        today={todayKST()}
      />
      <BottomTabBar />
    </main>
  );
}
