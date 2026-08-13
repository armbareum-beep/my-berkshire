"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import {
  QuickAdd,
  WON_STEPS,
  usdStepLabel,
  wonStepLabel,
} from "@/components/ui/QuickAdd";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { money, moneyCompact, pct, type Currency } from "@/lib/format";
import {
  planAllocation,
  type AllocateStatus,
  type AllocateTarget,
} from "@/lib/allocate";

const USD_STEPS = [100, 1_000, 10_000];

/** 상태 뱃지 — PRD §11 의 BUY / WAIT / BLOCKED 표기를 따른다. */
const STATUS_META: Record<
  AllocateStatus,
  { label: string; tone: string; note: string }
> = {
  BUY: {
    label: "BUY",
    tone: "bg-accent text-primary",
    note: "목표비중 미달",
  },
  TRIM_PRIORITY: {
    label: "LOW",
    tone: "bg-secondary text-secondary-foreground",
    note: "목표 초과 — 우선순위 낮음",
  },
  WAIT: {
    label: "WAIT",
    tone: "bg-secondary text-muted-foreground",
    note: "Soft Cap 초과",
  },
  BLOCKED: {
    label: "BLOCKED",
    tone: "bg-secondary text-rise",
    note: "Hard Cap 초과 — 추가매수 금지",
  },
  FILLED: {
    label: "FILLED",
    tone: "bg-secondary text-muted-foreground",
    note: "목표를 채움",
  },
};

export interface AllocateRow extends AllocateTarget {
  symbol: string;
  /** 현재가 기준 기대 CAGR(소수). 가정이 없거나 계산 불가면 undefined/null. */
  expectedCagr?: number | null;
  /** 그 종목에 적용된 요구수익률(소수). 표시용. */
  requiredReturn?: number;
}

/**
 * 신규자금 배분 화면 — "이 돈을 어디에 얼마나 넣을까".
 *
 * 계산은 전부 `src/lib/allocate.ts` 가 한다(여긴 표시만). 매도는 제안하지 않는다 —
 * buy-only(스펙 v1.1 §14.2, PRD §7). 기회가 없으면 현금을 남긴다(PRD §8).
 */
export function AllocatePanel({
  rows,
  currency,
  investableCash,
  hasTargets,
}: {
  rows: AllocateRow[];
  currency: Currency;
  /** 참고용 — 현재 보유 현금(투자 가능 현금의 상한 힌트). */
  investableCash: number;
  hasTargets: boolean;
}) {
  // QuickAdd 가 문자열 인풋을 다루므로 원본은 문자열로 들고, 계산 직전에만 숫자로 바꾼다.
  const [raw, setRaw] = useState("");
  const amount = Number(raw) || 0;
  const steps = currency === "USD" ? USD_STEPS : WON_STEPS;

  const plan = useMemo(() => planAllocation(rows, amount), [rows, amount]);

  // 기대수익률 표시는 가정이 들어간 종목에만. symbol 기준으로 되찾는다.
  const cagrOf = useMemo(() => {
    const m: Record<string, { cagr: number | null; required: number }> = {};
    for (const r of rows)
      if (r.expectedCagr != null)
        m[r.key] = { cagr: r.expectedCagr, required: r.requiredReturn ?? 0.12 };
    return m;
  }, [rows]);
  const anyCagr = Object.keys(cagrOf).length > 0;

  // 배분액이 있는 것 먼저, 그다음 금액 큰 순 → 살 것이 위로 온다.
  const sorted = useMemo(
    () =>
      [...plan.legs].sort(
        (a, b) => b.amount - a.amount || b.currentWeight - a.currentWeight,
      ),
    [plan.legs],
  );

  if (!hasTargets) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center shadow-card">
        <p className="text-sm font-semibold">목표비중이 아직 없어요</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          어떤 종목을 얼마나 들고 갈지 정해야 새 돈을 배분할 수 있어요.
        </p>
        <Link
          href="/rebalance"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
        >
          목표비중 정하기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── 투자금 입력 ── */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <label htmlFor="allocate-amount" className="text-sm font-semibold">
          투자할 금액
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
          보유 현금 {money(investableCash, currency)} · 투자 포트폴리오{" "}
          {moneyCompact(plan.portfolioValue, currency)}
        </p>
      </section>

      {/* ── 추천 배분 ── */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-sm font-semibold">추천 배분</p>
          {plan.remainingCash > 0 && amount > 0 && (
            <p className="text-xs text-muted-foreground">
              현금으로 남김 {money(plan.remainingCash, currency)}
            </p>
          )}
        </div>

        {amount <= 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            금액을 입력하면 배분안을 계산해요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {sorted.map((leg) => {
              const meta = STATUS_META[leg.status];
              const buying = leg.amount > 0;
              return (
                <li
                  key={leg.key}
                  className={
                    "flex items-center gap-3 rounded-xl px-2 py-2.5 " +
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
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {pct(leg.currentWeight)} → 목표 {pct(leg.targetWeight)}
                      {buying && ` · 후 ${pct(leg.weightAfter)}`}
                    </p>
                    {cagrOf[leg.key]?.cagr != null && (
                      <p className="mt-0.5 text-xs tabular-nums">
                        <span
                          style={{
                            color:
                              cagrOf[leg.key].cagr! >= cagrOf[leg.key].required
                                ? "var(--primary)"
                                : "var(--muted-foreground)",
                          }}
                        >
                          기대 {pct(cagrOf[leg.key].cagr!)}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          / 요구 {pct(cagrOf[leg.key].required)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    {buying ? (
                      <p className="text-sm font-bold tabular-nums">
                        {money(leg.amount, currency)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{meta.note}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 실행 ── */}
      {amount > 0 && plan.legs.some((l) => l.amount > 0) && (
        <Link
          href="/transactions"
          className="flex h-13 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98]"
        >
          매수 기록하기
        </Link>
      )}

      <p className="px-2 text-xs leading-relaxed text-muted-foreground">
        상승으로 비중이 커진 종목은 팔라고 하지 않아요. 대신 새 돈을 넣지 않습니다.
        기회가 부족하면 전액 투자하지 않고 현금으로 남깁니다.
        {anyCagr
          ? " 기대수익률은 종목 상세에 입력한 가정으로 계산한 값이에요 — 사실이 아니라 내 규칙입니다."
          : " 종목 상세에서 이익·성장 가정을 넣으면 기대수익률까지 반영해 배분해요."}
      </p>
    </div>
  );
}
