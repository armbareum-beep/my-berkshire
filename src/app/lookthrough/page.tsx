import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { InvestmentEvent } from "@/lib/finance/valuation";
import { computeDashboard } from "@/lib/dashboard";
import { getPortfolio } from "@/lib/portfolio";
import {
  computeLookThrough,
  computeLookThroughSeries,
  type LookThroughLeg,
} from "@/lib/finance/lookThrough";
import { computePortfolioFlags } from "@/lib/finance/fundamentalFlags";
import { getDailyKrwCloses } from "@/lib/finance/prices";
import { todayKST } from "@/lib/date";
import { moneyCompact, pct, changeColor, type Currency } from "@/lib/format";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { LookThroughTrend } from "@/components/lookthrough/LookThroughTrend";
import { CompanyMetricsTable } from "@/components/lookthrough/CompanyMetricsTable";
import { PortfolioFlags } from "@/components/lookthrough/PortfolioFlags";
import { CountUp } from "@/components/ui/CountUp";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { getOrComputeSnapshot } from "@/lib/calculationSnapshots";
import { getPortfolioDisclosureFeed } from "@/lib/finance/disclosureFeed";
import { loadDismissed } from "@/lib/finance/homeSignal";
import { DisclosureFeed } from "@/components/disclosures/DisclosureFeed";

/**
 * 투시 펀더멘털 — 내 지주회사를 "사업부(자회사)들의 연결 실적"으로(PRD §8-2).
 * 화면 구조: 회사명 → 사업부별 기여(내 몫·비중) → 연결 합계(손익·지표·재무상태·현금흐름).
 * 한국 주식만 지분가중 합산. 나머지 보유는 사유와 함께 노출(숨김 없음).
 * 계산은 ₩(펀더멘털이 ₩), 표시통화 토글(KRW/USD)은 표시 단계에서만 환율 변환(비율은 통화 무관).
 */
/**
 * 투시 펀더멘털 본문 — 페이지 크롬 없이 내용만.
 * 전체 페이지(`/lookthrough`)와 바텀시트(`@sheet/(.)lookthrough`)가 공유.
 */
