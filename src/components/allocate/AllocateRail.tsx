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
import { cn } from "@/lib/utils";
import { money, pct, type Currency } from "@/lib/format";
import { planAllocation, type AllocateLeg } from "@/lib/allocate";
import { rankRows, targetGap } from "@/lib/allocateRanking";
import {
  buildBuckets,
  BUCKET_LENSES,
  type BucketLens,
} from "@/lib/allocateBuckets";
import type { AllocateRow } from "@/lib/allocateData";
import { STATUS_META } from "./statusMeta";
import { HurdleCard } from "./HurdleCard";
import { InvestableCashCard } from "./InvestableCashCard";
import { TargetLensPanel, type LensRows } from "./TargetLensPanel";

const USD_STEPS = [100, 1_000, 10_000];

/**
 * 자본배분 레일 — **한 화면에서 한 번에 한 가지씩.**
 *
 * ## 왜 카드가 아니라 레일인가
 *
 * v1 재설계(`docs/allocate-redesign-v1.md`)는 "한 화면 한 가지 일"을 화면을 쪼개서 풀었다.
 * 카드 수는 줄었지만 조각들을 **동시에 늘어놓아** 사용자가 매번 "이 중 뭘 해야 하지"를
 * 골라야 했다. 이 앱은 같은 문제를 거래 입력에서 이미 풀었다 — `docs/user-rails-v1.md` §1-1:
 * *"폼 한 장에 다 넣으면 회계 입력이고, 한 번에 하나씩 물으면 딜 체결이다."*
 *
 * ## 단계
 *
 * | 단계 | 묻는 것 | 왜 따로인가 |
 * |---|---|---|
 * | 1 | 얼마나 들고 갈까 | 목표비중. 유형은 여기서 정하고 국가·산업은 결과로 본다 |
 * | 2 | 얼마를 넣을까 | 사용자만 아는 값 |
 * | 3 | 어디에 넣을까 | 유형·국가·산업 중 한 묶음. 고른 쪽에만 돈이 간다 |
 * | 4 | 어디에 얼마씩 | 고른 묶음의 순위 + 금액 |
 * | 5 | 몇 주씩 | 금액은 주가로 나눠떨어지지 않는다. 계획은 **주수**로 등기된다 |
 *
 * 3단계는 어느 렌즈로 봐도 묶음이 하나뿐일 때만 건너뛴다(고를 게 없는 질문은 마찰이다).
 *
 * ## 순위를 레일 안에서 보여준다
 *
 * 직전 버전은 순위 목록을 `/allocate/ranking` 조회 화면으로 빼고 1단계 하단 작은 링크로만
 * 걸었다 — 사실상 안 보였다. 지금은 4단계가 곧 순위다. 번호·정렬 기준·기대수익률이
 * 금액과 같은 줄에 있으므로 "왜 이 순서인지"가 배분과 분리되지 않는다.
 *
 * 주식과 ETF 를 **한 줄로 세우지 않는 이유**는 `lib/allocateRanking.ts` 에 있다 — 주식은
 * 기대수익률, ETF 는 목표 미달로 줄 세운다. 기대수익률 모형이 개별기업에만 성립하기
 * 때문이다. 기준이 다른 둘에 연속 번호를 매기면 비교 가능한 척이 된다.
 *
 * 그래서 묶음을 국가·산업으로도 고를 수 있게 넓히면서(*"어디에 넣을까요도 바꿔야지 않아?"*)
 * **묶음 안을 두 섹션으로 갈라 각각 1번부터** 세게 했다(`lib/allocateBuckets.ts`). "미국"을
 * 고르면 미국 주식과 미국 ETF 가 각자의 기준으로 줄 선다. 유형으로 골랐으면 한쪽이 비어
 * 예전과 똑같이 한 목록만 보인다.
 *
 * ## 고른 쪽에만 넣되, 비중은 전체 기준
 *
 * `planAllocation` 에 목록을 걸러서 넘기지 않고 `eligible` 로 넘긴다. 걸러서 넘기면
 * 비중의 분모가 그 부분집합이 되어 **현재 비중이 부풀려진다**(`lib/allocate.ts` `PlanOptions`).
 *
 * 계산은 전부 엔진이 한다 — 여기서는 표시와 진행만 한다.
 */
