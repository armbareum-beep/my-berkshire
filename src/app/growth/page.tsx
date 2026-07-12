import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ReceiptText } from "lucide-react";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadDrawdownEpisodes } from "@/lib/drawdownEpisodes";
import { drawdownMilestones } from "@/lib/finance/milestones";
import { computeStyle } from "@/lib/style";
import { companyTier } from "@/lib/finance/companyTier";
import { parsePlan, planProgress } from "@/lib/plan";
import { loadLiabilities } from "@/lib/liabilities";
import { totalLiabilities } from "@/lib/finance/liabilities";
import { loadSecurityMeta } from "@/lib/securities";
import { fetchKrxEtfTers } from "@/lib/finance/krxEtf";
import { loadDismissed } from "@/lib/finance/homeSignal";
import { saveStyleSnapshot, toStyleHistorySnapshot } from "@/lib/styleHistory";
import {
  quartersBetween,
  reviewedQuarters,
  reportStreak,
} from "@/lib/finance/quarterClose";
import { annualReportEligibility } from "@/lib/finance/annualReport";
import { computeLookThrough } from "@/lib/finance/lookThrough";
import { getOrComputeSnapshot } from "@/lib/calculationSnapshots";
import type { AllocationSlice } from "@/lib/dashboard";
import { todayKST } from "@/lib/date";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { StyleCard } from "@/components/dashboard/StyleCard";
import { LookThroughCard } from "@/components/dashboard/LookThroughCard";
import { TimelineCard } from "@/components/dashboard/cards";
import { CompanyTierCard } from "@/components/growth/CompanyTierCard";
import { CompoundingStreakCard } from "@/components/growth/CompoundingStreakCard";
import { EtfSnapshotCard } from "@/components/growth/EtfSnapshotCard";
import { EtfChartStreamed } from "@/components/etf/EtfChartStreamed";
import { ChartSkeleton } from "@/components/etf/ChartSkeleton";
import { LockedCard } from "@/components/growth/LockedCard";

/**
 * 성장 허브 — 경쟁이 아니라 *내 지주회사가 자라는* 싱글플레이.
 * 정직한 신호(납입 규모·규율·시간·서사)만. 시세 결과는 축하하지 않는다(헌법 II).
 * 카드 대부분은 홈/연혁에서 쓰던 엔진 결과를 재배치한 뷰.
 */
