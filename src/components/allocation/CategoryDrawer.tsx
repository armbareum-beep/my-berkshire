"use client";
import { useState } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { StockRow } from "@/components/ui/StockRow";
import { Donut } from "@/components/dashboard/Donut";
import { donutColor } from "@/components/dashboard/donutPalette";
import { money, pct, signedMoneyShort, signedPct, changeColor, type Currency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TargetAdjuster } from "./TargetAdjuster";
import type { TagKey } from "@/lib/allocation";

export type DrawerItem = {
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
};

export type DrawerCategory = {
  label: string;
  value: number;
  weight: number;
  /** 구성 종목 목표의 합 0~1. */
  target: number;
  /** 현금 묶음 — 목표를 따로 정하지 않는다(안 채운 나머지가 현금). */
  isCash: boolean;
  /** 미분류·기타 — 구성이 유동적이라 묶음 조정에서 뺀다. */
  isUntagged: boolean;
  items: DrawerItem[];
};

/** 보는 기준 — 전체 자산 대비인가, 이 묶음 안에서인가. */
type Basis = "total" | "within";

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
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
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

/**
 * 한 종목의 현재·목표를 고른 기준으로 환산한다.
 *
 * 저장값은 늘 **전체 자산 대비**다. "이 묶음 안에서"는 분모만 묶음 합으로 바꾼 것이라
 * 저장값을 건드리지 않는다(`lib/targetLens.ts:withinBasis` 와 같은 규칙).
 */
function inBasis(
  it: DrawerItem,
  basis: Basis,
  totals: { value: number; target: number; catValue: number; catTarget: number },
) {
  if (basis === "within") {
    return {
      current: totals.catValue > 0 ? it.value / totals.catValue : 0,
      target: totals.catTarget > 0 ? it.target / totals.catTarget : 0,
    };
  }
  return {
    current: totals.value > 0 ? it.value / totals.value : 0,
    target: it.target,
  };
}

function ItemList({
  items,
  catValue,
  catTarget,
  total,
  basis,
  currency,
}: {
  items: DrawerItem[];
  catValue: number;
  catTarget: number;
  /** 전체 자산(현금 포함) — 전체 대비 기준의 분모. */
  total: number;
  basis: Basis;
  currency: Currency;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => {
        const gain = it.avgCost > 0 ? it.value - it.avgCost * it.quantity : null;
        const w = inBasis(it, basis, { value: total, target: 0, catValue, catTarget });
        return (
          <li key={it.symbol}>
            <StockRow
              symbol={it.symbol}
              name={it.name}
              href={`/stocks/${it.symbol}`}
              sub={
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums">{pct(w.current)}</span>
                  {w.target > 0 && (
                    <span className="tabular-nums text-muted-foreground">
                      / 목표 {pct(w.target)}
                    </span>
                  )}
                  {!it.held && (
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                      미보유
                    </span>
                  )}
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
  );
}

function SheetBody({
  cat,
  tag,
  currency,
  total,
  basis,
}: {
  cat: DrawerCategory;
  tag: string;
  currency: Currency;
  total: number;
  basis: Basis;
}) {
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
        <ItemList items={displayItems} catValue={displayValue} catTarget={displayItems.reduce((s, it) => s + it.target, 0)} total={total} basis={basis} currency={currency} />
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
            <ItemList items={its} catValue={cat.value} catTarget={cat.target} total={total} basis={basis} currency={currency} />
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
      <ItemList items={cat.items} catValue={cat.value} catTarget={cat.target} total={total} basis={basis} currency={currency} />
    </div>
  );
}

/**
 * 시트 한 장 — **목표 조정과 보는 기준을 맨 위에** 두고 그 아래 기존 구성 내용.
 *
 * 조회(무엇을 얼마나 들고 있나)와 설정(얼마나 들고 갈 건가)이 다른 화면에 있으면
 * "미국이 너무 많네" 판단하고도 고치러 나가야 한다. 그래서 한 시트에 붙인다.
 */
function SheetContent({
  cat,
  tag,
  tagKey,
  currency,
  total,
}: {
  cat: DrawerCategory;
  tag: string;
  tagKey: TagKey;
  currency: Currency;
  total: number;
}) {
  const [basis, setBasis] = useState<Basis>("total");

  const lockedReason = cat.isCash
    ? "현금은 따로 정하지 않아요 — 목표를 안 채운 나머지가 현금입니다."
    : cat.isUntagged
      ? `"${cat.label}"는 구성이 유동적이라 묶음으로 조정하지 않아요. 종목별로 정해주세요.`
      : undefined;

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="px-5">
        <TargetAdjuster
          tagKey={tagKey}
          label={cat.label}
          current={cat.weight}
          target={cat.target}
          lockedReason={lockedReason}
        />
      </div>

      {/* 같은 숫자를 두 기준으로 본다 — 저장값은 늘 전체 대비다. */}
      {!cat.isCash && cat.items.length > 1 && (
        <div className="px-5">
          <nav className="flex gap-1 rounded-xl bg-secondary p-1">
            {(
              [
                ["total", "전체 대비"],
                ["within", `${cat.label} 안에서`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBasis(key)}
                aria-pressed={basis === key}
                className={cn(
                  "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                  basis === key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      )}

      <SheetBody
        cat={cat}
        tag={tag}
        currency={currency}
        total={total}
        basis={basis}
      />
    </div>
  );
}

export function CategoryDrawer({
  categories,
  tag,
  tagKey,
  currency,
  total,
}: {
  categories: DrawerCategory[];
  tag: string;
  /** 묶음 조정에 쓰는 렌즈 키 — 라우트 세그먼트(type)와 다르다(assetType). */
  tagKey: TagKey;
  currency: Currency;
  /** 전체 자산(현금 포함). "전체 대비" 기준의 분모. */
  total: number;
}) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const openCat = categories.find((c) => c.label === openLabel) ?? null;

  return (
    <>
      <div className="flex flex-col gap-3">
        {categories.map((c, i) => {
          const gap = c.target - c.weight;
          return (
            <button
              key={c.label}
              onClick={() => setOpenLabel(c.label)}
              className="w-full rounded-2xl bg-card p-5 text-left shadow-card transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: donutColor(i) }}
                />
                <span className="text-sm font-semibold">{c.label}</span>
                <span className="ml-auto flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
                  {pct(c.weight)}
                  <span className="text-xs">·</span>
                  {money(c.value, currency)}
                  <span className="ml-1 text-foreground/40">›</span>
                </span>
              </div>
              {/* 목표는 종목 목표비중을 이 기준으로 묶은 값이다(따로 저장하지 않는다). */}
              {c.target > 0 && (
                <p className="mt-1 pl-5 text-xs tabular-nums text-muted-foreground">
                  목표 {pct(c.target)}
                  {Math.abs(gap) >= 0.0001 && (
                    <span className="ml-1">
                      · {gap > 0 ? `${pct(gap)} 부족` : `${pct(-gap)} 초과`}
                    </span>
                  )}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <BottomSheet
        open={!!openLabel}
        onClose={() => setOpenLabel(null)}
        title={openLabel ?? undefined}
      >
        {openCat && (
          <SheetContent
            key={openCat.label}
            cat={openCat}
            tag={tag}
            tagKey={tagKey}
            currency={currency}
            total={total}
          />
        )}
      </BottomSheet>
    </>
  );
}
