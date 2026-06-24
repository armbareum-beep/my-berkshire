import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { pointAt } from "@/lib/finance/valueSeries";
import { loadPortfolioValueSeries } from "@/lib/portfolioValueSeries";
import { periodReturn, periodStartDates } from "@/lib/finance/periodReturns";
import {
  INDEX_GROUP,
  benchmarkValueOn,
  getIndexSeriesBySymbol,
  indexSummaryFromSeries,
} from "@/lib/finance/benchmark";
import { findCatalogItem } from "@/lib/finance/catalog";
import { qtyUnit } from "@/lib/securities";
import { daysSince } from "@/lib/finance/xirr";
import { todayKST } from "@/lib/date";
import { money, signedMoney, signedPct, changeColor } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { StockRow } from "@/components/ui/StockRow";
import { CountUp } from "@/components/ui/CountUp";
import { PeriodReturns, type PeriodView } from "@/components/returns/PeriodReturns";
import { type LinePoint } from "@/components/benchmark/BenchmarkChart";
import { MarketSection } from "@/components/benchmark/MarketSection";
import { FrictionCard } from "@/components/dashboard/cards";
import { businessCandidates } from "@/lib/finance/businessContribution";
import { BusinessContribution } from "@/components/returns/BusinessContribution";

/**
 * 수익률 (통합) — 기간 수익률 + 누적손익(실현/미실현) + vs시장 차트.
 * (기존 /benchmark·/pnl 를 흡수 — 성과 지표를 한 페이지로.)
 */
