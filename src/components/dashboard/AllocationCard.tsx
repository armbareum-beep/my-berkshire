"use client";
import { useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SectionCard } from "@/components/ui/SectionCard";
import { StockRow } from "@/components/ui/StockRow";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, signedMoneyShort, signedPct, changeColor, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TagSlice } from "@/lib/allocation";

export type CountrySheetItem = {
  symbol: string;
  name: string;
  value: number;
  avgCost: number;
  quantity: number;
  changeRate: number | null;
  assetType: string;
};

export function AllocationCard({
  slices,
  itemsByCountry,
  currency = "KRW",
}: {
  slices: TagSlice[];
  itemsByCountry: Record<string, CountrySheetItem[]>;
  currency?: Currency;
}) {
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const filtered = slices.filter((s) => s.label !== "현금" && s.label !== "기타");
  const filteredTotal = filtered.reduce((s, x) => s + x.value, 0);
  const items = filtered.map((s) => ({
    ...s,
    weight: filteredTotal > 0 ? s.value / filteredTotal : 0,
  }));

  if (items.length === 0) return null;

  const openItems = (openCountry ? (itemsByCountry[openCountry] ?? []) : [])
    .slice()
    .sort((a, b) => b.value - a.value);
  const assetTypes = [...new Set(openItems.map((it) => it.assetType))].sort();
  const resolvedTab = assetTypes.includes(activeTab ?? "") ? (activeTab as string) : assetTypes[0] ?? null;
  const displayItems = resolvedTab ? openItems.filter((it) => it.assetType === resolvedTab) : openItems;
  const displayValue = displayItems.reduce((s, it) => s + it.value, 0);

  // 도넛 슬라이스 (탭 기준, 상위 8 + 기타)
  const sortedItems = [...displayItems].sort((a, b) => b.value - a.value);
  const topItems = sortedItems.slice(0, 8);
  const restVal = sortedItems.slice(8).reduce((s, it) => s + it.value, 0);
  const donutSlices = [
    ...topItems.map((it) => ({ label: it.name, weight: displayValue > 0 ? it.value / displayValue : 0, value: it.value })),
    ...(restVal > 0 ? [{ label: "기타", weight: displayValue > 0 ? restVal / displayValue : 0, value: restVal }] : []),
  ];

  return (
    <>
      <SectionCard
        title="자산 구성"
        action={
          <Link href="/allocation/type" scroll={false} className="text-sm text-muted-foreground transition active:opacity-70">
            ›
          </Link>
        }
      >
        <ul className="flex flex-col gap-2.5">
          {items.map((s) => (
            <li key={s.label}>
              <button
                onClick={() => { setOpenCountry(s.label); setActiveTab(null); }}
                className="block w-full text-left transition active:opacity-70"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-muted-foreground">{pct(s.weight)}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round(s.weight * 100))}%` }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <BottomSheet
        open={!!openCountry}
        onClose={() => { setOpenCountry(null); setActiveTab(null); }}
        title={openCountry ?? undefined}
      >
        <div className="flex flex-col gap-3 px-5 pb-8 pt-3">
          {/* 도넛 */}
          {donutSlices.length > 0 && (
            <section className="flex items-center gap-4 rounded-2xl bg-card p-4 shadow-card">
              <Donut slices={donutSlices} size={120} thickness={20} currency={currency} />
              <ul className="flex flex-1 flex-col gap-1.5">
                {donutSlices.slice(0, 5).map((s, i) => (
                  <li key={s.label} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: donutColor(i) }} />
                    <span className="truncate font-medium">{s.label}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">{pct(s.weight)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 주식/ETF 서브탭 */}
          {assetTypes.length > 1 && (
            <nav className="flex gap-1 rounded-xl bg-secondary p-1">
              {assetTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                    t === resolvedTab ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </nav>
          )}

          {/* 종목 목록 */}
          <ul className="flex flex-col gap-1">
            {displayItems.map((it) => {
              const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
              return (
                <li key={it.symbol}>
                  <StockRow
                    symbol={it.symbol}
                    name={it.name}
                    href={`/stocks/${it.symbol}`}
                    sub={pct(displayValue > 0 ? it.value / displayValue : 0)}
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
      </BottomSheet>
    </>
  );
}
