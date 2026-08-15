import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { companyCashPools } from "@/lib/finance/valuation";
import { getFxToKrw } from "@/lib/finance/fx";
import { readTargets } from "@/lib/targetWeights";
import { cashKey, sumCashTargets } from "@/lib/targetLens";
import { money, pct } from "@/lib/format";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import {
  CurrencyTargetList,
  type CurrencyRow,
} from "@/components/allocation/CurrencyTargetList";

/**
 * `/allocation/cash` — 드릴다운 **1계층: 현금**, 통화별로.
 *
 * 현금을 한 덩어리로 두면 "얼마를 달러로 들고 갈지"를 정할 수가 없다. 통화마다 한 줄로
 * 세우고 목표를 매긴다.
 *
 * 통화 잔액은 **네이티브**(₩·$·¥)라 그대로 더할 수 없다. 현재 환율로 ₩ 환산한 뒤 그
 * 비율로 표시통화 합계를 나눈다 — 대시보드 합계와 어긋나지 않는다. 환율을 못 받은 통화는
 * 뺀다(0으로 넣으면 비중이 조용히 틀어진다).
 */
export default async function CashAllocationPage() {
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

  const displayCcy = cookieStore.get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  const pools = companyCashPools(
    portfolio.events,
    Number(portfolio.holding.initial_valuation),
  );

  const targets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    data.allocation.map((a) => ({ symbol: a.symbol, assetType: "주식" })),
  );

  const held = Object.entries(pools).filter(([, v]) => Math.abs(v) > 0.005);
  const fx = await getFxToKrw(held.map(([c]) => c));
  const priced = held
    .map(([ccy, native]) => ({ ccy, native, krw: native * (fx[ccy] ?? 0) }))
    .filter((x) => fx[x.ccy] != null && x.krw > 0);
  const krwTotal = priced.reduce((s, x) => s + x.krw, 0);

  const cash = Math.max(0, data.cash);
  const rows: CurrencyRow[] = priced
    .map((x) => {
      const value = krwTotal > 0 ? cash * (x.krw / krwTotal) : 0;
      return {
        currency: x.ccy,
        native: x.native,
        value,
        weight: cash > 0 ? value / cash : 0,
        target: targets[cashKey(x.ccy)]?.target ?? 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  // 통화 목표의 분모는 **현금**이다 — 증권 목표(증권끼리 100%)와 다른 100% 를 나눠 갖는다.
  // 예전엔 둘을 한 100% 안에 욱여넣어 "달러 10%" 가 현금의 10%인지 자산의 10%인지
  // 헷갈렸다. 이제 이 화면은 현금 안에서만 말한다.
  const assigned = sumCashTargets(targets);
  const unassigned = Math.max(0, 1 - assigned);
  const financial = data.allocation.reduce((s, a) => s + a.value, 0);
  const investable = financial + cash;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">현금</h1>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">
          {money(cash, data.currency)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          투자자산의 {pct(investable > 0 ? cash / investable : 0)} · 아래 비중은
          현금 안에서 100%
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">현금이 없어요.</p>
        </div>
      ) : (
        <CurrencyTargetList rows={rows} currency={data.currency} />
      )}

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        여기 목표는 <b>현금 안에서</b>예요 — 증권 목표(증권끼리 100%)와 따로 놉니다.
        지금 통화에 배정한 몫은 {pct(assigned)}이고, 나머지 {pct(unassigned)}는
        아직 안 정했어요.
      </p>
    </main>
  );
}