export default async function GrowthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const { holding } = portfolio;
  const today = todayKST();
  const data = computeDashboard(portfolio, "KRW");

  const [liabilities, secMeta, dismissed, drawdownEpisodes] = await Promise.all([
    loadLiabilities(supabase, holding.id),
    loadSecurityMeta(
      supabase,
      data.allocation.map((a) => a.symbol),
    ),
    loadDismissed(supabase, holding.id),
    loadDrawdownEpisodes({
      supabase,
      holdingId: holding.id,
      portfolioRevision: holding.portfolio_revision,
      foundedAt: holding.founded_at,
      initialValuation: Number(holding.initial_valuation),
      events: portfolio.events,
      today,
    }),
  ]);
  // 드로다운 통과는 비동기 가격 시리즈가 필요해 computeDashboard(동기) 밖에서 merge.
  const timeline = [...data.timeline, ...drawdownMilestones(drawdownEpisodes)].sort(
    (a, b) => (a.date < b.date ? -1 : 1),
  );

  // ETF vs 개별주 분류
  const etfAllocations = data.allocation.filter(
    (a) => secMeta[a.symbol]?.assetType === "ETF",
  );
  const hasEtf = etfAllocations.length > 0;
  const hasStock = data.allocation.some(
    (a) => secMeta[a.symbol]?.assetType !== "ETF",
  );

  // TER 조회 (ETF 보유 시만, 한국 ETF 6자리 코드 대상)
  const terMap = hasEtf
    ? await fetchKrxEtfTers(
        etfAllocations.map((a) => a.symbol),
        supabase,
      )
    : new Map<string, number>();

  // ETF 슬라이스 + 가중평균 TER 계산
  // value/etfWeight는 배분 차트(EtfChartStreamed) 입력, weight/ter는 EtfSnapshotCard 입력.
  const totalEtfValue = etfAllocations.reduce((s, a) => s + a.value, 0);
  const etfSlices = etfAllocations.map((a) => ({
    symbol: a.symbol,
    name: secMeta[a.symbol]?.name ?? a.name,
    weight: a.weight,
    value: a.value,
    etfWeight: totalEtfValue > 0 ? a.value / totalEtfValue : 0,
    ter: terMap.get(a.symbol) ?? null,
  }));
  let weightedAvgTer: number | null = null;
  {
    let terWeightSum = 0;
    let terSum = 0;
    for (const s of etfSlices) {
      if (s.ter !== null) {
        terWeightSum += s.weight;
        terSum += s.weight * s.ter;
      }
    }
    if (terWeightSum > 0) weightedAvgTer = terSum / terWeightSum;
  }

  // 규율 점수 입력: 부채(레버리지) + 자본배분 계획 준수율
  const plan = parsePlan(holding.active_plan);
  const planProg = plan ? planProgress(plan, portfolio.events) : null;
  const planRatio =
    planProg && planProg.total > 0 ? planProg.doneCount / planProg.total : null;

  const style = computeStyle(
    portfolio,
    data,
    totalLiabilities(liabilities),
    planRatio,
    secMeta,
  );
  // /style 과 동일 배선 — 방문만으로 스냅샷이 쌓여 분기 경계에 갇히지 않고 등급 변화가 더 자주 기록된다.
  if (!style.insufficient) {
    const snapshot = toStyleHistorySnapshot(style, today);
    after(() =>
      saveStyleSnapshot(
        supabase,
        holding.id,
        holding.portfolio_revision,
        snapshot,
      ),
    );
  }

  // 기업 등급 — 납입 원금 + 운용기간(가장 오래된 이벤트 날짜 기준) 이중 게이트.
  const earliestDate =
    portfolio.events.length > 0
      ? portfolio.events.reduce((min, e) => (e.date < min ? e.date : min), portfolio.events[0].date)
      : today;
  const [ey, em] = earliestDate.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const monthsActive = Math.max(0, (ty - ey) * 12 + (tm - em));
  const tier = companyTier(data.invested, monthsActive);

  // 분기 결산 스트릭 + 연차보고서 발행 여부
  const reportStreakN = reportStreak(
    quartersBetween(holding.founded_at, today).map((q) => q.label),
    reviewedQuarters(dismissed),
  );
  const annual = annualReportEligibility(holding.founded_at, today);

  // ETF 배분 도넛(/etf-portfolio 와 동일 차트) — 내 지분 실적 카드 하단에 삽입.
  const etfChart = hasEtf ? (
    <Suspense fallback={<ChartSkeleton embedded />}>
      <EtfChartStreamed
        etfSlices={etfSlices}
        totalEtfValue={totalEtfValue}
        embedded
      />
    </Suspense>
  ) : null;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">마이 버크셔</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          내 지주회사가 자라는 기록 · 규율과 시간으로
        </p>
      </div>

      {/* 기업 등급(헤드라인) */}
      <CompanyTierCard tier={tier} invested={data.invested} monthsActive={monthsActive} />

      {/* 복리 무중단 — 이미 계산된 data.compoundingStreak를 그대로 노출(새 계산 없음). */}
      <CompoundingStreakCard streak={data.compoundingStreak} />

      {/* 내 지분 실적(현재 투시 펀더멘털) + ETF 배분 차트 — 개별주 없으면 잠금(차트는 별도 표시) */}
      {hasStock ? (
        <Suspense fallback={<GrowthCardSkeleton />}>
          <BusinessSnapshotStreamed
            supabase={supabase}
            enabled={data.priceAvailable && data.allocation.length > 0}
            allocation={data.allocation}
            invested={data.invested}
            holdingId={holding.id}
            portfolioRevision={holding.portfolio_revision}
            asOfDate={today}
            year={Number(today.slice(0, 4))}
            chart={etfChart}
          />
        </Suspense>
      ) : (
        <>
          {hasEtf && (
            <Suspense fallback={<ChartSkeleton />}>
              <EtfChartStreamed
                etfSlices={etfSlices}
                totalEtfValue={totalEtfValue}
              />
            </Suspense>
          )}
          <LockedCard
            title="🏭 내 지분 실적"
            description="개별주를 보유하면 열립니다"
          />
        </>
      )}

      {/* ETF 포트폴리오 현황 — ETF 없으면 잠금 */}
      {hasEtf ? (
        <EtfSnapshotCard slices={etfSlices} weightedAvgTer={weightedAvgTer} />
      ) : (
        <LockedCard
          title="📦 ETF 포트폴리오"
          description="ETF를 보유하면 열립니다"
          href="/etf-portfolio"
        />
      )}

      {/* 규율 점수 */}
      <StyleCard style={style} />

      {/* 분기/연차 리포트 + 결산 스트릭 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <Link
          href="/report"
          scroll={false}
          className="block transition active:opacity-70"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <ReceiptText size={15} className="text-muted-foreground" /> 분기 경영 리포트
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                이번 분기 수익률·활동·배당 한눈에
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              {reportStreakN > 0 && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                  🔥 {reportStreakN}
                </span>
              )}
              <span className="text-muted-foreground">›</span>
            </span>
          </div>
        </Link>
        <Link
          href="/annual-report"
          className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-semibold transition active:opacity-70"
        >
          <span>ENUF Annual Report</span>
          <span className="text-xs text-muted-foreground">
            {annual.eligible
              ? `${today.slice(0, 4)} 발행됨 ›`
              : `D-${annual.remainingDays} · 준비 중 ›`}
          </span>
        </Link>
      </section>

      {/* 마일스톤 타임라인(설립·첫 매수·첫 해외 인수·첫 배당·납입 자본 돌파·드로다운 통과) */}
      {timeline.length > 0 && <TimelineCard timeline={timeline} />}
    </main>
  );
}

