"use client";
import { useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StockRow } from "@/components/ui/StockRow";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, signedMoneyShort, signedPct, changeColor, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DrawerItem = {
  symbol: string;
  name: string;
  value: number;
  avgCost: number;
  quantity: number;
  changeRate: number | null;
  assetType: string;
  country: string;
};

export type DrawerCategory = {
  label: string;
  value: number;
  weight: number;
  items: DrawerItem[];
};

function makeDonutSlices(items: DrawerItem[], total: number) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, 8);
  const restVal = sorted.slice(8).reduce((s, it) => s + it.value, 0);
  return [
    ...top.map((it) => ({ label: it.name, weight: total > 0 ? it.value / total : 0, value: it.value })),
    ...(restVal > 0 ? [{ label: "기타", weight: total > 0 ? restVal / total : 0, value: restVal }] : []),
  ];
}

function DonutSection({ items, total, currency }: { items: DrawerItem[]; total: number; currency: Currency }) {
  if (items.length === 0) return null;
  const slices = makeDonutSlices(items, total);
  return (
    <section className="flex items-center gap-5 rounded-2xl bg-card p-5 shadow-card">
      <Donut slices={slices} currency={currency} />
      <ul className="flex flex-1 flex-col gap-2">
        {slices.slice(0, 5).map((s, i) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: donutColor(i) }} />
            <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{pct(s.weight)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemList({ items, catValue, currency }: { items: DrawerItem[]; catValue: number; currency: Currency }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => {
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
  );
}

function SheetContent({ cat, tag, currency }: { cat: DrawerCategory; tag: string; currency: Currency }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (cat.label === "현금") {
    return (
      <div className="flex flex-col gap-3 px-5 pb-8 pt-3">
        <p className="text-3xl font-bold tabular-nums">{money(cat.value, currency)}</p>
        <Link href="/cash" className="text-sm font-medium text-primary">현금 상세 보기 ›</Link>
      </div>
    );
  }

  if (cat.items.length === 0) {
    return <div className="px-5 pb-8 pt-3 text-sm text-muted-foreground">내용이 없습니다.</div>;
  }

  // 국가별: 주식/ETF 서브탭
  if (tag === "country") {
    const assetTypes = [...new Set(cat.items.map((it) => it.assetType))].sort();
    const resolved = assetTypes.includes(activeTab ?? "") ? (activeTab as string) : assetTypes[0];
    const displayItems = cat.items.filter((it) => it.assetType === resolved);
    const displayValue = displayItems.reduce((s, it) => s + it.value, 0);
    return (
      <div className="flex flex-col gap-3 px-5 pb-8 pt-3">
        <DonutSection items={displayItems} total={displayValue} currency={currency} />
        {assetTypes.length > 1 && (
          <nav className="flex gap-1 rounded-xl bg-secondary p-1">
            {assetTypes.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                  t === resolved ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </nav>
        )}
        <ItemList items={displayItems} catValue={displayValue} currency={currency} />
      </div>
    );
  }

  // 유형별-주식: 국가별 서브그룹
  if (tag === "type" && cat.label === "주식") {
    const byCountry = new Map<string, DrawerItem[]>();
    for (const it of cat.items) byCountry.set(it.country, [...(byCountry.get(it.country) ?? []), it]);
    const groups = [...byCountry.entries()].sort(
      (a, b) => b[1].reduce((s, x) => s + x.value, 0) - a[1].reduce((s, x) => s + x.value, 0),
    );
    return (
      <div className="flex flex-col gap-3 px-5 pb-8 pt-3">
        <DonutSection items={cat.items} total={cat.value} currency={currency} />
        {groups.map(([country, its]) => (
          <div key={country}>
            {groups.length > 1 && (
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{country} · {its.length}종목</p>
            )}
            <ItemList items={its} catValue={cat.value} currency={currency} />
          </div>
        ))}
      </div>
    );
  }

  // 유형별-ETF: 국가 배지
  if (tag === "type" && cat.label === "ETF") {
    const byCountry = new Map<string, number>();
    for (const it of cat.items) byCountry.set(it.country, (byCountry.get(it.country) ?? 0) + it.value);
    const total = cat.items.reduce((s, x) => s + x.value, 0);
    const countrySummary = [...byCountry.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([c, v]) => `${c} ${pct(total > 0 ? v / total : 0)}`)
      .join(" · ");
    return (
      <div className="flex flex-col gap-3 px-5 pb-8 pt-3">
        <DonutSection items={cat.items} total={cat.value} currency={currency} />
        {countrySummary && <p className="text-xs text-muted-foreground">{countrySummary}</p>}
        <ul className="flex flex-col gap-1">
          {cat.items.map((it) => {
            const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
            return (
              <li key={it.symbol}>
                <StockRow
                  symbol={it.symbol}
                  name={it.name}
                  href={`/stocks/${it.symbol}`}
                  sub={
                    <span className="flex items-center gap-1.5">
                      <span>{pct(cat.value > 0 ? it.value / cat.value : 0)}</span>
                      <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">{it.country}</span>
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

  // 기본 (산업별 등): 평면 목록
  return (
    <div className="flex flex-col gap-3 px-5 pb-8 pt-3">
      <DonutSection items={cat.items} total={cat.value} currency={currency} />
      <ItemList items={cat.items} catValue={cat.value} currency={currency} />
    </div>
  );
}

export function CategoryDrawer({
  categories,
  tag,
  currency,
}: {
  categories: DrawerCategory[];
  tag: string;
  currency: Currency;
}) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const openCat = categories.find((c) => c.label === openLabel) ?? null;

  return (
    <>
      <div className="flex flex-col gap-3">
        {categories.map((c, i) => (
          <button
            key={c.label}
            onClick={() => setOpenLabel(c.label)}
            className="flex w-full items-center gap-2 rounded-2xl bg-card p-5 shadow-card text-left transition active:scale-[0.99]"
          >
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: donutColor(i) }} />
            <span className="text-sm font-semibold">{c.label}</span>
            <span className="ml-auto flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
              {pct(c.weight)}
              <span className="text-xs">·</span>
              {money(c.value, currency)}
              <span className="ml-1 text-foreground/40">›</span>
            </span>
          </button>
        ))}
      </div>

      <BottomSheet open={!!openLabel} onClose={() => setOpenLabel(null)} title={openLabel ?? undefined}>
        {openCat && <SheetContent key={openCat.label} cat={openCat} tag={tag} currency={currency} />}
      </BottomSheet>
    </>
  );
}
