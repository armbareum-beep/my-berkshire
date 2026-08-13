"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveRebalancePlan } from "@/app/rebalance/actions";
import { StepShell } from "@/components/transactions/wizard/StepShell";
import { SuccessOverlay } from "@/components/transactions/wizard/SuccessOverlay";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";
import { NumberPadField } from "@/components/ui/NumberPad";
import {
  QuickAdd,
  WON_STEPS,
  usdStepLabel,
  wonStepLabel,
} from "@/components/ui/QuickAdd";
import { SymbolAvatar } from "@/components/onboarding/SymbolPicker";
import { money, pct, type Currency } from "@/lib/format";
import { planAllocation, type AllocateLeg } from "@/lib/allocate";
import type { AllocateRow } from "@/lib/allocateData";
import { STATUS_META } from "./statusMeta";

const USD_STEPS = [100, 1_000, 10_000];

/**
 * 자본배분 레일 — **한 화면에서 한 번에 한 가지씩.**
 *
 * ## 왜 카드가 아니라 레일인가
 *
 * 직전 재설계(`docs/allocate-redesign-v1.md`)는 화면을 셋으로 갈랐다(보기 / 실행 / 설정).
 * 카드 수는 줄었지만 문제는 그대로였다 — `/allocate` 에 현금 카드·1순위 카드·순위 카드가
 * **동시에** 놓여 있어 사용자가 "이 중 뭘 해야 하지"를 매번 골라야 했다. 게다가 1순위 카드와
 * 순위 1번 줄은 같은 정보였고, 정작 "얼마를 어디에"라는 답은 한 화면 더 들어가야 나왔다.
 *
 * 그래서 **고르게 하지 않는다.** 이 앱은 이미 거래 입력에서 같은 답을 냈다 —
 * `docs/user-rails-v1.md` §1-1: *"폼 한 장에 다 넣으면 회계 입력이고, 한 번에 하나씩 물으면
 * 딜 체결이다."* 자본배분도 같은 레일에 태운다.
 *
 * 구현도 새로 만들지 않고 거래 위저드의 부품을 그대로 쓴다 — `StepShell`(진행 점 ●●●),
 * `NumberPadField`(키패드 시트), `SuccessOverlay`(도장 ✓). 같은 부품을 쓰므로 두 여정이
 * 같은 앱처럼 느껴진다.
 *
 * ## 세 단계는 각각 다른 일을 한다
 *
 * | 단계 | 묻는 것 | 왜 합칠 수 없나 |
 * |---|---|---|
 * | 1 | 얼마를 넣을까 | 사용자만 아는 값 |
 * | 2 | 어디에 얼마씩 | 엔진이 낸 답 — 확인이 필요하다 |
 * | 3 | 몇 주씩 | 금액은 주가로 나눠떨어지지 않는다. 계획은 **주수**로 등기된다 |
 *
 * 3단계가 2단계의 요약이었다면 뺐을 것이다. 실제로 다른 숫자라서 남긴다.
 *
 * 계산은 전부 `src/lib/allocate.ts:planAllocation` 이 한다 — **엔진은 손대지 않았다.**
 * 여기서는 표시와 진행만 한다.
 */
