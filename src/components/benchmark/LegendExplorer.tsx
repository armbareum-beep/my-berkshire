"use client";

import { useState } from "react";
import Link from "next/link";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { Donut } from "@/components/dashboard/Donut";
import { money, pct, type Currency } from "@/lib/format";
import {
  LEGENDS,
  changeOf,
  type Legend,
  type LegendHolding,
} from "@/lib/finance/legends";

type Tab = "all" | "buy" | "sell";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "포트폴리오" },
  { key: "buy", label: "매수" },
  { key: "sell", label: "매도" },
];

/**
 * 거장 포트폴리오(13F) 탐색 — 더리치식. 아바타 선택 → 도넛 + 보유목록 + 매수/매도 탭.
 * 종목별 수익률은 표시 안 함(13F에 취득가 없음 → 정직). "내 보유" 겹침 배지.
 */
export function LegendExplorer({
  prices,
  currencies,
  held,
}: {
  prices: Record<string, number>;
  currencies: Record<string, string>;
  /** 내 보유 종목코드(겹침 배지용). */
  held: string[];
}) {
  const [key, setKey] = useState(LEGENDS[0]?.key ?? "");
  const [tab, setTab] = useState<Tab>("all");
  const legend: Legend | undefined =
    LEGENDS.find((l) => l.key === key) ?? LEGENDS[0];
  if (!legend) return null;

  const heldSet = new Set(held);
  const owned = legend.holdings.filter((h) => h.weight > 0);
  const shown =
    tab === "all"
      ? [...owned].sort((a, b) => b.weight - a.weight)
      : tab === "buy"
        ? legend.holdings
            .filter((h) => ["신규", "추가"].includes(changeOf(h)))
            .sort((a, b) => b.weight - b.prevWeight - (a.weight - a.prevWeight))
        : legend.holdings
            .filter((h) => ["축소", "청산"].includes(changeOf(h)))
            .sort((a, b) => b.prevWeight - b.weight - (a.prevWeight - a.weight));

  // 도넛: 상위 보유 + 기타.
  const top = [...owned].sort((a, b) => b.weight - a.weight).slice(0, 8);
  const rest = Math.max(0, 1 - top.reduce((s, h) => s + h.weight, 0));
  const slices = [
    ...top.map((h) => ({ label: h.ticker, weight: h.weight })),
    ...(rest > 0.001 ? [{ label: "기타", weight: rest }] : []),
  ];

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm font-semibold">거장 포트폴리오</p>

      {/* 거장 아바타 가로 스크롤 */}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-2">
        {LEGENDS.map((l) => {
          const on = l.key === legend.key;
          return (
            <button
              key={l.key}
              type="button"
              onClick={() => {
                setKey(l.key);
                setTab("all");
              }}
              className="flex shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
            >
              <span
                className={
                  "flex h-14 w-14 items-center justify-center rounded-full text-lg font-extrabold " +
                  (on
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "bg-secondary text-secondary-foreground")
                }
              >
                {l.name.slice(0, 1)}
              </span>
              <span
                className={
                  "max-w-16 truncate text-xs " +
                  (on ? "font-bold" : "text-muted-foreground")
                }
              >
                {l.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택 거장 카드 */}
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="font-bold">{legend.firm}</p>
          <p className="text-xs text-muted-foreground">{legend.quarterLabel}</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          장기 연환산{" "}
          {legend.longReturn ? (
            <>
              <span className="font-semibold text-foreground">
                {pct(legend.longReturn.annual)}
              </span>{" "}
              · {legend.longReturn.period}
            </>
          ) : (
            "— (공개 자료 준비 중)"
          )}
        </p>

        {/* 도넛 */}
        <div className="mt-4 flex justify-center">
          <Donut slices={slices} />
        </div>

        {/* 탭 */}
        <div className="mt-4 flex gap-1 rounded-xl bg-secondary p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "flex-1 rounded-lg py-1.5 text-xs font-semibold transition " +
                (tab === t.key
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 보유목록 */}
        <ul className="mt-3 flex flex-col">
          {shown.length === 0 ? (
            <li className="py-3 text-center text-sm text-muted-foreground">
              {tab === "buy" ? "이번 분기 신규·추가 없음" : "이번 분기 축소·청산 없음"}
            </li>
          ) : (
            shown.map((h) => (
              <HoldingRow
                key={h.ticker}
                h={h}
                price={prices[h.ticker]}
                currency={currencies[h.ticker]}
                owned={heldSet.has(h.ticker)}
              />
            ))
          )}
        </ul>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {legend.source} · 미국 상장 롱 포지션만(현금·채권·해외·공매도 제외) · 공시
        45일 지연. 취득가가 공개되지 않아 종목별 수익률은 표시하지 않습니다.
      </p>
    </section>
  );
}

function HoldingRow({
  h,
  price,
  currency,
  owned,
}: {
  h: LegendHolding;
  price: number | undefined;
  currency: string | undefined;
  owned: boolean;
}) {
  const kind = changeOf(h);
  const d = h.weight - h.prevWeight;
  const color =
    kind === "신규" || kind === "추가"
      ? "var(--rise)"
      : kind === "축소" || kind === "청산"
        ? "var(--fall)"
        : "var(--muted-foreground)";
  const ccy: Currency = currency === "USD" ? "USD" : "KRW";

  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={`/stocks/${h.ticker}`}
        className="flex items-center gap-3 py-2.5 transition active:scale-[0.99]"
      >
        <SymbolAvatar name={h.name} symbol={h.ticker} />
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{h.name}</span>
            {owned && (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                내 보유
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{h.ticker}</span>
        </span>
        <span className="ml-auto flex flex-col items-end">
          <span className="text-sm font-bold tabular-nums">{pct(h.weight)}</span>
          <span className="text-xs tabular-nums" style={{ color }}>
            {kind === "유지"
              ? "유지"
              : `${kind} ${d !== 0 ? `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}p` : ""}`}
          </span>
        </span>
        <span className="ml-2 w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {price != null ? money(price, ccy) : "—"}
        </span>
      </Link>
    </li>
  );
}
