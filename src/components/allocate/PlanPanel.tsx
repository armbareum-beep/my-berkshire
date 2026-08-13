"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveRebalancePlan } from "@/app/rebalance/actions";
import { Input } from "@/components/ui/input";
import {
  QuickAdd,
  WON_STEPS,
  usdStepLabel,
  wonStepLabel,
} from "@/components/ui/QuickAdd";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { money, moneyCompact, pct, type Currency } from "@/lib/format";
import { planAllocation, type AllocateLeg } from "@/lib/allocate";
import type { AllocateRow } from "@/lib/allocateData";
import { STATUS_META } from "./statusMeta";

const USD_STEPS = [100, 1_000, 10_000];

/**
 * 배분 여정 — "이 돈을 어디에 얼마나 넣을까" 한 가지만 한다.
 *
 * 계산은 전부 `src/lib/allocate.ts:planAllocation` 이 한다(여긴 표시만).
 * 매도는 제안하지 않는다 — buy-only(스펙 §14.2, PRD §7). 기회가 없으면 현금을 남긴다(PRD §8).
 */
export function PlanPanel({
  rows,
  currency,
  investableCash,
}: {
  rows: AllocateRow[];
  currency: Currency;
  /** 기본 투자금 — 설정에서 정한 투자 가능 현금(§16.4). */
  investableCash: number;
}) {
  // 투자 가능 현금을 기본값으로 채워둔다. 매번 타이핑하지 않게.
  const [raw, setRaw] = useState(
    investableCash > 0 ? String(Math.floor(investableCash)) : "",
  );
  const amount = Number(raw) || 0;
  const steps = currency === "USD" ? USD_STEPS : WON_STEPS;

  const plan = useMemo(() => planAllocation(rows, amount), [rows, amount]);
  const rowOf = useMemo(
    () => new Map(rows.map((r) => [r.key, r])),
    [rows],
  );

  // 배분액이 있는 것 먼저, 그다음 금액 큰 순 → 살 것이 위로 온다.
  const sorted = useMemo(
    () =>
      [...plan.legs].sort(
        (a, b) => b.amount - a.amount || b.currentWeight - a.currentWeight,
      ),
    [plan.legs],
  );

  const buying = sorted.filter((l) => l.amount > 0);

  // 금액 → 주수. 소수점 주식을 만들지 않으려고 버림한다(모자란 만큼은 현금으로 남는다).
  // 시세를 모르는 종목(price 0)은 주수를 만들 수 없어 계획에서 빠진다.
  const legsWithShares = useMemo(
    () =>
      buying
        .map((leg) => {
          const price = rowOf.get(leg.key)?.price ?? 0;
          return {
            leg,
            shares: price > 0 ? Math.floor(leg.amount / price) : 0,
          };
        })
        .filter((x) => x.shares > 0),
    [buying, rowOf],
  );

  const router = useRouter();
  const [saving, startSave] = useTransition();

  function savePlan() {
    startSave(async () => {
      const res = await saveRebalancePlan(
        legsWithShares.map(({ leg, shares }) => ({
          symbol: leg.key,
          name: leg.label,
          shares,
        })),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("계획으로 저장했어요 — 매수할 때마다 진행률이 채워집니다");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 투자금 ── */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <label htmlFor="allocate-amount" className="text-sm font-semibold">
          얼마를 넣을까요
        </label>
        <Input
          id="allocate-amount"
          inputMode="numeric"
          value={raw}
          placeholder="0"
          onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
          className="mt-3 h-13 text-right text-xl font-bold tabular-nums"
        />
        <QuickAdd
          value={raw}
          onChange={setRaw}
          steps={steps}
          label={currency === "USD" ? usdStepLabel : wonStepLabel}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          투자 가능 현금 {money(investableCash, currency)} · 투자 포트폴리오{" "}
          {moneyCompact(plan.portfolioValue, currency)}
        </p>
      </section>

      {/* ── 결과 ── */}
      {amount > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-sm font-semibold">이렇게 나눕니다</p>
            {plan.remainingCash > 0 && (
              <p className="text-xs text-muted-foreground">
                현금으로 남김 {money(plan.remainingCash, currency)}
              </p>
            )}
          </div>

          <ul className="mt-3 flex flex-col gap-0.5">
            {sorted.map((leg) => (
              <PlanRow
                key={leg.key}
                leg={leg}
                row={rowOf.get(leg.key)}
                currency={currency}
              />
            ))}
          </ul>
        </section>
      )}

      {buying.length > 0 && (
        <div className="flex flex-col gap-2">
          <Link
            href="/transactions"
            className="flex h-13 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98]"
          >
            매수 기록하기
          </Link>
          {/* 계획으로 저장하면 매수할 때마다 진행률이 채워진다(홈 배너·리밸런싱 화면).
              시세를 아는 종목만 주수로 바꿀 수 있어 그때만 버튼을 낸다. */}
          {legsWithShares.length > 0 && (
            <Button
              variant="secondary"
              onClick={savePlan}
              disabled={saving}
              className="h-11 w-full text-sm font-semibold"
            >
              계획으로 저장 ({legsWithShares.length}종목)
            </Button>
          )}
        </div>
      )}

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        올라서 비중이 커진 종목은 팔라고 하지 않아요. 대신 새 돈을 넣지 않습니다. 기회가
        부족하면 전액 투자하지 않고 현금으로 남깁니다.
      </p>
    </div>
  );
}

/**
 * 한 줄 — 금액과 **왜 이 금액인지**를 같이 보여준다.
 * 재설계 전에는 이 설명이 화면 맨 아래 각주로 밀려 있어 어느 줄 이야기인지 알 수 없었다.
 */
function PlanRow({
  leg,
  row,
  currency,
}: {
  leg: AllocateLeg;
  row?: AllocateRow;
  currency: Currency;
}) {
  const meta = STATUS_META[leg.status];
  const buying = leg.amount > 0;

  // "왜 이 금액인가" — 상태별로 한 줄. 숫자를 다시 계산하지 않고 엔진이 준 값만 쓴다.
  const gapPoints = leg.targetWeight - leg.currentWeight;
  const why = buying
    ? leg.status === "STRETCH"
      ? `기대수익률이 높아 목표 위 ${pct(leg.ceilingWeight)}까지 허용`
      : `목표 ${pct(leg.targetWeight)}까지 ${pct(Math.max(0, gapPoints))} 부족`
    : meta.note;

  return (
    <li>
      <Link
        href={`/stocks/${leg.key}`}
        className={
          "flex items-center gap-3 rounded-xl px-2 py-2.5 transition active:scale-[0.99] " +
          (buying ? "" : "opacity-55")
        }
      >
        <SymbolAvatar symbol={leg.key} name={leg.label} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{leg.label}</p>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.tone}`}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {why}
          </p>
          {buying && (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {pct(leg.currentWeight)} → {pct(leg.weightAfter)}
              {row?.expectedCagr != null && ` · 기대 ${pct(row.expectedCagr)}`}
            </p>
          )}
        </div>
        {buying && (
          <p className="shrink-0 text-sm font-bold tabular-nums">
            {money(leg.amount, currency)}
          </p>
        )}
      </Link>
    </li>
  );
}