export default async function ReturnsPage() {
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

  const { events, holding, result, names, usdKrw } = portfolio;
  const today = todayKST();
  const foundedAt = holding.founded_at;
  const initialValuation = Number(holding.initial_valuation);
  const endValue = result.currentValuation;

  const displayCcy =
    cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  const useUsd = displayCcy === "USD" && !!usdKrw;
  const factor = useUsd ? 1 / (usdKrw as number) : 1;
  const cur = data.currency;

  const seed = { foundedAt, initialValuation };

  const defaultIndexLabel = cur === "USD" ? "S&P 500" : "코스피";

  const [{ data: valueSeries }, indexData] = await Promise.all([
    loadPortfolioValueSeries({
      supabase,
      holdingId: holding.id,
      portfolioRevision: holding.portfolio_revision,
      foundedAt,
      initialValuation,
      events,
      today,
    }),
    Promise.all(
      INDEX_GROUP.map(async (index) => ({
        index,
        s: await getIndexSeriesBySymbol(index.symbol, foundedAt, today),
      })),
    ),
  ]);
  const series = valueSeries.closes;

  // ── 1) 기간 수익률 ──
  const periods: PeriodView[] =
    endValue == null
      ? []
      : periodStartDates(foundedAt, today).map(({ key, label, start }) => {
          if (start <= foundedAt) {
            return {
              key,
              label,
              startDate: foundedAt,
              days: result.days,
              xirr: result.xirr,
              cumulative: result.cumulativeReturn,
              cagr: result.cagr,
            };
          }
          const startValue = pointAt(seed, events, series, start).value;
          const r = periodReturn(start, startValue, events, endValue, today);
          return { key, label, startDate: start, ...r };
        });

  // ── 2) 누적 손익(실현/미실현) ──
  const nameOf = (s: string | null | undefined) =>
    s ? (names[s] ?? findCatalogItem(s)?.name ?? s) : "";
  const buyAgg: Record<string, { qty: number; cost: number }> = {};
  for (const e of events) {
    if (e.type === "BUY" && e.symbol && e.quantity) {
      const a = (buyAgg[e.symbol] ??= { qty: 0, cost: 0 });
      a.qty += e.quantity;
      a.cost += e.quantity * e.priceOrAmount;
    }
  }
  const avgCostOf = (s: string) =>
    buyAgg[s] && buyAgg[s].qty > 0 ? buyAgg[s].cost / buyAgg[s].qty : 0;

  const realized = events
    .filter((e) => e.type === "SELL" || e.type === "DIVIDEND")
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((e) => {
      const name = nameOf(e.symbol);
      if (e.type === "SELL") {
        const qty = e.quantity ?? 0;
        const proceeds = qty * e.priceOrAmount - e.feeAndTax;
        const gain = qty * (e.priceOrAmount - avgCostOf(e.symbol as string));
        return {
          kind: "SELL" as const,
          symbol: e.symbol as string,
          name,
          qty,
          date: e.date,
          daysAgo: daysSince(e.date, today),
          amount: proceeds * factor,
          gain: gain * factor,
        };
      }
      const net = e.priceOrAmount - e.feeAndTax;
      return {
        kind: "DIVIDEND" as const,
        symbol: e.symbol as string,
        name,
        qty: null,
        date: e.date,
        daysAgo: daysSince(e.date, today),
        amount: net * factor,
        gain: net * factor,
      };
    });

  const unrealized = data.allocation
    .map((a) => ({
      symbol: a.symbol,
      name: a.name,
      quantity: a.quantity,
      pnl: a.value - a.quantity * a.avgCost,
      changeRate: a.changeRate,
    }))
    .filter((u) => u.quantity > 0)
    .sort((a, b) => b.pnl - a.pnl);

  // ── 3) vs 시장(시계열) ──
  const mine: LinePoint[] = valueSeries.points.map(
    (p) => ({ date: p.date, value: p.value }),
  );
  const indices = indexData
    .filter((d) => d.s)
    .map(({ index, s }) => ({
      label: index.label,
      xirr: indexSummaryFromSeries(s!, seed, events, today).benchmarkXirr,
      points: mine.map((p) => ({
        date: p.date,
        value: benchmarkValueOn(s!, seed, events, p.date),
      })),
    }));
  const periodLabel = `${foundedAt} ~ 오늘 · ${daysSince(foundedAt, today)}일`;
  const contributionCandidates = businessCandidates(events, names);

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">수익률</h1>
        {data.profit !== null && (
          <p
            className="mt-1 text-3xl font-extrabold tabular-nums"
            style={{ color: changeColor(data.profit) }}
          >
            누적손익{" "}
            <CountUp value={data.profit} format="signedMoney" currency={cur} />
          </p>
        )}
      </div>

      {periods.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground shadow-card">
          시세를 불러오지 못해 수익률을 계산할 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : periods.some((p) => p.cumulative != null || p.xirr != null) ? (
        <PeriodReturns periods={periods} />
      ) : null}

      {result.currentValuation != null &&
        contributionCandidates.length > 0 && (
          <BusinessContribution
            holding={seed}
            events={events}
            prices={portfolio.prices}
            today={today}
            baseline={result}
            candidates={contributionCandidates}
          />
        )}

      {mine.length >= 2 && indices.length > 0 && (
        <MarketSection
          mine={mine}
          indices={indices}
          myXirr={result.xirr}
          defaultLabel={defaultIndexLabel}
          periodLabel={periodLabel}
          factor={factor}
          currency={cur}
        />
      )}

      {/* 실현 손익 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">실현 손익</p>
          {data.realized !== null && (
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: changeColor(data.realized) }}
            >
              {signedMoney(data.realized, cur)}
            </span>
          )}
        </div>
        {realized.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 실현 손익이 없습니다(매도·배당 기록 시 쌓입니다).
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {realized.map((r, i) => (
              <li key={i} className="flex items-center gap-3">
                <SymbolAvatar name={r.name} symbol={r.symbol} size="md" />
                <span className="flex flex-col">
                  <span className="font-bold">
                    {r.kind === "DIVIDEND" ? "배당" : "매도"} · {r.name}
                    {r.qty != null && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        {r.qty.toLocaleString()}주
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.date}</span>
                </span>
                <span className="ml-auto flex flex-col items-end">
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: changeColor(r.gain) }}
                  >
                    {signedMoney(r.gain, cur)}
                  </span>
                  {r.kind === "SELL" && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      매도금액 {money(r.amount, cur)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 미실현 손익 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">미실현 손익</p>
          {data.unrealized !== null && (
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: changeColor(data.unrealized) }}
            >
              {signedMoney(data.unrealized, cur)}
            </span>
          )}
        </div>
        {unrealized.length === 0 ? (
          <p className="text-sm text-muted-foreground">보유 종목이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {unrealized.map((u) => (
              <li key={u.symbol}>
                <StockRow
                  symbol={u.symbol}
                  name={u.name}
                  href={`/stocks/${u.symbol}`}
                  sub={`${u.quantity.toLocaleString()}${qtyUnit(u.symbol)}${
                    u.changeRate !== null ? ` · ${signedPct(u.changeRate)}` : ""
                  }`}
                  right={
                    <span
                      className="font-semibold tabular-nums"
                      style={{ color: changeColor(u.pnl) }}
                    >
                      {signedMoney(u.pnl, cur)}
                    </span>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <FrictionCard friction={data.friction} drag={data.drag} currency={cur} />
    </main>
  );
}
