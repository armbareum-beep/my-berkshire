import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDailyKrwCloses } from "@/lib/finance/prices";
import { getIndexSummary, getShillerCape } from "@/lib/finance/indexStats";
import { getBuffettIndicator, getUsCorporateProfitRatio } from "@/lib/finance/macroStats";
import { PRESET_QUOTES } from "@/lib/finance/quotes";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { PriceChart } from "@/components/stocks/PriceChart";
import { IndexValuation } from "@/components/index/IndexValuation";
import { BuffettIndicator } from "@/components/index/BuffettIndicator";
import { CorporateProfitChart, CorporateProfitChartFallback } from "@/components/index/CorporateProfitChart";
import { EtfLinks } from "@/components/index/EtfLinks";
import { WeightBar } from "@/components/ui/WeightBar";
import { pct } from "@/lib/format";

type PriceClosesResult = Awaited<ReturnType<typeof getDailyKrwCloses>>;

const COUNTRY_FLAG: Record<string, string> = {
  KR: "🇰🇷",
  US: "🇺🇸",
  JP: "🇯🇵",
  CN: "🇨🇳",
  GB: "🇬🇧",
};

const SECTOR_KO: Record<string, string> = {
  technology: "기술",
  healthcare: "헬스케어",
  financial_services: "금융",
  financialServices: "금융",
  consumer_cyclical: "임의소비재",
  consumerCyclical: "임의소비재",
  industrials: "산업재",
  communication_services: "커뮤니케이션",
  communicationServices: "커뮤니케이션",
  consumer_defensive: "필수소비재",
  consumerDefensive: "필수소비재",
  energy: "에너지",
  basic_materials: "소재",
  basicMaterials: "소재",
  real_estate: "부동산",
  realEstate: "부동산",
  utilities: "유틸리티",
};

export default async function IndexDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const decoded = decodeURIComponent(symbol);

  const preset = PRESET_QUOTES.find(
    (q) => q.symbol === decoded && q.isIndex === true,
  );
  if (!preset) notFound();

  const today = todayKST();
  const oneYearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;

  const [summary, buffett, usCpRatio] = await Promise.all([
    getIndexSummary(decoded),
    getBuffettIndicator(),
    getUsCorporateProfitRatio(),
  ]);

  const isSnp500 = decoded === "^GSPC";
  const isUsIndex = preset.country === "US";
  const cape = isSnp500 ? await getShillerCape() : null;

  const dailyPromise = getDailyKrwCloses([decoded], oneYearAgo, today);
  const monthlyPromise = getDailyKrwCloses([decoded], "1990-01-01", today, "1mo");

  const flag = preset.country ? COUNTRY_FLAG[preset.country] ?? "" : "";

  const sectors = (summary?.sectors ?? []).map((s) => ({
    ...s,
    name: SECTOR_KO[s.name] ?? s.name,
  }));

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <div className="flex items-center gap-2">
        {flag && <span className="text-2xl">{flag}</span>}
        <div>
          <p className="text-xl font-extrabold tracking-tight">{preset.name}</p>
          <p className="text-sm text-muted-foreground">{decoded}</p>
        </div>
      </div>

      {preset.description && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="text-sm font-semibold">어떤 지수인가요?</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {preset.description}
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            지수 정의 요약 · 구성과 비중은 정기적으로 변경될 수 있어요.
          </p>
        </section>
      )}

      <Suspense fallback={<ChartSkeleton />}>
        <PriceChartStreamed
          symbol={decoded}
          dailyPromise={dailyPromise}
          monthlyPromise={monthlyPromise}
        />
      </Suspense>

      <IndexValuation summary={summary} cape={cape} isSnp500={isSnp500} />

      {buffett.length > 0 && <BuffettIndicator data={buffett} />}

      {isUsIndex && (
        usCpRatio ? (
          <CorporateProfitChart
            series={usCpRatio.series}
            latestRatio={usCpRatio.ratio}
            asOf={usCpRatio.asOf}
          />
        ) : (
          <CorporateProfitChartFallback />
        )
      )}

      {sectors.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">섹터 구성</p>
          <ul className="flex flex-col gap-2.5">
            {sectors.slice(0, 8).map((s) => (
              <li key={s.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">{pct(s.weight)}</span>
                </div>
                <WeightBar weight={s.weight} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            출처: Yahoo Finance · 참고용
          </p>
        </section>
      )}

      {summary && summary.holdings.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <p className="mb-3 text-sm font-semibold">주요 구성 종목 Top 10</p>
          <ul className="flex flex-col gap-2">
            {summary.holdings.map((h) => (
              <li key={h.symbol} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{h.name || h.symbol}</span>
                  <span className="text-xs text-muted-foreground">{h.symbol}</span>
                </div>
                <span className="tabular-nums text-muted-foreground">{pct(h.weight)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            출처: Yahoo Finance · 참고용
          </p>
        </section>
      )}

      <EtfLinks indexSymbol={decoded} indexName={preset.name} />
    </main>
  );
}

async function PriceChartStreamed({
  symbol,
  dailyPromise,
  monthlyPromise,
}: {
  symbol: string;
  dailyPromise: Promise<PriceClosesResult>;
  monthlyPromise: Promise<PriceClosesResult>;
}) {
  const [dailyRes, monthlyRes] = await Promise.all([dailyPromise, monthlyPromise]);
  return (
    <PriceChart
      daily={dailyRes.series[symbol] ?? []}
      monthly={monthlyRes.series[symbol] ?? []}
    />
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card" aria-busy="true">
      <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
      <div className="mt-4 h-48 w-full animate-pulse rounded bg-secondary" />
    </div>
  );
}
