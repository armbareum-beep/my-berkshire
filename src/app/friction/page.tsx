import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio, activeEventRows } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import {
  computeFrictionAnalysis,
  type FrictionEvent,
} from "@/lib/finance/friction";
import { findCatalogItem } from "@/lib/finance/catalog";
import { computeTaxCreditSummaries } from "@/lib/config/tax";
import type { AccountType } from "@/lib/config/tax";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { FrictionView } from "@/components/friction/FrictionView";

export default async function FrictionPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, cookieStore] = await Promise.all([getPortfolio(supabase), cookies()]);
  if (!portfolio) redirect("/onboarding");
  const today = todayKST();
  const data = computeDashboard(portfolio, "KRW");
  const displayCcy = cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, account_type")
    .eq("holding_id", portfolio.holding.id);
  const accountList = accounts ?? [];
  const { data: eventRows } = accountList.length
    ? await supabase
        .from("events")
        .select("*")
        .in("account_id", accountList.map((account) => account.id))
    : { data: [] };
  const accountNames = new Map(accountList.map((account) => [account.id, account.name]));
  const events: FrictionEvent[] = activeEventRows(eventRows ?? []).map((row) => ({
    type: row.type,
    date: row.date,
    feeAndTax: Number(row.fee_and_tax),
    priceOrAmount: Number(row.price_or_amount),
    quantity: row.quantity == null ? null : Number(row.quantity),
    accountId: row.account_id,
    accountName: accountNames.get(row.account_id) ?? "계좌",
  }));

  const terHoldings = data.allocation.flatMap((allocation) => {
    const catalog = findCatalogItem(allocation.symbol);
    if (catalog?.ter == null) return [];
    const firstBuyDate = portfolio.events
      .filter((event) => event.type === "BUY" && event.symbol === allocation.symbol)
      .reduce<string | null>(
        (earliest, event) =>
          earliest == null || event.date < earliest ? event.date : earliest,
        null,
      );
    if (!firstBuyDate) return [];
    return [{
      symbol: allocation.symbol,
      name: allocation.name,
      value: allocation.value,
      ter: catalog.ter,
      firstBuyDate,
    }];
  });
  const analysis = computeFrictionAnalysis({
    events,
    terHoldings,
    initialValuation: Number(portfolio.holding.initial_valuation),
    foundedAt: portfolio.holding.founded_at,
    today,
  });

  // 세액공제 트래킹: 계좌유형별 올해 DEPOSIT 합산
  const currentYear = today.slice(0, 4);
  const depositByType: Partial<Record<AccountType, number>> = {};
  for (const event of events) {
    if (event.type !== "DEPOSIT") continue;
    if (!event.date.startsWith(currentYear)) continue;
    const account = accountList.find((a) => a.id === event.accountId);
    if (!account?.account_type) continue;
    const t = account.account_type as AccountType;
    depositByType[t] = (depositByType[t] ?? 0) + event.priceOrAmount;
  }
  const taxCreditSummaries = computeTaxCreditSummaries(depositByType, currentYear);
  const { year: yearParam } = await searchParams;
  const requestedYear = yearParam ? Number(yearParam) : null;
  const selectedYear = analysis.yearly.some((row) => row.year === requestedYear)
    ? requestedYear
    : null;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">마찰비용</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          거래와 보유 과정에서 복리를 깎은 비용을 봅니다.
        </p>
      </div>
      <FrictionView
        analysis={analysis}
        factor={factor}
        currency={useUsd ? "USD" : "KRW"}
        selectedYear={selectedYear}
        taxCreditSummaries={taxCreditSummaries}
      />
    </main>
  );
}
