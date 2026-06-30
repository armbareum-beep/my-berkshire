import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta, backfillSectors } from "@/lib/securities";
import { companyCashPools } from "@/lib/finance/valuation";
import { tagLabel } from "@/lib/allocation";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { StockRow } from "@/components/ui/StockRow";
import { CashBreakdown } from "@/components/dashboard/CashBreakdown";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, signedMoneyShort, signedPct, changeColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryDrawer, type DrawerCategory } from "@/components/allocation/CategoryDrawer";

const TAGS = {
  country: { key: "country" as const, title: "국가별 자산배분" },
  type: { key: "assetType" as const, title: "유형별 자산배분" },
  sector: { key: "sector" as const, title: "산업별 자산배분" },
};

interface CategoryItem {
  symbol: string;
  name: string;
  value: number;
  avgCost: number;
  quantity: number;
  changeRate: number | null;
  assetType: string;
  country: string;
}
interface Category {
  label: string;
  value: number;
  weight: number; // 0~1 전체 대비
  items: CategoryItem[];
}

export default async function AllocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ only?: string; tab?: string }>;
}) {
  const [{ tag }, sp] = await Promise.all([params, searchParams]);
  const onlyLabel = sp.only ? decodeURIComponent(sp.only) : null;
  const activeTab = sp.tab ? decodeURIComponent(sp.tab) : null;
  const cfg = TAGS[tag as keyof typeof TAGS];
  if (!cfg) notFound();

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
  // 현금 슬라이스 안에서 통화별(₩/$) 잔액을 보여주기 위한 풀(네이티브 금액).
  const cashPools = companyCashPools(
    portfolio.events,
    Number(portfolio.holding.initial_valuation),
  );
  const meta = await loadSecurityMeta(
    supabase,
    data.allocation.map((a) => a.symbol),
  );
  if (cfg.key === "sector") {
    const filled = await backfillSectors(supabase, meta);
    for (const [s, sec] of Object.entries(filled)) if (meta[s]) meta[s].sector = sec;
  }

  // 카테고리별 합산 + 구성종목
  const map = new Map<string, Category>();
  for (const a of data.allocation) {
    const label = tagLabel(meta[a.symbol], cfg.key);
    const cat = map.get(label) ?? { label, value: 0, weight: 0, items: [] };
    cat.value += a.value;
    cat.items.push({ symbol: a.symbol, name: a.name, value: a.value, avgCost: a.avgCost, quantity: a.quantity, changeRate: a.changeRate, assetType: meta[a.symbol]?.assetType ?? "주식", country: meta[a.symbol]?.country ?? "기타" });
    map.set(label, cat);
  }
  // 현금 슬라이스 — 유형·국가·산업 모두 포함(산업은 현금 카테고리 추가).
  if (data.cash > 0) {
    const cash = map.get("현금") ?? { label: "현금", value: 0, weight: 0, items: [] };
    cash.value += data.cash;
    map.set("현금", cash);
  }

  // 카테고리 정렬: 현금 최하단, 국가=기타 현금 바로 위, 산업=미분류 현금 바로 위.
  function pinnedOrder(label: string): number {
    if (label === "현금") return 3;
    if (tag === "sector" && label === "미분류") return 2;
    if (tag === "country" && label === "기타") return 1;
    return 0;
  }

  const total = [...map.values()].reduce((s, c) => s + c.value, 0);
  const allCategories = [...map.values()]
    .map((c) => ({
      ...c,
      weight: total > 0 ? c.value / total : 0,
      items: c.items.sort((a, b) => b.value - a.value),
    }))
    .sort((a, b) => {
      const pa = pinnedOrder(a.label);
      const pb = pinnedOrder(b.label);
      if (pa !== pb) return pa - pb;
      return b.value - a.value;
    });

  // ?only=한국 → 해당 국가만 표시 (홈 카드 국가 탭에서 진입)
  const categories = onlyLabel
    ? allCategories.filter((c) => c.label === onlyLabel)
    : allCategories;

  const pageTitle = onlyLabel ? `${onlyLabel} 자산` : cfg.title;

  // ?only= 단일국가 뷰: 탭별 항목을 미리 계산 (도넛·목록 공유)
  const onlyItems = onlyLabel && categories[0] ? categories[0].items : null;
  const onlyAssetTypes = onlyItems
    ? [...new Set(onlyItems.map((it) => it.assetType))].sort()
    : null;
  const resolvedTab =
    onlyAssetTypes && activeTab && onlyAssetTypes.includes(activeTab)
      ? activeTab
      : onlyAssetTypes?.[0] ?? null;
  const tabItems = onlyItems && resolvedTab
    ? onlyItems.filter((it) => it.assetType === resolvedTab)
    : null;
  const tabValue = tabItems ? tabItems.reduce((s, it) => s + it.value, 0) : 0;
  // 도넛용 슬라이스 — 단일국가 탭 뷰는 탭 내 종목, 그 외는 categories
  const donutSlices = tabItems
    ? tabItems.map((it) => ({ label: it.name, weight: tabValue > 0 ? it.value / tabValue : 0, value: it.value }))
    : categories;

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-6 pb-28">
      <BottomTabBar />
      <BackButton />
      {/* 단일 국가 뷰에서는 탭 숨김 */}
      {!onlyLabel && (
        <nav className="flex gap-1 rounded-xl bg-secondary p-1">
          {(
            [
              { label: "유형별", seg: "type" },
              { label: "국가별", seg: "country" },
              { label: "산업별", seg: "sector" },
            ] as const
          ).map((t) => (
            <Link
              key={t.seg}
              href={`/allocation/${t.seg}`}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                tag === t.seg
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight">{pageTitle}</h1>

      {categories.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm text-muted-foreground">보유 자산이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 도넛 + 범례 */}
          <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
            <Donut slices={donutSlices} currency={data.currency} />
            <ul className="flex flex-1 flex-col gap-2">
              {donutSlices.map((c, i) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: donutColor(i) }}
                  />
                  <span className="truncate font-medium">{c.label}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {pct(c.weight)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 이 기준으로 목표비중·리밸런싱 — 유형은 계층형 종목별(/rebalance)이 담당 */}
          <Link
            href={tag === "type" ? "/rebalance" : `/rebalance/${tag}`}
            className="flex items-center justify-between rounded-2xl bg-card p-5 shadow-card transition active:scale-[0.99]"
          >
            <span className="text-sm font-semibold">
              {cfg.title.replace(" 자산배분", "")} 목표비중 · 리밸런싱
            </span>
            <span className="text-muted-foreground">›</span>
          </Link>

          {/* 카테고리별 구성종목 */}
          {!onlyLabel ? (
            // 전체 뷰: 컴팩트 카드 → 탭 → 드랍시트
            <CategoryDrawer
              categories={categories as DrawerCategory[]}
              tag={tag}
              currency={data.currency}
            />
          ) : (
            // ?only= 직접 URL 접근: 기존 확장 뷰 유지
            categories.map((c, i) => (
              <section key={c.label} className="rounded-2xl bg-card p-5 shadow-card">
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: donutColor(i) }} />
                  {c.label === "현금" ? (
                    <Link href="/cash" className="text-sm font-semibold">현금 ›</Link>
                  ) : (
                    <p className="text-sm font-semibold">{c.label}</p>
                  )}
                  <span className="ml-auto text-sm tabular-nums text-muted-foreground">
                    {pct(c.weight)} · {money(c.value, data.currency)}
                  </span>
                </div>
                {c.items.length === 0 ? (
                  c.label === "현금" ? (
                    <CashBreakdown pools={cashPools} />
                  ) : (
                    <p className="py-1 text-sm text-muted-foreground">현금 잔고입니다.</p>
                  )
                ) : tag === "sector" && onlyLabel ? (
                  <ul className="flex flex-col gap-1">
                    {c.items.map((it) => (
                      <li key={it.symbol}>
                        <ItemRow it={it} catValue={c.value} currency={data.currency} />
                      </li>
                    ))}
                  </ul>
                ) : tag === "country" && onlyLabel && tabItems && onlyAssetTypes ? (
                  <div className="flex flex-col gap-3">
                    {onlyAssetTypes.length > 1 && (
                      <nav className="flex gap-1 rounded-xl bg-secondary p-1">
                        {onlyAssetTypes.map((t) => (
                          <Link
                            key={t}
                            href={`/allocation/country?only=${encodeURIComponent(onlyLabel)}&tab=${encodeURIComponent(t)}`}
                            className={cn(
                              "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                              t === resolvedTab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                            )}
                          >
                            {t}
                          </Link>
                        ))}
                      </nav>
                    )}
                    <ul className="flex flex-col gap-1">
                      {tabItems.map((it) => (
                        <li key={it.symbol}>
                          <ItemRow it={it} catValue={tabValue} currency={data.currency} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : tag === "country" ? (
                  <ItemsByType items={c.items} catValue={c.value} currency={data.currency} />
                ) : tag === "type" && c.label === "주식" ? (
                  <ItemsByCountry items={c.items} catValue={c.value} currency={data.currency} />
                ) : tag === "type" && c.label === "ETF" ? (
                  <EtfItemsWithCountry items={c.items} catValue={c.value} currency={data.currency} />
                ) : (
                  <ul className="flex flex-col gap-1">
                    {c.items.map((it) => {
                      const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
                      return (
                        <li key={it.symbol}>
                          <StockRow
                            symbol={it.symbol}
                            name={it.name}
                            href={`/stocks/${it.symbol}`}
                            sub={`${pct(c.value > 0 ? it.value / c.value : 0)} of ${c.label}`}
                            right={
                              <span className="ml-auto flex flex-col items-end">
                                <span className="font-semibold tabular-nums">{money(it.value, data.currency)}</span>
                                {gain !== null && it.changeRate !== null && (
                                  <span className="text-sm font-medium tabular-nums" style={{ color: changeColor(it.changeRate) }}>
                                    {signedMoneyShort(gain, data.currency)} {signedPct(it.changeRate)}
                                  </span>
                                )}
                              </span>
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))
          )}
        </>
      )}
    </main>
  );
}

type CurrencyType = import("@/lib/format").Currency;

function ItemRow({ it, catValue, currency }: { it: CategoryItem; catValue: number; currency: CurrencyType }) {
  const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
  return (
    <StockRow
      symbol={it.symbol}
      name={it.name}
      href={`/stocks/${it.symbol}`}
      sub={pct(catValue > 0 ? it.value / catValue : 0)}
      right={
        <span className="ml-auto flex flex-col items-end">
          <span className="font-semibold tabular-nums">{money(it.value, currency)}</span>
          {gain !== null && it.changeRate !== null && (
            <span className="text-sm font-medium tabular-nums" style={{ color: changeColor(it.changeRate) }}>
              {signedMoneyShort(gain, currency)} {signedPct(it.changeRate)}
            </span>
          )}
        </span>
      }
    />
  );
}

/** 유형별-주식 전용: 국가별 서브그룹(한국/미국/기타)으로 표시. */
function ItemsByCountry({ items, catValue, currency }: { items: CategoryItem[]; catValue: number; currency: CurrencyType }) {
  const byCountry = new Map<string, CategoryItem[]>();
  for (const it of items) {
    const c = it.country;
    byCountry.set(c, [...(byCountry.get(c) ?? []), it]);
  }
  const groups = [...byCountry.entries()].sort(
    (a, b) => b[1].reduce((s, x) => s + x.value, 0) - a[1].reduce((s, x) => s + x.value, 0)
  );
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([country, its]) => (
        <div key={country}>
          {groups.length > 1 && (
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {country} · {its.length}종목
            </p>
          )}
          <ul className="flex flex-col gap-1">
            {its.map((it) => <li key={it.symbol}><ItemRow it={it} catValue={catValue} currency={currency} /></li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 유형별-ETF 전용: 국가별 mini 요약 + 각 StockRow에 country 배지. */
function EtfItemsWithCountry({ items, catValue, currency }: { items: CategoryItem[]; catValue: number; currency: CurrencyType }) {
  const byCountry = new Map<string, number>();
  for (const it of items) byCountry.set(it.country, (byCountry.get(it.country) ?? 0) + it.value);
  const total = items.reduce((s, x) => s + x.value, 0);
  const countrySummary = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `${c} ${pct(total > 0 ? v / total : 0)}`)
    .join(" · ");
  return (
    <div className="flex flex-col gap-2">
      {countrySummary && (
        <p className="text-xs text-muted-foreground">{countrySummary}</p>
      )}
      <ul className="flex flex-col gap-1">
        {items.map((it) => {
          const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
          return (
            <li key={it.symbol}>
              <StockRow
                symbol={it.symbol}
                name={it.name}
                href={`/stocks/${it.symbol}`}
                sub={
                  <span className="flex items-center gap-1.5">
                    <span>{pct(catValue > 0 ? it.value / catValue : 0)}</span>
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                      {it.country}
                    </span>
                  </span>
                }
                right={
                  <span className="ml-auto flex flex-col items-end">
                    <span className="font-semibold tabular-nums">{money(it.value, currency)}</span>
                    {gain !== null && it.changeRate !== null && (
                      <span className="text-sm font-medium tabular-nums" style={{ color: changeColor(it.changeRate) }}>
                        {signedMoneyShort(gain, currency)} {signedPct(it.changeRate)}
                      </span>
                    )}
                  </span>
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** 국가별 뷰 전용: 동일 국가 items를 자산유형(주식/ETF/원자재/코인)별 서브그룹으로 표시. */
function ItemsByType({
  items,
  catValue,
  currency,
}: {
  items: CategoryItem[];
  catValue: number;
  currency: import("@/lib/format").Currency;
}) {
  const TYPE_ORDER = ["주식", "ETF", "원자재", "코인"];
  const byType = new Map<string, CategoryItem[]>();
  for (const it of items) {
    const t = it.assetType;
    const list = byType.get(t) ?? [];
    list.push(it);
    byType.set(t, list);
  }
  const groups = TYPE_ORDER.filter((t) => byType.has(t))
    .map((t) => ({ type: t, items: byType.get(t)! }));
  // 순서에 없는 유형도 뒤에 추가
  for (const [t, its] of byType.entries()) {
    if (!TYPE_ORDER.includes(t)) groups.push({ type: t, items: its });
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.type}>
          {groups.length > 1 && (
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{g.type}</p>
          )}
          <ul className="flex flex-col gap-1">
            {g.items.map((it) => {
              const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
              return (
                <li key={it.symbol}>
                  <StockRow
                    symbol={it.symbol}
                    name={it.name}
                    href={`/stocks/${it.symbol}`}
                    sub={pct(catValue > 0 ? it.value / catValue : 0)}
                    right={
                      <span className="ml-auto flex flex-col items-end">
                        <span className="font-semibold tabular-nums">
                          {money(it.value, currency)}
                        </span>
                        {gain !== null && it.changeRate !== null && (
                          <span
                            className="text-sm font-medium tabular-nums"
                            style={{ color: changeColor(it.changeRate) }}
                          >
                            {signedMoneyShort(gain, currency)}{" "}
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
        </div>
      ))}
    </div>
  );
}
