"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clearExpectedReturn } from "@/app/stocks/[symbol]/actions";
import {
  computeExpectedReturn,
  DEFAULT_REQUIRED_RETURN,
} from "@/lib/finance/expectedReturn";
import { pct } from "@/lib/format";
import { ExpectedReturnWizard } from "./ExpectedReturnWizard";
import type { GrowthAnchor, MultipleBand } from "@/lib/finance/pastAnchors";

export interface ExpectedReturnValues {
  currentMetric: number | null;
  expectedGrowth: number | null;
  terminalMultiple: number | null;
  holdingYears: number | null;
  requiredReturn: number | null;
}

/**
 * 기대수익률 카드 — Capital Allocator PRD v0.3 §4·§5·§10.
 *
 * 매수가와 기대 CAGR 을 보여주고, 그 근거가 된 가정을 **항상 함께** 노출한다.
 * 이건 사실이 아니라 규칙 렌즈다 — "적정가"라고 쓰지 않는다.
 *
 * 여기서 저장한 가정은 `/allocate` 의 배분 우선순위에도 그대로 반영된다
 * (기대 CAGR 이 요구수익률에 못 미치면 신규 매수 후보에서 빠진다).
 */
export function ExpectedReturnCard({
  symbol,
  values,
  nativePrice,
  currencySymbol,
  autoMetric,
  houseRequiredReturn = DEFAULT_REQUIRED_RETURN,
  growthAnchor,
  perBand,
  currentPer,
}: {
  symbol: string;
  values: ExpectedReturnValues;
  /** 현재가 — **종목 통화** 기준. 이익력과 단위를 맞춰야 한다. 모르면 null. */
  nativePrice: number | null;
  /** "₩" | "$" — 입력 단위를 화면에 못박아 통화 혼동을 없앤다. */
  currencySymbol: string;
  /** 공시에서 산출한 주당순이익(종목 통화). 수기값이 없을 때 이걸 쓴다. */
  autoMetric?: number | null;
  /**
   * 전사 기본 요구수익률(`/allocate` 의 "내 허들"). 이 종목에 따로 정한 값이 없으면 이걸 쓴다.
   * 여기와 자본배분이 다른 숫자를 쓰면 "왜 저기선 안 산다고 하지?"가 된다.
   */
  houseRequiredReturn?: number;
  /** 과거 이익 성장률 — 마법사가 "앱이 아는 사실"로 보여준다. 없으면 표시하지 않는다. */
  growthAnchor?: GrowthAnchor | null;
  /** 과거 PER 밴드. */
  perBand?: MultipleBand | null;
  currentPer?: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  // 이익력은 수기값 우선, 없으면 공시값. 성장률·종료배수는 판단이라 자동값이 없다.
  const effectiveMetric = values.currentMetric ?? autoMetric ?? null;
  const usingAuto = values.currentMetric == null && autoMetric != null;
  const saved =
    effectiveMetric != null &&
    values.expectedGrowth != null &&
    values.terminalMultiple != null;

  const requiredReturn = values.requiredReturn ?? houseRequiredReturn;
  const result = saved
    ? computeExpectedReturn(
        {
          currentMetric: effectiveMetric as number,
          expectedGrowth: values.expectedGrowth as number,
          terminalMultiple: values.terminalMultiple as number,
          holdingYears: values.holdingYears ?? undefined,
          requiredReturn,
        },
        nativePrice,
      )
    : null;

  function clear() {
    start(async () => {
      const res = await clearExpectedReturn(symbol);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("가정 삭제됨 — 비중 기준으로만 배분해요");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">기대수익률</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            지금 사면 연 몇 %를 기대하는가
          </p>
        </div>
        {result && result.buyable !== null && (
          <span
            className={
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold " +
              (result.buyable ? "bg-accent text-primary" : "bg-secondary text-muted-foreground")
            }
          >
            {result.buyable ? "BUYABLE" : "WAIT"}
          </span>
        )}
      </div>

      {result ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Cell label="매수 가능가" value={`${currencySymbol}${fmt(result.buyPrice)}`} />
            <Cell
              label="현재가"
              value={nativePrice != null ? `${currencySymbol}${fmt(nativePrice)}` : "—"}
            />
            <Cell
              label="기대 CAGR"
              value={result.expectedCagr != null ? pct(result.expectedCagr) : "—"}
              tone={
                result.expectedCagr != null && result.expectedCagr >= requiredReturn
                  ? "up"
                  : undefined
              }
            />
            <Cell label="요구수익률" value={pct(requiredReturn)} />
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            가정: 이익력 {currencySymbol}
            {fmt(effectiveMetric as number)}
            {usingAuto ? " (공시)" : ""} · 성장 {pct(values.expectedGrowth as number)} ·{" "}
            {result.holdingYears}년 뒤 배수 {values.terminalMultiple}배.
            {usingAuto
              ? " 이익력은 공시를 따라가므로 실적이 갱신되면 매수 가능가도 자동으로 바뀝니다."
              : " 실적이 바뀌면 매수 가능가도 따라 바뀝니다."}{" "}
            이건 적정가가 아니라 <b>내 가정으로 계산한 값</b>이에요.
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          이익·성장 가정을 넣으면 매수 가능가와 기대 CAGR을 계산해요. 자본배분에서도 이
          숫자로 우선순위를 정합니다.
        </p>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 text-[11px] font-medium text-primary underline"
        >
          {saved ? "가정 수정하기" : "가정 입력하기"}
        </button>
      ) : (
        <ExpectedReturnWizard
          symbol={symbol}
          values={values}
          autoMetric={autoMetric}
          nativePrice={nativePrice}
          currencySymbol={currencySymbol}
          houseRequiredReturn={houseRequiredReturn}
          growthAnchor={growthAnchor}
          perBand={perBand}
          currentPer={currentPer}
          onClose={() => setOpen(false)}
        />
      )}

      {saved && !open && (
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="ml-3 text-[11px] font-medium text-muted-foreground underline"
        >
          가정 삭제
        </button>
      )}
    </section>
  );
}

/** 큰 숫자는 정수, 작은 숫자는 소수 2자리 — 원화·달러 둘 다 읽히게. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return Math.abs(v) >= 1000
    ? Math.round(v).toLocaleString()
    : (+v.toFixed(2)).toLocaleString();
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up";
}) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className="mt-0.5 text-base font-bold tabular-nums"
        style={tone === "up" ? { color: "var(--primary)" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
