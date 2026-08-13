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
  type AllocateLeg,
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
  STRETCH: {
    label: "BUY+",
    tone: "bg-accent text-primary",
    note: "기대수익률이 높아 목표 초과 매수",
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
  /** 요구수익률을 만족하는 최대 매수가(종목 통화). 표시용. */
  buyPrice?: number | null;
  /** 현재가(`buyPrice` 와 같은 통화). 표시용. */
  nativePrice?: number | null;
  /** 위 두 가격의 통화 — 공시 경로는 해외 종목이어도 ₩ 다. */
  nativeCcy?: "KRW" | "USD";
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

  // 기대수익률 순위 — PRD §6.1·§11. 가정이 있는 종목이 위, 없는 종목은 아래에 모은다.
  // (가정이 없으면 "0%"가 아니라 "아직 모른다"이므로 섞어서 줄 세우면 거짓말이 된다.)
  const ranked = useMemo(() => {
    const withCagr = rows.filter((r) => r.expectedCagr != null);
    const without = rows.filter((r) => r.expectedCagr == null);
    withCagr.sort((a, b) => (b.expectedCagr ?? 0) - (a.expectedCagr ?? 0));
    without.sort((a, b) => b.value - a.value);
    return { withCagr, without };
  }, [rows]);

  const legOf = useMemo(() => {
    const m: Record<string, AllocateLeg> = {};
    for (const leg of plan.legs) m[leg.key] = leg;
    return m;
  }, [plan.legs]);

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
                <li key={leg.key}>
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
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {pct(leg.currentWeight)} → 목표 {pct(leg.targetWeight)}
                        {/* 상한이 목표보다 크면 밸류에이션이 문을 더 열어준 것이다(PRD §6.2). */}
                        {leg.ceilingWeight > leg.targetWeight &&
                          ` (한도 ${pct(leg.ceilingWeight)})`}
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
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── 기대수익률 순위 (PRD §6.1·§11) ── */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold">기대수익률 순위</p>
          <p className="text-xs text-muted-foreground">내 가정 기준</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {anyCagr
            ? "요구수익률 + 3%p를 넘기면 목표비중을 넘겨서까지 삽니다. 못 넘기면 목표비중까지만."
            : "종목마다 이익·성장 가정을 넣으면 이 순위로 배분 우선순위와 매수 한도가 정해져요."}
        </p>

        <ul className="mt-4 flex flex-col gap-1">
          {ranked.withCagr.map((r, i) => (
            <RankRow key={r.key} rank={i + 1} row={r} leg={legOf[r.key]} currency={currency} />
          ))}
          {ranked.without.map((r) => (
            <RankRow key={r.key} row={r} leg={legOf[r.key]} currency={currency} />
          ))}
        </ul>
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

/** 소수점: 큰 값은 정수, 작은 값은 2자리. 원화·달러 둘 다 읽히게. */
function price(v: number, ccy: "KRW" | "USD"): string {
  const unit = ccy === "KRW" ? "₩" : "$";
  const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (+v.toFixed(2)).toLocaleString();
  return `${unit}${n}`;
}

/**
 * 순위 한 줄. 가정이 있으면 기대 CAGR·매수가를, 없으면 입력 유도를 보여준다.
 *
 * 종목 상세로 링크를 건다 — 가정을 고치는 곳이 거기이고, 이 화면에서 "왜 안 사지?"의
 * 답이 대부분 가정이기 때문이다.
 */
function RankRow({
  rank,
  row,
  leg,
  currency,
}: {
  rank?: number;
  row: AllocateRow;
  leg?: AllocateLeg;
  currency: Currency;
}) {
  const meta = leg ? STATUS_META[leg.status] : null;
  const cagr = row.expectedCagr;
  const required = row.requiredReturn ?? 0.12;
  const ccy = row.nativeCcy ?? (currency === "USD" ? "USD" : "KRW");
  const clears = cagr != null && cagr >= required;

  return (
    <li>
      <Link
        href={`/stocks/${row.symbol}`}
        className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition active:scale-[0.99]"
      >
        <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
          {rank ?? "–"}
        </span>
        <SymbolAvatar symbol={row.symbol} name={row.label} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{row.label}</p>
            {meta && (
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${meta.tone}`}
              >
                {meta.label}
              </span>
            )}
          </div>
          {cagr != null ? (
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {row.buyPrice != null && row.nativePrice != null ? (
                <>
                  매수가 {price(row.buyPrice, ccy)} · 현재 {price(row.nativePrice, ccy)}
                </>
              ) : (
                <>요구 {pct(required)}</>
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-primary underline">
              가정 입력하고 밸류에이션 반영하기
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {cagr != null ? (
            <>
              <p
                className="text-sm font-bold tabular-nums"
                style={{ color: clears ? "var(--primary)" : "var(--muted-foreground)" }}
              >
                {pct(cagr)}
              </p>
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {leg ? `${pct(leg.currentWeight)} / 목표 ` : "목표 "}
                {pct(row.target)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">가정 없음</p>
          )}
        </div>
      </Link>
    </li>
  );
}
