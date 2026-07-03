import Link from "next/link";
import { PieChart } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { companyCashPools } from "@/lib/finance/valuation";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { CashBreakdown } from "@/components/dashboard/CashBreakdown";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { EmptyState } from "@/components/ui/EmptyState";
import { money, pct } from "@/lib/format";

/** 종목별 자산배분 상세 — 도넛 + 종목 목록(현금 포함). /allocation 에서 이동. */
export default async function StockAllocationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    (await cookies()).get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  // 현금 행 안에서 통화별(₩/$) 잔액을 보여주기 위한 풀(네이티브 금액).
  const cashPools = companyCashPools(
    portfolio.events,
    Number(portfolio.holding.initial_valuation),
  );

  // 종목(개별주식만, +현금) — 전체 자산 대비 비중. ETF·원자재·코인은 섞지 않음(유형별에서).
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );
  const items = [
    ...data.allocation
      .filter((a) => (meta[a.symbol]?.assetType ?? "주식") === "주식")
      .map((a) => ({
        label: a.name,
        symbol: a.symbol as string | undefined,
        value: a.value,
        weight: a.weight,
      })),
    ...(data.cash > 0
      ? [{ label: "현금", symbol: undefined, value: data.cash, weight: data.cashWeight ?? 0 }]
      : []),
  ].sort((a, b) => b.value - a.value);

  // 도넛: 상위 8 + 기타(조각 과밀 방지). 목록은 전체 표시.
  const top = items.slice(0, 8);
  const rest = items.slice(8);
  const restWeight = rest.reduce((s, x) => s + x.weight, 0);
  const restValue = rest.reduce((s, x) => s + x.value, 0);
  const slices = [
    ...top.map((x) => ({ label: x.label, weight: x.weight, value: x.value })),
    ...(restWeight > 0.001
      ? [{ label: "기타", weight: restWeight, value: restValue }]
      : []),
  ];

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <h1 className="text-2xl font-extrabold tracking-tight">
        종목별 자산배분
      </h1>

      {!data.priceAvailable ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            시세 갱신 필요 — 잠시 후 다시 시도하세요.
          </p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PieChart}
          title="보유 종목이 없어요"
          description="종목을 매수하면 자산배분이 여기 나타나요"
        />
      ) : (
        <>
          {/* 도넛 + 범례 */}
          <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
            <Donut slices={slices} currency={data.currency} />
            <ul className="flex flex-1 flex-col gap-2">
              {slices.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: donutColor(i) }}
                  />
                  <span className="truncate font-medium">{s.label}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {pct(s.weight)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 종목별 목표비중·리밸런싱 */}
          <Link
            href="/rebalance"
            className="flex items-center justify-between rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
          >
            <span className="text-sm font-semibold">
              종목별 목표비중 · 리밸런싱
            </span>
            <span className="text-muted-foreground">›</span>
          </Link>

          {/* 전체 종목 목록 */}
          <section className="rounded-2xl bg-card p-5 shadow-card">
            <ul className="flex flex-col gap-2">
              {items.map((it) => (
                <li key={it.label} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <SymbolAvatar name={it.label} symbol={it.symbol} />
                    <span className="flex flex-col">
                      <span className="font-bold">{it.label}</span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {pct(it.weight)}
                      </span>
                    </span>
                    <span className="ml-auto font-semibold tabular-nums">
                      {money(it.value, data.currency)}
                    </span>
                  </div>
                  {/* 현금 행은 통화별(₩/$) 잔액으로 펼침 */}
                  {it.label === "현금" && (
                    <div className="border-t border-border pl-1 pt-3">
                      <CashBreakdown pools={cashPools} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
