import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta, backfillSectors } from "@/lib/securities";
import { groupByTag, groupAllocationByType } from "@/lib/allocation";
import { getPrices } from "@/lib/finance/prices";
import { LEGENDS } from "@/lib/finance/legends";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { BreakdownCard } from "@/components/dashboard/BreakdownCard";
import { LegendExplorer } from "@/components/benchmark/LegendExplorer";

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

  const symbols = data.allocation.map((a) => a.symbol);
  const tickers = [
    ...new Set(LEGENDS.flatMap((l) => l.holdings.map((h) => h.ticker))),
  ];
  const [meta, legendPrices] = await Promise.all([
    loadSecurityMeta(supabase, symbols),
    getPrices(tickers),
  ]);
  // 섹터 미적재분을 공시 API로 채움(멱등·캐시 — 첫 진입만 비용). 채운 값은 이번 렌더에 반영.
  const filled = await backfillSectors(supabase, meta);
  for (const [s, sec] of Object.entries(filled)) if (meta[s]) meta[s].sector = sec;

  const byCountry = groupByTag(data.allocation, meta, data.cash, "country");
  const byType = groupByTag(data.allocation, meta, data.cash, "assetType");
  const bySector = groupByTag(data.allocation, meta, data.cash, "sector");
  // 섹터를 하나라도 알아냈을 때만 산업별 카드 노출(전부 미분류면 의미 없음).
  const hasSector = bySector.some((s) => s.label !== "미분류");

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

  // 거장 포트폴리오(13F) — 자산배분 맥락에서 "거장은 어떻게 나눴나" 비교. /benchmark 에서 이동.
  const { prices, currencies } = legendPrices;
  const held = Object.keys(portfolio.positions).filter(
    (s) => portfolio.positions[s] > 0,
  );

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
          {/* 산업별 — 섹터를 알아낸 경우만(반도체·금융 등 쏠림 렌즈) */}
          {hasSector && (
            <BreakdownCard
              title="산업별"
              slices={bySector}
              currency={data.currency}
              href="/allocation/sector"
            />
          )}
          <p className="px-1 text-xs text-muted-foreground">
            유형별은 전체 대비, 그 아래 ‘○○ 구성’은 각 유형 안에서 100% 기준입니다.
            국가·산업은 종목당 대표 태그 1개 기준입니다(현금·코인·원자재는 산업 제외).
          </p>
        </>
      )}

      {/* 거장 포트폴리오(13F) — 거장은 어떻게 배분했나(수익률 아닌 보유구성 비교). */}
      <LegendExplorer prices={prices} currencies={currencies} held={held} />
    </main>
  );
}
