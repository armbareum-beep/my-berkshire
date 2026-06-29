import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeDashboard } from "@/lib/dashboard";
import type { AllocationSlice } from "@/lib/dashboard";
import { getPortfolio } from "@/lib/portfolio";
import { loadSecurityMeta, backfillSectors } from "@/lib/securities";
import { groupByTag, groupAllocationByType, groupTypeByCountry } from "@/lib/allocation";
import type { Currency } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { BreakdownCard } from "@/components/dashboard/BreakdownCard";

type SecurityMeta = Awaited<ReturnType<typeof loadSecurityMeta>>;

/** 자산배분 상세 — 종목별·국가별·유형별 비중. */
export default async function AllocationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [portfolio, cookieStore] = await Promise.all([getPortfolio(supabase), cookies()]);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);

  const symbols = data.allocation.map((a) => a.symbol);
  const meta = await loadSecurityMeta(supabase, symbols);

  const byCountry = groupByTag(data.allocation, meta, data.cash, "country");
  const byType = groupByTag(data.allocation, meta, data.cash, "assetType");

  // 유형 슬리브(주식/ETF/원자재/코인) — 각 유형 안에서 비중을 100%로 정규화.
  const typeGroups = groupAllocationByType(data.allocation, meta);
  const sleeves = typeGroups.map((g) => {
    const sleeveValue = g.slices.reduce((s, a) => s + a.value, 0);
    return {
      type: g.type,
      slices: g.slices.map((a) => ({
        label: a.name,
        value: a.value,
        weight: sleeveValue > 0 ? a.value / sleeveValue : 0,
      })),
    };
  });

  // 주식 유형 → 국가별 서브카드 (한국 주식 구성 / 미국 주식 구성 / ...)
  const stockByCountry = groupTypeByCountry(data.allocation, meta, "주식");

  // ETF 유형 → 기초자산 국가별 비중 (미국 ETF 60% / 중국 ETF 30% ...)
  const etfSlices = data.allocation.filter((a) => meta[a.symbol]?.assetType === "ETF");
  const etfByCountry = groupByTag(etfSlices, meta, 0, "country");

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
          {/* 유형별 구성 — 주식은 국가별 서브카드, 나머지는 기존대로. */}
          {sleeves.map((s) => {
            if (s.type === "주식") {
              // 주식: 국가별 카드로 분리 (한국 주식 구성 / 미국 주식 구성 / ...)
              return stockByCountry.map((g) => {
                const gValue = g.slices.reduce((sum, a) => sum + a.value, 0);
                return (
                  <BreakdownCard
                    key={`주식-${g.type}`}
                    title={`${g.type} 주식 구성`}
                    slices={g.slices.map((a) => ({
                      label: a.name,
                      value: a.value,
                      weight: gValue > 0 ? a.value / gValue : 0,
                    }))}
                    currency={data.currency}
                    href={`/allocation/sleeve/${encodeURIComponent("주식")}?country=${encodeURIComponent(g.type)}`}
                  />
                );
              });
            }
            if (s.type === "ETF") {
              // ETF: 국가별 비중 카드 + 종목 구성 카드
              return (
                <>
                  {etfByCountry.length > 0 && (
                    <BreakdownCard
                      key="ETF-국가별"
                      title="ETF 국가별"
                      slices={etfByCountry}
                      currency={data.currency}
                      href="/allocation/country"
                    />
                  )}
                  <BreakdownCard
                    key="ETF-구성"
                    title="ETF 구성"
                    slices={s.slices}
                    currency={data.currency}
                    href={`/allocation/sleeve/${encodeURIComponent("ETF")}`}
                  />
                </>
              );
            }
            return (
              <BreakdownCard
                key={s.type}
                title={`${s.type} 구성`}
                slices={s.slices}
                currency={data.currency}
                href={`/allocation/sleeve/${encodeURIComponent(s.type)}`}
              />
            );
          })}
          {/* 국가별 (전체) */}
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

