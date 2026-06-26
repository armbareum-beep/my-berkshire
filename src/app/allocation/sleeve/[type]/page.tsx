import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta } from "@/lib/securities";
import { groupAllocationByType } from "@/lib/allocation";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { StockRow } from "@/components/ui/StockRow";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, signedMoneyShort, signedPct, changeColor } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * 유형 구성 상세 — 한 자산 유형(주식/ETF/원자재/코인) 안의 종목 비중을 100%로 정규화한
 * 도넛 + 목록. /allocation 의 "○○ 구성" 카드에서 이동. 현금은 유형이 아니라 제외.
 */
export default async function SleeveAllocationPage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type: raw } = await params;
  const type = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const portfolio = await getPortfolio(supabase);
  if (!portfolio) redirect("/onboarding");

  const displayCcy =
    (await cookies()).get("display_ccy")?.value === "USD" ? "USD" : "KRW";
  const data = computeDashboard(portfolio, displayCcy);
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );

  // 포트폴리오에 존재하는 유형 목록(탭 바용).
  const sleeveTypes = groupAllocationByType(data.allocation, meta).map((g) => g.type);

  // 이 유형에 속한 종목만(폴백 "주식"). 없는 유형이면 404.
  const inType = data.allocation.filter(
    (a) => (meta[a.symbol]?.assetType ?? "주식") === type,
  );
  if (inType.length === 0) notFound();

  // 유형 안에서 100% 기준으로 정규화.
  const sleeveValue = inType.reduce((s, a) => s + a.value, 0);
  const items = inType
    .map((a) => ({
      label: a.name,
      symbol: a.symbol as string | undefined,
      value: a.value,
      weight: sleeveValue > 0 ? a.value / sleeveValue : 0,
      avgCost: a.avgCost,
      quantity: a.quantity,
      changeRate: a.changeRate,
    }))
    .sort((a, b) => b.value - a.value);

  // 도넛: 상위 8 + 기타(조각 과밀 방지). 목록은 전체 표시.
  const top = items.slice(0, 8);
  const rest = items.slice(8);
  const restWeight = rest.reduce((s, x) => s + x.weight, 0);
  const restValue = rest.reduce((s, x) => s + x.value, 0);
  const slices = [
    ...top.map((x) => ({ label: x.label, weight: x.weight, value: x.value })),
    ...(restWeight > 0.001
      ? [{ label: "기타", weight: restWeight, value: restValue }]
      : []),
  ];

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      {sleeveTypes.length > 1 && (
        <nav className="flex gap-1 rounded-xl bg-secondary p-1">
          {sleeveTypes.map((t) => (
            <Link
              key={t}
              href={`/allocation/sleeve/${encodeURIComponent(t)}`}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                type === t
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {t}
            </Link>
          ))}
        </nav>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight">{type} 구성</h1>
      <p className="text-sm text-muted-foreground">
        {type} 안에서의 종목별 비중입니다(이 유형만 해서 100% 기준).
      </p>

      {/* 도넛 + 범례 */}
      <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
        <Donut slices={slices} currency={data.currency} />
        <ul className="flex flex-1 flex-col gap-2">
          {slices.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: donutColor(i) }}
              />
              <span className="truncate font-medium">{s.label}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {pct(s.weight)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 전체 종목 목록 */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <ul className="flex flex-col gap-1">
          {items.map((it) => {
            const gain =
              it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
            return (
              <li key={it.label}>
                <StockRow
                  symbol={it.symbol ?? it.label}
                  name={it.label}
                  href={it.symbol ? `/stocks/${it.symbol}` : undefined}
                  sub={pct(it.weight)}
                  right={
                    <span className="ml-auto flex flex-col items-end">
                      <span className="font-semibold tabular-nums">
                        {money(it.value, data.currency)}
                      </span>
                      {gain !== null && it.changeRate !== null && (
                        <span
                          className="text-sm font-medium tabular-nums"
                          style={{ color: changeColor(it.changeRate) }}
                        >
                          {signedMoneyShort(gain, data.currency)}{" "}
                          {signedPct(it.changeRate)}
                        </span>
                      )}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