export function AllocateRail({
  rows,
  currency,
  investableCash,
  investableCashSet,
  cash,
  house,
  passing,
  judged,
  lensRows,
}: {
  rows: AllocateRow[];
  currency: Currency;
  /** 보유 현금 전액 — 투자 가능 현금 카드가 비교로 쓴다. */
  cash: number;
  /** 전사 요구수익률(허들)과 통과 현황 — 4단계에 접어 넣는다. */
  house: number;
  passing: number;
  judged: number;
  /** 1단계에서 보는 목표 — 유형(편집 가능)·국가·산업. 서버에서 계산해 넘긴다. */
  lensRows: LensRows;
  /** 설정에서 정한 투자 가능 현금(스펙 §16.4). 미지정이면 보유 현금 전액. */
  investableCash: number;
  /** 사용자가 직접 정한 값인가(= 보유 현금 폴백이 아닌가). */
  investableCashSet: boolean;
}) {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState(0);
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

  // ── 묶음 ──
  // 세 렌즈를 한 번에 만들어 둔다. 탭을 눌러도 다시 계산하지 않고, "어느 렌즈로 봐도
  // 고를 게 하나뿐인가"(= 이 단계를 건너뛸까)를 판단할 수 있다.
  const rankedAll = useMemo(() => rankRows(rows), [rows]);
  const bucketsByLens = useMemo(
    () =>
      new Map(
        BUCKET_LENSES.map((l) => [l.key, buildBuckets(rankedAll, l.key)] as const),
      ),
    [rankedAll],
  );

  const [lens, setLens] = useState<BucketLens>("assetType");
  // 고른 묶음은 **렌즈까지 같이** 기억한다 — 라벨만 두면 탭을 옮겼을 때 같은 이름의 다른
  // 묶음(예: 산업 "기타" vs 국가 "기타")이 조용히 선택된 것처럼 보인다.
  const [picked, setPicked] = useState<{ lens: BucketLens; key: string } | null>(
    null,
  );

  const buckets = bucketsByLens.get(lens) ?? [];
  const bucket = useMemo(() => {
    const chosen = picked
      ? (bucketsByLens.get(picked.lens) ?? []).find((b) => b.key === picked.key)
      : undefined;
    // 안 골랐으면 유형 렌즈의 첫 묶음 — 건너뛴 경우 그게 유일한 묶음이다.
    return chosen ?? (bucketsByLens.get("assetType") ?? [])[0] ?? null;
  }, [picked, bucketsByLens]);

  const needsPick = BUCKET_LENSES.some(
    (l) => (bucketsByLens.get(l.key) ?? []).length > 1,
  );
  // 목표 → 금액 → (묶음) → 배분 → 주수. 셋으로 갈려 있던 화면을 한 줄로 세운 것이다.
  const stepIds = needsPick
    ? (["targets", "amount", "bucket", "split", "shares"] as const)
    : (["targets", "amount", "split", "shares"] as const);
  const stepId = stepIds[stepIdx];

  // ── 배분 ──
  // 고른 묶음에만 돈이 가되, 목록은 전부 넘긴다(비중 분모 보존 — PlanOptions 주석).
  const pickedKeys = useMemo(() => new Set(bucket?.members ?? []), [bucket]);
  const plan = useMemo(
    () =>
      planAllocation(rows, amount, { eligible: (t) => pickedKeys.has(t.key) }),
    [rows, amount, pickedKeys],
  );

  const rowOf = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  /**
   * 고른 묶음을 **섹션별로** 세우고 금액을 붙인다.
   *
   * 번호는 섹션 안에서 1번부터다 — 기준이 다른 둘에 이어진 번호를 매기면 비교 가능한
   * 척이 된다(`lib/allocateBuckets.ts`). 엔진이 다리를 안 만든 종목은 먼저 걸러낸 뒤
   * 번호를 매긴다(빠진 자리에 번호가 비면 순위를 잘못 읽는다).
   */
  const sections = useMemo(() => {
    const legOf = new Map(plan.legs.map((l) => [l.key, l]));
    return (bucket?.sections ?? [])
      .map((s) => ({
        key: s.key,
        basis: s.basis,
        note: s.note,
        items: s.rows
          .map((r) => ({ row: r.row, leg: legOf.get(r.row.key) }))
          .filter((x): x is { row: AllocateRow; leg: AllocateLeg } =>
            Boolean(x.leg),
          )
          .map((x, i) => ({ rank: i + 1, ...x })),
      }))
      .filter((s) => s.items.length > 0);
  }, [bucket, plan]);

  const buying = sections
    .flatMap((s) => s.items)
    .filter((x) => x.leg.amount > 0);

  // 금액 → 주수. 소수점 주식을 만들지 않으려고 버림한다(모자란 만큼은 현금으로 남는다).
  // 시세를 모르는 종목(price 0)은 주수를 만들 수 없어 계획에서 빠진다.
  const shareLegs = useMemo(
    () =>
      buying
        .map(({ leg }) => {
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
    stepIdx === 0 ? router.push("/dashboard") : setStepIdx(stepIdx - 1);
  const next = () => setStepIdx(stepIdx + 1);

  const shell = {
    kind: "자본배분",
    total: stepIds.length,
    current: stepIdx,
    onBack,
  };

  // ── 1단계 — 얼마나 들고 갈까(목표) ────────────────────────────────────
  if (stepId === "targets") {
    return (
      <>
        {/* 탭바는 첫 단계에만. 여기까지가 평시 화면이고 다음부터는 여정이다. */}
        <BottomTabBar />
        <StepShell
          {...shell}
          title="얼마나 들고 갈까요"
          subtitle="투자자산을 어떻게 나눌지 먼저 정해요"
          className="pb-28"
        >
          <TargetLensPanel rows={lensRows} currency={currency} />
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={next}
              className="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98]"
            >
              다음
            </button>
          </div>
        </StepShell>
      </>
    );
  }

  // ── 2단계 — 얼마를 넣을까 ──────────────────────────────────────────────
  if (stepId === "amount") {
    return (
      <>
        <StepShell
          {...shell}
          title="얼마를 넣을까요"
          subtitle={
            investableCashSet
              ? `투자 가능 현금 ${money(investableCash, currency)}`
              : `보유 현금 전액 ${money(investableCash, currency)} · 설정에서 따로 정할 수 있어요`
          }
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

          {/* 투자 가능 현금 — 예전엔 별도 설정 화면에 있었다. 이 단계의 기본값이 곧
              그 값이라 같은 자리에 둔다(같은 것을 두 곳에서 정하지 않는다). */}
          <div className="mt-4">
            <InvestableCashCard
              value={investableCash}
              cash={cash}
              currency={currency}
              isSet={investableCashSet}
            />
          </div>

          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={next}
              disabled={amount <= 0}
              className="h-13 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.98] disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </StepShell>
      </>
    );
  }

  // ── 3단계 — 어느 묶음에 넣을까 ────────────────────────────────────────
  if (stepId === "bucket") {
    return (
      <StepShell
        {...shell}
        title="어디에 넣을까요"
        subtitle="고른 묶음에만 넣습니다. 나머지는 현금으로 남아요."
      >
        {/* 묶는 축을 고른다 — 1단계에서 국가·산업 비중을 보고 왔으니 배분도 같은 축으로
            고를 수 있어야 한다. 축을 바꿔도 고른 묶음은 그대로 기억한다. */}
        <nav className="mb-3 flex gap-1 rounded-xl bg-secondary p-1">
          {BUCKET_LENSES.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLens(l.key)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-center text-sm font-semibold transition",
                lens === l.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </nav>

        {buckets.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-card">
            <p className="text-sm text-muted-foreground">
              이 기준으로 묶을 게 없어요.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {buckets.map((b) => (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => {
                    // 탭하면 자동 전진 — 확인 버튼을 또 누르게 하지 않는다(레일 §1-1).
                    setPicked({ lens, key: b.key });
                    next();
                  }}
                  className="w-full rounded-2xl bg-card p-5 text-left shadow-card transition active:scale-[0.99]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-lg font-bold">
                      {b.label}{" "}
                      <span className="text-sm font-semibold text-muted-foreground">
                        {b.count}
                      </span>
                    </p>
                    <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {b.gap > 0.0001 ? `목표까지 ${pct(b.gap)}` : "목표 도달"}
                    </p>
                  </div>
                  {b.top && (
                    <div className="mt-3 flex items-center gap-3">
                      <SymbolAvatar
                        symbol={b.top.row.symbol}
                        name={b.top.row.label}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          1순위 {b.top.row.label}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {b.top.row.expectedCagr != null
                            ? `기대 ${pct(b.top.row.expectedCagr)}`
                            : `목표까지 ${gapLabel(targetGap(b.top))}`}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* 섹션이 둘이면 안에서 기준이 갈린다는 걸 미리 알린다. */}
                  {b.sections.length > 1 && (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      {b.sections.map((s) => s.basis).join(" · ")} — 기준이 달라
                      나눠서 세워요
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </StepShell>
    );
  }

  // ── 4단계 — 어디에 얼마씩(= 순위) ──────────────────────────────────────
  if (stepId === "split") {
    return (
      <StepShell
        {...shell}
        title="이렇게 나눕니다"
        subtitle={
          buying.length > 0
            ? `${bucket?.label ?? ""} · ${money(amount - plan.remainingCash, currency)} 배분`
            : undefined
        }
      >
        {buying.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center shadow-card">
            <p className="text-sm font-semibold">지금은 살 곳이 없어요</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {bucket?.label ?? "고른 묶음"}은 전부 목표를 채웠거나 한도에 걸려
              있습니다. 이럴 땐 현금으로 두는 게 맞습니다.
            </p>
            {/* 목표를 고칠 곳은 이 레일의 1단계다 — 화면 밖으로 내보내면 여기까지 온
                맥락이 끊긴다. */}
            <button
              type="button"
              onClick={() => setStepIdx(0)}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-secondary px-5 text-sm font-semibold transition active:scale-[0.98]"
            >
              목표비중 손보기
            </button>
          </div>
        ) : (
          <>
            {/* 섹션마다 번호가 무슨 기준으로 매겨졌는지 밝힌다 — 기준 없는 순위는
                거짓말이다. 섹션이 하나뿐이면 예전과 똑같이 보인다. */}
            {sections.map((s) => (
              <section key={s.key} className="mt-3 first:mt-0">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {s.basis}
                </p>
                {s.note && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {s.note}
                  </p>
                )}
                <ul className="mt-2 flex flex-col gap-0.5">
                  {s.items.map(({ rank, row, leg }) => (
                    <PlanRow
                      key={leg.key}
                      rank={rank}
                      leg={leg}
                      row={row}
                      currency={currency}
                    />
                  ))}
                </ul>
              </section>
            ))}

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

            {/* 허들 — 예전 "배분 설정" 화면의 내용. 이 값이 바로 이 순위를 만들므로
                결과 옆에 둔다. 따로 화면을 두면 왜 순위가 그런지와 끊긴다. */}
            <div className="mt-4">
              <HurdleCard rate={house} passing={passing} total={judged} />
            </div>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={next}
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

  // ── 5단계 — 몇 주씩 ───────────────────────────────────────────────────
  return (
    <StepShell
      {...shell}
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
                  <SymbolAvatar symbol={leg.key} name={leg.label} size="md" />
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

/** 목표 미달을 %p 로. 이미 넘겼으면 부호를 붙여 "초과"임을 드러낸다. */
function gapLabel(gap: number): string {
  if (Math.abs(gap) < 0.0001) return "목표 도달";
  return `${gap > 0 ? "−" : "+"}${pct(Math.abs(gap))}`;
}

/**
 * 한 줄 — **순위 번호**와 금액과 **왜 이 금액인지**를 같이 보여준다.
 * 번호·정렬 기준을 다른 화면으로 빼면 "왜 이 순서인지"가 배분과 끊긴다.
 */
function PlanRow({
  rank,
  leg,
  row,
  currency,
}: {
  rank: number;
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
        <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-foreground">
          {rank}
        </span>
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
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {pct(leg.currentWeight)}
            {buying && ` → ${pct(leg.weightAfter)}`}
            {row?.expectedCagr != null && ` · 기대 ${pct(row.expectedCagr)}`}
          </p>
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
