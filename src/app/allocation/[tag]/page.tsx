import Link from "next/link";
import { PieChart } from "lucide-react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolio } from "@/lib/portfolio";
import { computeDashboard } from "@/lib/dashboard";
import { loadSecurityMeta, backfillSectors } from "@/lib/securities";
import { companyCashPools } from "@/lib/finance/valuation";
import { tagLabel } from "@/lib/allocation";
import { readTargets } from "@/lib/targetWeights";
import { cashKey, isCashKey } from "@/lib/targetLens";
import { getFxToKrw } from "@/lib/finance/fx";
import { currencyMeta } from "@/lib/finance/currencies";
import { BackButton } from "@/components/BackButton";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { StockRow } from "@/components/ui/StockRow";
import { CashBreakdown } from "@/components/dashboard/CashBreakdown";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, signedMoneyShort, signedPct, changeColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryDrawer, type DrawerCategory } from "@/components/allocation/CategoryDrawer";
import { AllocationTabs } from "@/components/allocation/AllocationTabs";
import { EmptyState } from "@/components/ui/EmptyState";

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
  /** 전체 자산 대비 목표비중 0~1. 안 정했으면 0. */
  target: number;
  /** 한 주라도 들고 있나. 목표만 있고 아직 안 산 종목은 false. */
  held: boolean;
}
interface Category {
  label: string;
  value: number;
  weight: number; // 0~1 전체 대비
  /** 구성 종목 목표의 합 0~1. */
  target: number;
  isCash: boolean;
  isUntagged: boolean;
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

  // 국가·산업 목표를 따로 저장하지 않는다. 그러면 같은 것을 두 곳에서 정하게 되어
  // 은퇴시킨 2층 구조가 되돌아온다(스펙 §13.2). 진실은 종목 목표비중 하나뿐이고,
  // 국가·산업은 그걸 묶어서 보는 **렌즈**다.
  //
  // 보유하지 않은 종목의 목표도 포함해야 한다 — "아직 안 샀지만 미국 20% 목표"가
  // 빠지면 목표 합이 실제와 달라진다. 그래서 meta 를 목표 심볼까지 넓혀 읽는다.
  const flatTargets = readTargets(
    portfolio.holding.target_weights,
    (portfolio.holding.category_targets ?? {}) as Record<string, number>,
    data.allocation.map((a) => ({
      symbol: a.symbol,
      assetType: meta[a.symbol]?.assetType ?? "주식",
    })),
  );
  const targetSymbols = Object.keys(flatTargets).filter((sym) => !meta[sym]);
  if (targetSymbols.length > 0) {
    const extra = await loadSecurityMeta(supabase, targetSymbols);
    for (const [sym, rec] of Object.entries(extra)) if (rec) meta[sym] = rec;
  }