export function AllocateRail({
  rows,
  currency,
  investableCash,
  investableCashSet,
}: {
  rows: AllocateRow[];
  currency: Currency;
  /** 설정에서 정한 투자 가능 현금(스펙 §16.4). 미지정이면 보유 현금 전액. */
  investableCash: number;
  /** 사용자가 직접 정한 값인가(= 보유 현금 폴백이 아닌가). */
  investableCashSet: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, startSave] = useTransition();
  const [done, setDone] = useState<{ title: string; sub: string } | null>(null);

  // 투자 가능 현금을 기본값으로 깔아둔다 — 대부분은 그대로 두고 한 번 눌러 넘어간다.
  const [raw, setRaw] = useState(
    investableCash > 0 ? String(Math.floor(investableCash)) : "",
  );
  const amount = Number(raw) || 0;

  const steps = currency === "USD" ? USD_STEPS : WON_STEPS;
  const stepLabel = currency === "USD" ? usdStepLabel : wonStepLabel;
  const symbol = currency === "USD" ? "$" : "₩";

  const plan = useMemo(() => planAllocation(rows, amount), [rows, amount]);
  const rowOf = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // 배분액이 있는 것 먼저, 그다음 금액 큰 순 → 살 것이 위로 온다.
  const sorted = useMemo(
    () =>
      [...plan.legs].sort(
        (a, b) => b.amount - a.amount || b.currentWeight - a.currentWeight,
      ),
    [plan.legs],
  );
  const buying = useMemo(() => sorted.filter((l) => l.amount > 0), [sorted]);

  // 금액 → 주수. 소수점 주식을 만들지 않으려고 버림한다(모자란 만큼은 현금으로 남는다).
  // 시세를 모르는 종목(price 0)은 주수를 만들 수 없어 계획에서 빠진다.
  const shareLegs = useMemo(
    () =>
      buying
        .map((leg) => {
          const price = rowOf.get(leg.key)?.price ?? 0;
          const shares = price > 0 ? Math.floor(leg.amount / price) : 0;
          return { leg, price, shares, cost: shares * price };
        })
        .filter((x) => x.shares > 0),
    [buying, rowOf],
  );

  const shareTotal = shareLegs.reduce((s, x) => s + x.cost, 0);

  function savePlan() {
    startSave(async () => {
      const res = await saveRebalancePlan(
        shareLegs.map(({ leg, shares }) => ({
          symbol: leg.key,
          name: leg.label,
          shares,
        })),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDone({
        title: "자본배분이 등기되었습니다",
        sub: `${shareLegs.length}개 기업 · 매수할 때마다 진행률이 채워집니다`,
      });
    });
  }

  if (done) {
    return (
      <SuccessOverlay
        title={done.title}
        sub={done.sub}
        onContinue={() => {
          // 계획은 홈 배너·리밸런싱 진행률이 읽는다 — 최신 상태로 되돌린다.
          router.push("/dashboard");
          router.refresh();
        }}
      />
    );
  }

  /** 첫 단계에서 뒤로는 이탈이다 — 홈으로. 그 뒤로는 한 칸씩 되돌린다. */
  const onBack = () =>
    step === 0 ? router.push("/dashboard") : setStep(step - 1);

  // ── 1단계 — 얼마를 넣을까 ──────────────────────────────────────────────
  if (step === 0) {
    return (
      <>
        {/* 탭바는 이 단계에만 둔다. 여기까지가 평시 화면이고, 다음 단계부터는
            "여정 중"이라 이탈 경로를 두지 않는다(design-strategy §4 레일 원칙). */}
        <BottomTabBar />
        <StepShell
          kind="자본배분"
          total={3}
          current={0}
          onBack={onBack}
          title="얼마를 넣을까요"
          subtitle={
            investableCashSet
              ? `투자 가능 현금 ${money(investableCash, currency)}`
              : `보유 현금 전액 ${money(investableCash, currency)} · 설정에서 따로 정할 수 있어요`
          }
          className="pb-28"
        >
          <NumberPadField
            value={raw}
            onChange={setRaw}
            prefix={symbol}
            title="얼마를 넣을까요"
            placeholder={`${symbol}0`}
          />
          <QuickAdd
            value={raw}
            onChange={setRaw}
            steps={steps}
            label={stepLabel}
          />

          <div className="mt-auto flex flex-col gap-3 pt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={amount <= 0}
              className="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-40"
            >
              다음
            </button>
            <div className="flex justify-center gap-4 text-xs font-medium text-muted-foreground">
              <Link href="/allocate/settings" className="underline">
                목표비중·설정
              </Link>
              <Link href="/allocate/ranking" className="underline">
                살 곳 순위 보기
              </Link>
            </div>
          </div>
        </StepShell>
      </>
    );
  }

  // ── 2단계 — 어디에 얼마씩 ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <StepShell
        kind="자본배분"
        total={3}
        current={1}
        onBack={onBack}
        title="이렇게 나눕니다"
        subtitle={
          buying.length > 0
            ? `${money(amount, currency)} 중 ${money(amount - plan.remainingCash, currency)}`
            : undefined
        }
      >
        {buying.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-card">
            <p className="text-sm font-semibold">지금은 살 곳이 없어요</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              전부 목표를 채웠거나 한도에 걸려 있습니다. 이럴 땐 현금으로 두는 게
              맞습니다.
            </p>
            <Link
              href="/allocate/settings"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-secondary px-5 text-sm font-semibold transition active:scale-[0.98]"
            >
              목표비중 손보기
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-0.5">
              {sorted.map((leg) => (
                <PlanRow
                  key={leg.key}
                  leg={leg}
                  row={rowOf.get(leg.key)}
                  currency={currency}
                />
              ))}
            </ul>
            {plan.remainingCash > 0 && (
              <p className="mt-3 px-2 text-xs text-muted-foreground">
                현금으로 남김 {money(plan.remainingCash, currency)} — 기회가
                부족하면 전액 투자하지 않습니다.
              </p>
            )}
            <p className="mt-3 px-2 text-xs leading-relaxed text-muted-foreground">
              올라서 비중이 커진 종목은 팔라고 하지 않아요. 대신 새 돈을 넣지
              않습니다.
            </p>
            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98]"
              >
                이대로 진행
              </button>
            </div>
          </>
        )}
      </StepShell>
    );
  }

  // ── 3단계 — 몇 주씩 ───────────────────────────────────────────────────
  return (
    <StepShell
      kind="자본배분"
      total={3}
      current={2}
      onBack={onBack}
      title="몇 주씩 살까요"
      subtitle="계획으로 등기하면 매수할 때마다 진행률이 채워져요"
    >
      {shareLegs.length === 0 ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-card">
          <p className="text-sm font-semibold">주수를 만들 수 없어요</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            시세를 모르는 종목이거나, 한 주 값보다 배분액이 적습니다. 금액을
            늘리거나 직접 매수를 기록해 주세요.
          </p>
          <Link
            href="/transactions"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-secondary px-5 text-sm font-semibold transition active:scale-[0.98]"
          >
            매수 기록하기
          </Link>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5">
            {shareLegs.map(({ leg, shares, price, cost }) => (
              <li key={leg.key}>
                <div className="flex items-center gap-3 rounded-xl px-2 py-2.5">
                  <SymbolAvatar
                    symbol={leg.key}
                    name={leg.label}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {leg.label}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {money(price, currency)} × {shares}주
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums">
                    {money(cost, currency)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between rounded-2xl bg-card px-4 py-3 shadow-card">
            <p className="text-sm font-semibold">합계</p>
            <p className="text-base font-extrabold tabular-nums">
              {money(shareTotal, currency)}
            </p>
          </div>
          {amount - shareTotal > 0 && (
            <p className="mt-2 px-2 text-xs text-muted-foreground">
              주수로 떨어지지 않는 {money(amount - shareTotal, currency)}는
              현금으로 남습니다.
            </p>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-6">
            <button
              type="button"
              onClick={savePlan}
              disabled={saving}
              className="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-60"
            >
              {saving ? "등기하는 중…" : "이 계획으로 등기"}
            </button>
            <Link
              href="/transactions"
              className="text-center text-xs font-medium text-muted-foreground underline"
            >
              등기 없이 바로 매수 기록하기
            </Link>
          </div>
        </>
      )}
    </StepShell>
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
