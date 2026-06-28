import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { fetchKrxEtfTers } from "@/lib/finance/krxEtf";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { EtfPortfolioHeader } from "@/components/etf/EtfPortfolioHeader";
import { EtfHoldingRow } from "@/components/etf/EtfHoldingRow";
import { EtfChartStreamed } from "@/components/etf/EtfChartStreamed";

export default async function EtfPortfolioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const data = computeDashboard(portfolio, "KRW");
  const secMeta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );

  const etfAllocations = data.allocation.filter(
    (a) => secMeta[a.symbol]?.assetType === "ETF",
  );

  const terMap =
    etfAllocations.length > 0
      ? await fetchKrxEtfTers(
          etfAllocations.map((a) => a.symbol),
          supabase,
        )
      : new Map<string, number>();

  const totalEtfValue = etfAllocations.reduce((s, a) => s + a.value, 0);

  const etfSlices = etfAllocations.map((a) => ({
    symbol: a.symbol,
    name: secMeta[a.symbol]?.name ?? a.name,
    value: a.value,
    etfWeight: totalEtfValue > 0 ? a.value / totalEtfValue : 0,
    ter: terMap.get(a.symbol) ?? null,
  }));

  // 가중평균 TER (ETF 평가액 가중)
  let weightedAvgTer: number | null = null;
  {
    let wSum = 0;
    let terSum = 0;
    for (const s of etfSlices) {
      if (s.ter !== null) {
        wSum += s.value;
        terSum += s.value * s.ter;
      }
    }
    if (wSum > 0) weightedAvgTer = terSum / wSum;
  }

  const annualCost =
    weightedAvgTer !== null ? totalEtfValue * weightedAvgTer : null;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          ETF 포트폴리오
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          보유 ETF 현황 및 비용 분석
        </p>
      </div>

      {etfSlices.length === 0 ? (
        <div className="rounded-2xl bg-secondary p-5">
          <p className="text-sm font-semibold text-muted-foreground">
            보유 중인 ETF가 없습니다
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ETF를 매수하면 여기서 비용과 섹터 배분을 분석할 수 있어요
          </p>
        </div>
      ) : (
        <>
          <EtfPortfolioHeader
            totalEtfValue={totalEtfValue}
            weightedAvgTer={weightedAvgTer}
            annualCost={annualCost}
          />

          <section className="rounded-2xl bg-card shadow-card">
            {etfSlices.map((s, i) => (
              <EtfHoldingRow
                key={s.symbol}
                {...s}
                isLast={i === etfSlices.length - 1}
              />
            ))}
          </section>

          <Suspense fallback={<ChartSkeleton />}>
            <EtfChartStreamed
              etfSlices={etfSlices}
              totalEtfValue={totalEtfValue}
            />
          </Suspense>
        </>
      )}
    </main>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="mb-5 h-8 w-full animate-pulse rounded-xl bg-secondary" />
      <div className="mx-auto h-44 w-44 animate-pulse rounded-full bg-secondary" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-4 w-full animate-pulse rounded bg-secondary" />
        ))}
      </div>
    </div>
  );
}