  // 카테고리별 합산 + 구성종목
  const map = new Map<string, Category>();
  for (const a of data.allocation) {
    const label = tagLabel(meta[a.symbol], cfg.key);
    const cat = map.get(label) ?? { label, value: 0, weight: 0, target: 0, isCash: label === "현금", isUntagged: label === "미분류" || label === "기타", items: [] };
    cat.value += a.value;
    cat.items.push({ symbol: a.symbol, name: a.name, value: a.value, avgCost: a.avgCost, quantity: a.quantity, changeRate: a.changeRate, assetType: meta[a.symbol]?.assetType ?? "주식", country: meta[a.symbol]?.country ?? "기타", target: flatTargets[a.symbol]?.target ?? 0, held: true });
    map.set(label, cat);
  }
  // ── 현금 슬라이스 — 통화별로 쪼갠다 ──
  //
  // 달러·엔·원화를 얼마나 들고 갈지도 배분 결정이다. 한 덩어리로 두면 목표를 매길 수가
  // 없어서 통화마다 한 줄로 세운다. 목표 키는 `CASH:USD` 예약 키(`lib/targetLens.ts`)라
  // 저장 형식은 평면 그대로다.
  //
  // 통화 잔액은 **네이티브**(₩·$·¥)라 그대로 더할 수 없다. 현재 환율로 ₩ 환산한 뒤,
  // 그 비율로 `data.cash`(표시통화 합계)를 나눈다 — 합계가 대시보드와 어긋나지 않는다.
  if (data.cash > 0) {
    const cash = map.get("현금") ?? { label: "현금", value: 0, weight: 0, target: 0, isCash: true, isUntagged: false, items: [] };
    cash.value += data.cash;

    const held = Object.entries(cashPools).filter(([, v]) => Math.abs(v) > 0.005);
    const fx = await getFxToKrw(held.map(([c]) => c));
    // 환율을 못 받은 통화는 뺀다 — 0으로 넣으면 비중이 조용히 틀어진다.
    const priced = held
      .map(([ccy, native]) => ({ ccy, krw: native * (fx[ccy] ?? 0) }))
      .filter((x) => fx[x.ccy] != null && x.krw > 0);
    const krwTotal = priced.reduce((s, x) => s + x.krw, 0);

    for (const { ccy, krw } of priced) {
      cash.items.push({
        symbol: cashKey(ccy),
        name: `${currencyMeta(ccy).name} 현금`,
        value: krwTotal > 0 ? data.cash * (krw / krwTotal) : 0,
        avgCost: 0,
        quantity: 0,
        changeRate: null,
        assetType: "현금",
        country: "기타",
        target: flatTargets[cashKey(ccy)]?.target ?? 0,
        held: true,
      });
    }
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

  // ── 카테고리별 목표비중 — **종목 목표에서 파생한다** ──
  //
  const targetByLabel = new Map<string, number>();
  let targetSum = 0;
  for (const [sym, rule] of Object.entries(flatTargets)) {
    // 통화 목표는 종목 메타가 없다 — 태그를 물으면 "기타"·"미분류"로 잘못 떨어진다.
    const label = isCashKey(sym) ? "현금" : tagLabel(meta[sym], cfg.key);
    targetByLabel.set(label, (targetByLabel.get(label) ?? 0) + rule.target);
    targetSum += rule.target;
  }
  // 목표 합이 100% 미만이면 나머지는 현금이라는 뜻이다(스펙 §16.2).
  if (targetSum < 1 - 1e-9) targetByLabel.set("현금", (targetByLabel.get("현금") ?? 0) + (1 - targetSum));
  const hasTargets = targetSum > 0;

  // ── 목표를 묶음·종목에 얹는다 ──
  // 조회(무엇을 얼마나 들고 있나)와 설정(얼마나 들고 갈 건가)이 다른 화면에 있으면
  // "미국이 너무 많네" 하고 판단해도 고치러 나가야 한다. 그래서 한 화면에서 다룬다.
  //
  // 보유하지 않은 목표 종목도 묶음에 넣는다 — 빠지면 "미국 60%"를 맞출 때 아직 안 산
  // 미국 기업이 계산에서 누락된다.
  const heldSet = new Set(data.allocation.map((a) => a.symbol));
  const unheldByLabel = new Map<string, CategoryItem[]>();
  for (const [sym, rule] of Object.entries(flatTargets)) {
    if (heldSet.has(sym) || isCashKey(sym) || rule.target <= 0) continue;
    const label = tagLabel(meta[sym], cfg.key);
    const list = unheldByLabel.get(label) ?? [];
    list.push({
      symbol: sym,
      name: meta[sym]?.name ?? sym,
      value: 0,
      avgCost: 0,
      quantity: 0,
      changeRate: null,
      assetType: meta[sym]?.assetType ?? "주식",
      country: meta[sym]?.country ?? "기타",
      target: rule.target,
      held: false,
    });
    unheldByLabel.set(label, list);
  }

  const withTargets: Category[] = allCategories.map((c) => {
    const extra = unheldByLabel.get(c.label) ?? [];
    unheldByLabel.delete(c.label);
    return {
      ...c,
      target: targetByLabel.get(c.label) ?? 0,
      items: [...c.items, ...extra],
    };
  });
  // 아직 한 주도 없지만 목표만 있는 묶음(예: "대만 5%")도 보여야 한다.
  for (const [label, items] of unheldByLabel) {
    withTargets.push({
      label,
      value: 0,
      weight: 0,
      target: targetByLabel.get(label) ?? 0,
      isCash: false,
      isUntagged: label === "미분류" || label === "기타",
      items,
    });
  }

  // ?only=한국 → 해당 국가만 표시 (홈 카드 국가 탭에서 진입)
  const categories = onlyLabel
    ? withTargets.filter((c) => c.label === onlyLabel)
    : withTargets;

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
      {!onlyLabel && <AllocationTabs active={tag} />}
      <h1 className="text-2xl font-extrabold tracking-tight">{pageTitle}</h1>

      {categories.length === 0 ? (
        <EmptyState icon={PieChart} title="보유 자산이 없어요" />
      ) : (
        <>
          {/* 도넛 + 범례 */}
          <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
            <Donut slices={donutSlices} currency={data.currency} />
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
              {donutSlices.map((c, i) => (
                <li key={c.label} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: donutColor(i) }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {pct(c.weight)}
                    {/* 목표는 종목 목표비중을 이 기준으로 묶은 값이다(따로 정하지 않는다). */}
                    {hasTargets && !tabItems && targetByLabel.has(c.label) && (
                      <span className="ml-1 text-[11px]">
                        / 목표 {pct(targetByLabel.get(c.label) as number)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 목표비중·리밸런싱 버튼이 있던 자리. 국가별·산업별 목표비중은 은퇴했고
              (/rebalance/[tag] 는 이제 이 화면으로 되돌아온다) 목표비중은 종목당 숫자
              하나로 /allocate/settings 에서 정한다. 제자리를 도는 버튼이라 지웠다. */}
          {/* 카테고리별 구성종목 */}
          {!onlyLabel ? (
            // 전체 뷰: 컴팩트 카드 → 탭 → 드랍시트
            <CategoryDrawer
              categories={categories as DrawerCategory[]}
              tag={tag}
              tagKey={cfg.key}
              total={total}
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
