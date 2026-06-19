"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  QuickAdd,
  WON_STEPS,
  wonStepLabel,
  usdStepLabel,
} from "@/components/ui/QuickAdd";
import { setCategoryTargets, saveRebalancePlan } from "@/app/rebalance/actions";
import { planInvestment } from "@/lib/rebalance";
import { money, type Currency } from "@/lib/format";

export interface CategoryItem {
  symbol: string;
  name: string;
  value: number;
  /** 주당 현재가(표시 통화). 매수 주수 계산용. */
  price: number;
}
export interface Category {
  label: string;
  value: number;
  weight: number; // 0~1 전체 대비
  targetWeight: number; // 0~1 (저장된 목표)
  items: CategoryItem[];
}

const USD_STEPS = [100, 1_000, 10_000];

export function CategoryRebalanceEditor({
  dimension,
  categories,
  currency,
}: {
  dimension: "country" | "assetType" | "sector";
  categories: Category[];
  currency: Currency;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const from = encodeURIComponent(pathname);
  const [pending, startTransition] = useTransition();

  const [targets, setTargets] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      categories.map((c) => [
        c.label,
        c.targetWeight > 0 ? String(Math.round(c.targetWeight * 100)) : "",
      ]),
    ),
  );
  const [invest, setInvest] = useState("");

  // 저장된 목표와 현재 입력이 다를 때만 저장 버튼 노출(dirty)
  const savedTargets: Record<string, string> = Object.fromEntries(
    categories.map((c) => [
      c.label,
      c.targetWeight > 0 ? String(Math.round(c.targetWeight * 100)) : "",
    ]),
  );
  const dirty = Object.keys(savedTargets).some(
    (k) => (targets[k] ?? "") !== savedTargets[k],
  );

  const totalPct = categories.reduce(
    (s, c) => s + (Number(targets[c.label]) || 0),
    0,
  );
  const overAllocated = totalPct > 100;

  const investN = Number(invest) || 0;
  const plan = planInvestment(
    categories.map((c) => ({
      key: c.label,
      label: c.label,
      value: c.value,
      targetFrac: (Number(targets[c.label]) || 0) / 100,
    })),
    investN,
  );
  const amountOf = (label: string) =>
    plan.find((p) => p.key === label)?.amount ?? 0;

  // 계획 저장용 종목 레그(카테고리 배분 → 종목별 주수)
  const planLegs = categories.flatMap((c) => {
    if (c.label === "현금" || c.value <= 0) return [];
    const amount = amountOf(c.label);
    if (amount <= 0) return [];
    return c.items
      .map((it) => {
        const itAmount = (amount * it.value) / c.value;
        const shares = it.price > 0 ? Math.floor(itAmount / it.price) : 0;
        return { symbol: it.symbol, name: it.name, shares };
      })
      .filter((l) => l.shares > 0);
  });

  function savePlan() {
    startTransition(async () => {
      const res = await saveRebalancePlan(planLegs);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("자본배분 계획으로 저장됨");
        router.refresh();
      }
    });
  }

  function save() {
    const map: Record<string, number> = {};
    for (const c of categories) {
      const v = Number(targets[c.label]);
      if (v > 0) map[c.label] = v / 100;
    }
    startTransition(async () => {
      const res = await setCategoryTargets(dimension, map);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("목표비중 저장됨");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {categories.map((c) => {
          const targetPct = Number(targets[c.label]) || 0;
          const drift = c.weight * 100 - targetPct;
          const set = targets[c.label] !== "" && targetPct > 0;
          return (
            <li
              key={c.label}
              className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card"
            >
              <div className="flex flex-col">
                <span className="font-bold">{c.label}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  현재 {(c.weight * 100).toFixed(0)}%
                  {set && (
                    <>
                      {" · "}
                      {drift >= 0
                        ? `+${drift.toFixed(0)}%p 초과`
                        : `${Math.abs(drift).toFixed(0)}%p 부족`}
                    </>
                  )}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  placeholder="목표"
                  value={targets[c.label]}
                  onChange={(e) =>
                    setTargets((t) => ({ ...t, [c.label]: e.target.value }))
                  }
                  className="h-10 w-16 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </li>
          );
        })}
      </ul>

      {dirty && (
        <>
          <p
            className="text-center text-sm tabular-nums"
            style={{
              color: totalPct === 100 ? "var(--muted-foreground)" : "var(--warn)",
            }}
          >
            목표 합계 {totalPct}%
            {overAllocated
              ? " — 100%를 넘을 수 없습니다"
              : totalPct !== 100 && " — 100%를 권장"}
          </p>

          <Button
            onClick={save}
            disabled={pending || overAllocated}
            className="h-12 w-full bg-primary font-semibold text-primary-foreground"
          >
            {pending ? "저장 중…" : overAllocated ? "합계 100% 초과" : "목표비중 저장"}
          </Button>
        </>
      )}

      {/* 카테고리 리밸런싱 계산기 */}
      <div className="mt-4 rounded-2xl bg-card p-5 shadow-card">
        <p className="text-sm font-semibold">얼마 넣으면 어디에 살까?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          넣을 금액을 카테고리 목표비중에 맞춰 부족한 쪽에 배분해 드려요. 카테고리 안에서는
          현재 보유 비중대로 나눕니다.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder={currency === "USD" ? "예: 3000" : "예: 4000000"}
            value={invest}
            onChange={(e) => setInvest(e.target.value)}
            className="h-12 text-lg"
          />
          <span className="text-sm text-muted-foreground">
            {currency === "USD" ? "달러" : "원"}
          </span>
        </div>
        <QuickAdd
          value={invest}
          onChange={setInvest}
          steps={currency === "USD" ? USD_STEPS : WON_STEPS}
          label={currency === "USD" ? usdStepLabel : wonStepLabel}
        />

        {investN > 0 && totalPct > 0 && (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              종목을 누르면 그 수량으로 바로 매수 화면이 열려요.
            </p>
            <ul className="mt-2 flex flex-col gap-3">
            {categories.map((c) => {
              const amount = amountOf(c.label);
              if (amount <= 0) return null;
              const isCash = c.label === "현금";
              return (
                <li key={c.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {c.label}
                      {isCash && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          현금으로 남김
                        </span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {money(amount, currency)}
                    </span>
                  </div>
                  {/* 카테고리 내 종목 배분(현재 보유 비중 비례) — 주수 + 누르면 인수 */}
                  {!isCash && c.value > 0 && c.items.length > 0 && (
                    <ul className="ml-1 flex flex-col gap-1">
                      {c.items.map((it) => {
                        const itAmount = (amount * it.value) / c.value;
                        const shares =
                          it.price > 0 ? Math.floor(itAmount / it.price) : 0;
                        const row = (
                          <>
                            <span>{it.name}</span>
                            <span className="ml-auto tabular-nums text-muted-foreground">
                              {shares.toLocaleString()}주 · {money(itAmount, currency)}
                            </span>
                            {shares > 0 && (
                              <span className="text-muted-foreground">›</span>
                            )}
                          </>
                        );
                        return shares > 0 ? (
                          <li key={it.symbol}>
                            <Link
                              href={`/transactions?type=BUY&symbol=${encodeURIComponent(
                                it.symbol,
                              )}&qty=${shares}&from=${from}`}
                              className="flex items-center gap-2 text-sm transition active:scale-[0.99]"
                            >
                              {row}
                            </Link>
                          </li>
                        ) : (
                          <li
                            key={it.symbol}
                            className="flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            {row}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
            </ul>
            {planLegs.length > 0 && (
              <>
                <Button
                  onClick={savePlan}
                  disabled={pending}
                  className="mt-4 h-12 w-full bg-primary font-semibold text-primary-foreground"
                >
                  📋 이 계획 세우기
                </Button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  세워두면 홈에서 진행을 추적하고, 까먹지 않게 알려드려요.
                </p>
              </>
            )}
            <Link
              href={`/transactions?type=BUY&from=${from}`}
              className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground"
            >
              계획 없이 바로 매수
            </Link>
          </>
        )}
        {investN > 0 && totalPct === 0 && (
          <p className="mt-3 text-sm text-rise">먼저 목표비중을 설정하세요.</p>
        )}
      </div>
    </div>
  );
}
