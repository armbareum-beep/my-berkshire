import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { todayKST } from "@/lib/date";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { YearProgress } from "@/components/import/YearProgress";
import type { YearTrade } from "@/components/import/QuickEntryForm";
import { PositionFidelity, type PositionInfo } from "@/components/import/PositionFidelity";
import { loadSecurityNames } from "@/lib/securities";
import { findCatalogItem } from "@/lib/finance/catalog";
import { daysSince } from "@/lib/finance/xirr";
import { realizedGainKRW } from "@/lib/finance/realized";
import type { AccountType } from "@/lib/config/tax";

export default async function ImportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  if (portfolio.holding.mode !== "ledger") redirect("/dashboard");

  const { holding } = portfolio;
  const currentYear = Number(todayKST().slice(0, 4));
  const completedYears: number[] = (holding as { completed_years?: number[] }).completed_years ?? [];

  // 연도별 이벤트 수 집계
  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id")
    .eq("holding_id", holding.id);
  const accountIds = (accountRows ?? []).map((a) => a.id);

  const yearCounts: Record<number, number> = {};
  let trades: YearTrade[] = [];
  const positions: PositionInfo[] = [];
  if (accountIds.length > 0) {
    // 살아있는(삭제 안 된) 이벤트만. 연도별 건수 + 매수/매도 기록 + 종목 정밀도.
    const { data: activeEvents } = await supabase
      .from("events")
      .select("id, type, symbol, quantity, price_or_amount, date, currency, fx_rate, source")
      .in("account_id", accountIds)
      .is("deleted_at", null)
      .order("date", { ascending: true });

    for (const e of activeEvents ?? []) {
      const yr = Number(e.date.slice(0, 4));
      yearCounts[yr] = (yearCounts[yr] ?? 0) + 1;
    }

    const tradeRows = (activeEvents ?? []).filter(
      (e) => (e.type === "BUY" || e.type === "SELL") && e.symbol,
    );
    const names = await loadSecurityNames(
      supabase,
      tradeRows.map((e) => e.symbol as string),
    );
    trades = tradeRows.map((e) => {
      const fx = e.fx_rate == null || Number(e.fx_rate) <= 0 ? 1 : Number(e.fx_rate);
      const symbol = e.symbol as string;
      return {
        id: e.id,
        type: e.type as "BUY" | "SELL",
        symbol,
        name: names[symbol] ?? findCatalogItem(symbol)?.name ?? symbol,
        quantity: e.quantity == null ? 0 : Number(e.quantity),
        priceNative: Number(e.price_or_amount) / fx,
        currency: e.currency ?? "KRW",
        date: e.date,
      };
    });

    // 종목별 정밀도 티어(스냅샷 vs 실제 정합)
    const TOL = 1e-9;
    const signed = (e: { type: string; quantity: number | null }) =>
      (e.type === "BUY" ? 1 : e.type === "SELL" ? -1 : 0) * Number(e.quantity ?? 0);
    const symset = new Set<string>();
    for (const e of activeEvents ?? [])
      if (e.symbol && (e.type === "BUY" || e.type === "SELL")) symset.add(e.symbol);
    for (const sym of symset) {
      const evs = (activeEvents ?? []).filter((e) => e.symbol === sym);
      const held = evs.reduce((s, e) => s + signed(e), 0); // 전체 순수량(스냅샷 포함)
      const snapshotQty = evs
        .filter((e) => e.source === "snapshot")
        .reduce((s, e) => s + signed(e), 0); // 스냅샷이 주장한 보유(=목표)
      const realNet = evs
        .filter((e) => e.source !== "snapshot")
        .reduce((s, e) => s + signed(e), 0); // 실제 입력 순수량
      const snapshotPresent = evs.some((e) => e.source === "snapshot" && e.type === "BUY");
      // 스냅샷이 살아있으면 T0(복원 대상). 없고 보유>0이면 T1(복원완료), 보유 0이면 T2(매도완료).
      const tier: "T0" | "T1" | "T2" = snapshotPresent
        ? "T0"
        : Math.abs(held) < TOL
          ? "T2"
          : "T1";
      // 맞춰야 할 목표 수량: T0=스냅샷 주장, T1=현재 보유.
      const target = tier === "T0" ? snapshotQty : tier === "T2" ? 0 : held;
      positions.push({
        symbol: sym,
        name: names[sym] ?? findCatalogItem(sym)?.name ?? sym,
        target,
        realNet,
        tier,
        reconciled: tier === "T1",
      });
    }
    // 손볼 것(T0) 먼저, 그다음 이름순
    positions.sort((a, b) =>
      a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "T0" ? -1 : 1,
    );
  }

  // 기본 1년만 표시. 클라이언트에서 1년씩 확장.
  const years: number[] = [currentYear];

  const { data: accountRows2 } = await supabase
    .from("accounts")
    .select("id, name, account_type")
    .eq("holding_id", holding.id)
    .order("created_at", { ascending: true });
  const accounts = (accountRows2 ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    accountType: a.account_type as AccountType,
  }));

  // 게이미피케이션 지표(US2): 회사 나이·정밀도·잠금 게이트·수익률 프리뷰
  const t0Count = positions.filter((p) => p.tier === "T0").length;
  const t1Count = positions.filter((p) => p.tier === "T1").length;
  const trust = t0Count + t1Count > 0 ? t1Count / (t0Count + t1Count) : 0;
  const companyAgeDays = daysSince(holding.founded_at, todayKST());
  const foundingDeclared =
    (holding as { founding_declared?: boolean }).founding_declared ?? false;
  const r = portfolio.result;
  // 누적수익률은 항상 표시(평단 맞으면 정확). 연환산(XIRR)은 status로 자연 게이트(기간 필요).
  const preview = {
    status: r.status,
    xirr: r.xirr,
    cumulativeReturn: r.cumulativeReturn,
  };
  // 실현손익(US3): 매도가 있으면 평균원가 기준 실현손익 공개.
  const realizedKrw = realizedGainKRW(portfolio.events);
  const realizedUnlocked = portfolio.events.some((e) => e.type === "SELL");

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">거래내역 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          연도별로 천천히 채워나가세요
        </p>
      </div>

      {positions.length > 0 && (
        <PositionFidelity
          holdingId={holding.id}
          positions={positions}
          today={todayKST()}
          companyAgeDays={companyAgeDays}
          trust={trust}
          foundedAt={holding.founded_at}
          foundingDeclared={foundingDeclared}
          remaining={t0Count}
          preview={preview}
          realizedKrw={realizedKrw}
          realizedUnlocked={realizedUnlocked}
        />
      )}

      <YearProgress
        holdingId={holding.id}
        years={years}
        yearCounts={yearCounts}
        completedYears={completedYears}
        accounts={accounts}
        today={todayKST()}
        trades={trades}
      />
    </main>
  );
}