export async function LookThroughContent({ basis }: { basis: "ttm" | "fy" }) {
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

  const today = todayKST();
  // 계산은 항상 ₩(펀더멘털이 ₩). 표시통화는 토글에 따라 변환.
  const data = computeDashboard(portfolio, "KRW");

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const useUsd = displayCcy === "USD" && !!portfolio.usdKrw;
  const factor = useUsd ? 1 / (portfolio.usdKrw as number) : 1;
  const cur: Currency = useUsd ? "USD" : "KRW";

  return (
    <>
      {/* 회사 = 사업부들의 연결 */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground">
          투시 펀더멘털 · 연결 실적
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight">
          {portfolio.holding.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          내가 소유한 사업체들의 진짜 실적
        </p>
      </div>

      <Suspense fallback={null}>
        <LookThroughBodyStreamed
          supabase={supabase}
          portfolio={portfolio}
          data={data}
          today={today}
          factor={factor}
          currency={cur}
          basis={basis}
        />
      </Suspense>
    </>
  );
}

export default async function LookThroughPage({
  searchParams,
}: {
  searchParams: Promise<{ basis?: string }>;
}) {
  const query = await searchParams;
  const basis = query.basis === "fy" ? "fy" : "ttm";

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <LookThroughContent basis={basis} />
    </main>
  );
}

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
type PortfolioSnapshot = NonNullable<Awaited<ReturnType<typeof getPortfolio>>>;
type DashboardData = ReturnType<typeof computeDashboard>;

async function LookThroughBodyStreamed({
  supabase,
  portfolio,
  data,
  today,
  factor,
  currency,
  basis,
}: {
  supabase: SupabaseServer;
  portfolio: PortfolioSnapshot;
  data: DashboardData;
  today: string;
  factor: number;
  currency: Currency;
  basis: "ttm" | "fy";
}) {
  const m = (v: number) => moneyCompact(v * factor, currency);
  const buySymbols = [
    ...new Set(
      portfolio.events
        .filter((e) => e.type === "BUY" && e.symbol)
        .map((e) => e.symbol as string),
    ),
  ];
  const { data: lt } = await getOrComputeSnapshot({
    supabase,
    holdingId: portfolio.holding.id,
    kind: "lookthrough-current",
    portfolioRevision: portfolio.holding.portfolio_revision,
    asOfDate: today,
    ttlMs: 5 * 60 * 1000,
    parametersHash: `basis:${basis}`,
    compute: () =>
      computeLookThrough(supabase, {
        allocation: data.allocation,
        year: Number(today.slice(0, 4)),
        invested: data.invested,
        basis,
      }),
  });
  const hasData = lt.coverage.includedCount > 0;
  const divisions = lt.coverage.legs
    .filter((l) => l.status === "included")
    .sort((a, b) => (b.netIncomeMine ?? 0) - (a.netIncomeMine ?? 0));
  const others = lt.coverage.legs.filter((l) => l.status !== "included");
  const mvp = divisions[0]?.netIncomeMine != null && divisions[0].netIncomeMine > 0
    ? divisions[0]
    : null;

  return (
    <>
      {hasData ? (
        <>
          {mvp && (
            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-card">
              <p className="text-xs font-semibold text-primary">MVP 사업부</p>
              <div className="mt-2 flex items-center gap-3">
                <SymbolAvatar name={mvp.name} symbol={mvp.symbol} />
                <div className="min-w-0">
                  <p className="truncate font-extrabold tracking-tight">{mvp.name}</p>
                  <p className="text-xs text-muted-foreground">
                    투시이익 기여 1위 ·{" "}
                    {lt.netIncome > 0
                      ? `연결의 ${pct(mvp.netIncomeMine! / lt.netIncome)}`
                      : m(mvp.netIncomeMine!)}
                  </p>
                </div>
                <p className="ml-auto shrink-0 text-lg font-extrabold tabular-nums text-primary">
                  {m(mvp.netIncomeMine!)}
                </p>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                직전 공시 기준. 내 지분율({pct(mvp.ownership ?? 0)})로 환산한 순이익 기여액입니다.
              </p>
            </section>
          )}

          <section className="rounded-2xl bg-card p-5 shadow-card">
            <p className="text-sm text-muted-foreground">연결 투시 순이익 (내 몫)</p>
            <CountUp
              value={lt.netIncome * factor}
              format="moneyCompact"
              currency={currency}
              className="mt-1 block text-3xl font-extrabold"
            />
            {lt.earningsYield != null && (
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                투시이익률 {pct(lt.earningsYield)}{" "}
                <span className="text-xs">(연결 순이익 ÷ 투입원금)</span>
              </p>
            )}
          </section>

          <Suspense fallback={<TrendSkeleton />}>
            <TrendStreamed
              supabase={supabase}
              events={portfolio.events}
              foundedAt={portfolio.holding.founded_at}
              today={today}
              initialValuation={Number(portfolio.holding.initial_valuation)}
              buySymbols={buySymbols}
              holdingId={portfolio.holding.id}
              portfolioRevision={portfolio.holding.portfolio_revision}
              factor={factor}
              currency={currency}
            />
          </Suspense>

          <Suspense fallback={null}>
            <FlagsStreamed
              supabase={supabase}
              divisions={divisions.map((l) => ({ symbol: l.symbol, name: l.name }))}
              holdingId={portfolio.holding.id}
              portfolioRevision={portfolio.holding.portfolio_revision}
              year={Number(today.slice(0, 4))}
            />
          </Suspense>

          <section className="rounded-2xl bg-card p-5 shadow-card">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">내 사업부</p>
              <div className="flex shrink-0 rounded-full bg-secondary p-0.5 text-[10px] font-semibold">
                <Link
                  href="/lookthrough?basis=ttm"
                  className={`rounded-full px-2 py-1 transition ${
                    basis === "ttm"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  scroll={false}
                >
                  최근 12개월
                </Link>
                <Link
                  href="/lookthrough?basis=fy"
                  className={`rounded-full px-2 py-1 transition ${
                    basis === "fy"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                  scroll={false}
                >
                  직전 연간
                </Link>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              기여순으로 보고, 헤더를 눌러 PER·PBR·ROE로 비교 — 비율은 통화와 무관해요.
            </p>
            <p className="mb-3 mt-1 text-[11px] text-muted-foreground">{lt.asOfNote}</p>
            <CompanyMetricsTable
              legs={divisions}
              factor={factor}
              currency={currency}
              summary={{
                per: lt.per,
                pbr: lt.pbr,
                roe: lt.roe,
                netMargin: lt.netMargin,
              }}
            />
          </section>

          <StatCard title="연결 투시 지표">
            <SubHead>밸류에이션</SubHead>
            {lt.per != null && <Stat label="PER" value={mult(lt.per)} />}
            {lt.pbr != null && <Stat label="PBR" value={mult(lt.pbr)} />}
            {lt.psr != null && <Stat label="PSR" value={mult(lt.psr)} />}
            <SubHead>수익성</SubHead>
            {lt.roe != null && <Stat label="ROE" value={pct(lt.roe)} />}
            {lt.roa != null && <Stat label="ROA" value={pct(lt.roa)} />}
            {lt.netMargin != null && <Stat label="순이익률" value={pct(lt.netMargin)} />}
            {lt.operatingMargin != null && (
              <Stat label="영업이익률" value={pct(lt.operatingMargin)} />
            )}
            <SubHead>효율·안정성</SubHead>
            {lt.assetTurnover != null && (
              <Stat label="총자산회전율" value={turn(lt.assetTurnover)} />
            )}
            {lt.leverage != null && (
              <Stat label="재무레버리지" value={mult(lt.leverage)} />
            )}
            {lt.debtRatio != null && <Stat label="부채비율" value={pct(lt.debtRatio)} />}
            {lt.interestCoverage != null && (
              <Stat label="이자보상배율" value={mult(lt.interestCoverage)} />
            )}
            <p className="pt-1 text-xs text-muted-foreground">
              PER·PBR·PSR은 “반영된 보유 시장가치 ÷ 연결 실적” — 내가 소유한 사업
              전체의 밸류에이션이에요.
            </p>
          </StatCard>

          <StatCard title="연결 투시 재무상태 (B/S)">
            <Stat label="자산총계" value={m(lt.assets)} />
            <Stat label="부채총계" value={m(lt.liabilities)} />
            <Stat label="자본총계" value={m(lt.equity)} />
          </StatCard>

          <StatCard title="연결 투시 손익 (P&L)">
            <Stat label="매출" value={m(lt.revenue)} />
            <Stat label="영업이익" value={m(lt.operatingIncome)} />
            <Stat label="순이익" value={m(lt.netIncome)} />
          </StatCard>

          <StatCard title="연결 투시 현금흐름 (C/F)">
            <Stat label="영업활동" value={m(lt.ocf)} />
            <Stat label="투자활동" value={m(lt.icf)} />
            <Stat label="재무활동" value={m(lt.ffcf)} />
            <Stat
              label="잉여현금흐름 (FCF)"
              value={m(lt.fcf)}
              color={changeColor(lt.fcf)}
            />
            <Stat label="감가상각비(D&A)" value={m(lt.dna)} muted />
            <Stat label="CapEx" value={m(lt.capex)} muted />
            <p className="pt-1 text-xs text-muted-foreground">
              FCF는 공시값(영업현금 − CapEx) 그대로 — 추정 없음. 오너이익은 유지CapEx
              추정이 필요해 합치지 않고 재료(D&A·CapEx)만 둡니다.
            </p>
          </StatCard>

          <Suspense fallback={null}>
            <DisclosurePreviewStreamed
              supabase={supabase}
              symbols={data.allocation.map((item) => item.symbol)}
              holdingId={portfolio.holding.id}
              today={today}
            />
          </Suspense>
        </>
      ) : (
        <section className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">{lt.asOfNote}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            한국 주식을 보유하면 그 회사들이 사업부로 합산돼 연결 실적이 나와요.
          </p>
        </section>
      )}

      {others.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">아직 합산 안 되는 자산</p>
          <ul className="flex flex-col gap-3">
            {others.map((leg) => (
              <OtherRow
                key={leg.symbol}
                leg={leg}
                factor={factor}
                currency={currency}
              />
            ))}
          </ul>
        </section>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        연결은 보유 시장가치의 {pct(lt.coverage.ratio)}(한국 주식 {lt.coverage.includedCount}
        개 사업부)만 반영합니다. {hasData && `${lt.asOfNote}. `}
        미국·ETF·코인·실물은 위에 사유와 함께 표시했어요. 이 화면은{" "}
        <b>소유한 사업의 실체</b>로, 시장이 매긴 수익률(XIRR)·내 지갑(순자산)과는 다른
        층위예요.
      </p>
    </>
  );
}

async function DisclosurePreviewStreamed({
  supabase,
  symbols,
  holdingId,
  today,
}: {
  supabase: SupabaseServer;
  symbols: string[];
  holdingId: string;
  today: string;
}) {
  const fromDate = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [feed, dismissed] = await Promise.all([
    getPortfolioDisclosureFeed(symbols, fromDate, today, 10, 100),
    loadDismissed(supabase, holdingId),
  ]);
  const core = feed.filter((item) => item.priority !== "noise").slice(0, 3);
  if (core.length === 0) {
    return (
      <Link
        href="/disclosures"
        className="flex items-center justify-between rounded-2xl bg-card p-5 text-sm font-semibold shadow-card"
      >
        <span>내 사업부 공시</span>
        <span className="text-muted-foreground">전체 보기 ›</span>
      </Link>
    );
  }
  return (
    <DisclosureFeed
      items={core}
      initialReadKeys={[...dismissed]}
      title="내 사업부 소식"
      allHref="/disclosures"
    />
  );
}

/**
 * 분기별 진화 차트 — getDailyKrwCloses + computeLookThroughSeries(DART) 로 무거워 Suspense 스트리밍.
 * 본문(투시 합계)이 먼저 그려지고, 이 차트는 준비되는 대로 끼워 넣는다.
 */
async function TrendStreamed({
  supabase,
  events,
  foundedAt,
  today,
  initialValuation,
  buySymbols,
  holdingId,
  portfolioRevision,
  factor,
  currency,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  events: InvestmentEvent[];
  foundedAt: string;
  today: string;
  initialValuation: number;
  buySymbols: string[];
  holdingId: string;
  portfolioRevision: number;
  factor: number;
  currency: Currency;
}) {
  const { data: trend } = await getOrComputeSnapshot({
    supabase,
    holdingId,
    kind: "lookthrough-series",
    portfolioRevision,
    asOfDate: today,
    ttlMs: 6 * 60 * 60 * 1000,
    compute: async () => {
      const { series } = await getDailyKrwCloses(buySymbols, foundedAt, today);
      return computeLookThroughSeries(supabase, {
        events,
        foundedAt,
        today,
        initialValuation,
        priceSeries: series,
      });
    },
  });
  if (trend.length >= 2)
    return <LookThroughTrend points={trend} factor={factor} currency={currency} />;
  return (
    <section className="rounded-2xl bg-card p-5 text-center shadow-card">
      <p className="text-sm text-muted-foreground">
        분기가 쌓이면 내 회사의 진화 추세가 여기 나타나요.
      </p>
    </section>
  );
}

/** 분기 추이 로딩 스켈레톤. */
function TrendSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
      <div className="mt-3 h-40 w-full animate-pulse rounded bg-secondary" />
    </div>
  );
}

/** 사업부별 펀더멘털 플래그 — getFundamentalsSeries(DART) 다년 조회라 무거워 Suspense 스트리밍. */
async function FlagsStreamed({
  supabase,
  divisions,
  holdingId,
  portfolioRevision,
  year,
}: {
  supabase: SupabaseServer;
  divisions: { symbol: string; name: string }[];
  holdingId: string;
  portfolioRevision: number;
  year: number;
}) {
  const { data: flagGroups } = await getOrComputeSnapshot({
    supabase,
    holdingId,
    kind: "lookthrough-flags",
    portfolioRevision,
    asOfDate: `${year}-01-01`,
    ttlMs: 6 * 60 * 60 * 1000,
    compute: () => computePortfolioFlags(divisions, year, supabase),
  });
  return <PortfolioFlags groups={flagGroups} />;
}

const mult = (n: number) => `${n.toFixed(1)}배`;
const turn = (n: number) => `${n.toFixed(2)}회`;

const STATUS_CHIP: Record<string, { text: string; cls: string }> = {
  no_disclosure: { text: "공시 없음", cls: "bg-secondary text-muted-foreground" },
  us_pending: { text: "연동 예정", cls: "bg-accent text-accent-foreground" },
  etf_pending: { text: "펼치기 예정", cls: "bg-accent text-accent-foreground" },
  no_earnings: { text: "해당없음", cls: "bg-secondary text-muted-foreground" },
};

function OtherRow({
  leg,
  factor,
  currency,
}: {
  leg: LookThroughLeg;
  factor: number;
  currency: Currency;
}) {
  const chip = STATUS_CHIP[leg.status];
  return (
    <li className="flex items-center gap-3">
      <SymbolAvatar name={leg.name} symbol={leg.symbol} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{leg.name}</span>
        <span className="text-xs text-muted-foreground">{leg.reason}</span>
      </span>
      <span className="ml-auto flex flex-col items-end gap-0.5">
        <span className="text-sm tabular-nums text-muted-foreground">
          {moneyCompact(leg.value * factor, currency)}
        </span>
        {chip && (
          <span
            className={"rounded-full px-2 py-0.5 text-xs font-semibold " + chip.cls}
          >
            {chip.text}
          </span>
        )}
      </span>
    </li>
  );
}

function StatCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-1 text-xs font-semibold text-muted-foreground first:pt-0">
      {children}
    </p>
  );
}

function Stat({
  label,
  value,
  muted = false,
  color,
}: {
  label: string;
  value: string;
  muted?: boolean;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={"text-sm " + (muted ? "text-muted-foreground" : "font-medium")}
      >
        {label}
      </span>
      <span
        className="text-sm font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