/**
 * 내 지분 실적 — 현재 투시 펀더멘털(연결 순이익·PER/PBR/ROE). DART N+1 으로 무거워 스트리밍.
 * 홈에서 이전. /lookthrough 의 `lookthrough-current` 스냅샷과 동일 캐시 키로 공유.
 * ₩ 기준(마이 버크셔 허브는 단일 통화).
 */
async function BusinessSnapshotStreamed({
  supabase,
  enabled,
  allocation,
  invested,
  holdingId,
  portfolioRevision,
  asOfDate,
  year,
  chart,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  enabled: boolean;
  allocation: AllocationSlice[];
  invested: number;
  holdingId: string;
  portfolioRevision: number;
  asOfDate: string;
  year: number;
  /** 카드 하단에 붙는 ETF 배분 차트(없으면 생략). */
  chart?: ReactNode;
}) {
  const lt = enabled
    ? (
        await getOrComputeSnapshot({
          supabase,
          holdingId,
          kind: "lookthrough-current",
          portfolioRevision,
          asOfDate,
          ttlMs: 5 * 60 * 1000,
          compute: () =>
            computeLookThrough(supabase, { allocation, year, invested }),
        })
      ).data
    : null;

  if (lt && lt.coverage.includedCount > 0) {
    return (
      <LookThroughCard
        netIncome={lt.netIncome}
        per={lt.per}
        pbr={lt.pbr}
        roe={lt.roe}
        factor={1}
        currency="KRW"
        chart={chart}
      />
    );
  }
  // 반영할 공시가 없을 때 — /lookthrough 정적 링크(+ ETF 배분 차트).
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <Link
        href="/lookthrough"
        className="block transition active:opacity-70"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">🏭 내 지분 실적</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              보유 회사들의 투시 펀더멘털 — 지분만큼 내 몫
            </p>
          </div>
          <span className="text-muted-foreground">›</span>
        </div>
      </Link>
      {chart && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            ETF 배분
          </p>
          {chart}
        </div>
      )}
    </div>
  );
}

function GrowthCardSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-7 w-36 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-3 w-24 animate-pulse rounded bg-secondary" />
    </div>
  );
}
