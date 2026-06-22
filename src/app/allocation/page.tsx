import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeDashboard } from "@/lib/dashboard";
import type { AllocationSlice } from "@/lib/dashboard";
import { getPortfolio } from "@/lib/portfolio";
import { loadSecurityMeta, backfillSectors } from "@/lib/securities";
import { groupByTag, groupAllocationByType } from "@/lib/allocation";
import { getPrices } from "@/lib/finance/prices";
import { LEGENDS } from "@/lib/finance/legends";
import type { Currency } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { BreakdownCard } from "@/components/dashboard/BreakdownCard";
import { LegendExplorer } from "@/components/benchmark/LegendExplorer";

type SecurityMeta = Awaited<ReturnType<typeof loadSecurityMeta>>;

/** 자산배분 상세 — 종목별·국가별·유형별 비중 + 거장 포트폴리오(13F) 비교. */
export default async function AllocationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, cookieStore] = await Promise.all([
    getPortfolio(supabase),
    cookies(),
  ]);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);

  // 주요 비중 카드(유형·국가·슬리브)는 보유 메타 1쿼리면 충분 — 즉시 렌더.
  // 섹터(공시 백필)·거장 13F(야후 다수)는 무겁고 포트폴리오와 무관 → 아래에서 스트리밍.
  const symbols = data.allocation.map((a) => a.symbol);
  const meta = await loadSecurityMeta(supabase, symbols);

  const byCountry = groupByTag(data.allocation, meta, data.cash, "country");
  const byType = groupByTag(data.allocation, meta, data.cash, "assetType");

  // 유형 슬리브(주식/ETF/원자재/코인) — 각 유형 안에서 비중을 100%로 정규화.
  const sleeves = groupAllocationByType(data.allocation, meta).map((g) => {
    const sleeveValue = g.slices.reduce((s, a) => s + a.value, 0);
    return {
      type: g.type,
      slices: g.slices.map((a) => ({
        label: a.name,
        value: a.value,
        weight: sleeveValue > 0 ? a.value / sleeveValue : 0, // 유형 내 100%
      })),
    };
  });

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">자산배분</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          종목·국가·유형별로 내 자산이 어떻게 나뉘어 있는지 봅니다.
        </p>
      </div>

      {!data.priceAvailable || data.allocation.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">
            {data.priceAvailable
              ? "보유 종목이 없습니다."
              : "시세 갱신 필요 — 잠시 후 다시 시도하세요."}
          </p>
          {data.priceAvailable && data.allocation.length === 0 && (
            <Link
              href="/transactions?type=BUY"
              className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.99]"
            >
              첫 매수 기록하기
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* 유형 개요 — 전체 대비 유형 비중(1단계) */}
          <BreakdownCard
            title="유형별"
            slices={byType}
            currency={data.currency}
            href="/allocation/type"
          />
          {/* 유형별 구성 — 각 유형 안에서 종목 비중 100%(2단계). 도넛 상세로 이동. */}
          {sleeves.map((s) => (
            <BreakdownCard
              key={s.type}
              title={`${s.type} 구성`}
              slices={s.slices}
              currency={data.currency}
              href={`/allocation/sleeve/${encodeURIComponent(s.type)}`}
            />
          ))}
          {/* 국가별 */}
          <BreakdownCard
            title="국가별"
            slices={byCountry}
            currency={data.currency}
            href="/allocation/country"
          />
          {/* 산업별 — 섹터 백필(공시 API)이 무거워 별도 스트리밍. 섹터를 못 알아내면 미표시. */}
          <Suspense fallback={null}>
            <SectorBreakdownStreamed
              supabase={supabase}
              allocation={data.allocation}
              cash={data.cash}
              meta={meta}
              currency={data.currency}
            />
          </Suspense>
          <p className="px-1 text-xs text-muted-foreground">
            유형별은 전체 대비, 그 아래 ‘○○ 구성’은 각 유형 안에서 100% 기준입니다.
            국가·산업은 종목당 대표 태그 1개 기준입니다(현금·코인·원자재는 산업 제외).
          </p>
        </>
      )}

      {/* 거장 포트폴리오(13F) — 거장 보유 전 종목 시세(야후 다수)라 무거워 별도 스트리밍. */}
      <Suspense fallback={<LegendSkeleton />}>
        <LegendExplorerStreamed positions={portfolio.positions} />
      </Suspense>
    </main>
  );
}

/**
 * 산업별 비중 — 섹터 미적재분을 공시 API로 백필(첫 진입만 비용) 후 그룹화.
 * 알아낸 섹터가 하나도 없으면 null(카드 미표시).
 */
async function SectorBreakdownStreamed({
  supabase,
  allocation,
  cash,
  meta,
  currency,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  allocation: AllocationSlice[];
  cash: number;
  meta: SecurityMeta;
  currency: Currency;
}) {
  const filled = await backfillSectors(supabase, meta);
  // prop(meta) 직접 변형 금지 — 백필 결과를 입힌 로컬 사본을 만든다.
  const merged: SecurityMeta = { ...meta };
  for (const [s, sec] of Object.entries(filled)) {
    if (merged[s]) merged[s] = { ...merged[s], sector: sec };
  }

  const bySector = groupByTag(allocation, merged, cash, "sector");
  const hasSector = bySector.some((s) => s.label !== "미분류");
  if (!hasSector) return null;

  return (
    <BreakdownCard
      title="산업별"
      slices={bySector}
      currency={currency}
      href="/allocation/sector"
    />
  );
}

/** 거장 포트폴리오(13F) — 거장 보유 종목 시세를 받아 비교 카드 렌더. */
async function LegendExplorerStreamed({
  positions,
}: {
  positions: Record<string, number>;
}) {
  const tickers = [
    ...new Set(LEGENDS.flatMap((l) => l.holdings.map((h) => h.ticker))),
  ];
  const { prices, currencies } = await getPrices(tickers);
  const held = Object.keys(positions).filter((s) => positions[s] > 0);
  return <LegendExplorer prices={prices} currencies={currencies} held={held} />;
}

/** 거장 카드 로딩 스켈레톤. */
function LegendSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-24 w-full animate-pulse rounded bg-secondary" />
    </div>
  );
}
