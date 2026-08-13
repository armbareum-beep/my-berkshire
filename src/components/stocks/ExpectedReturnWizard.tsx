"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setExpectedReturn } from "@/app/stocks/[symbol]/actions";
import {
  computeExpectedReturn,
  DEFAULT_HOLDING_YEARS,
} from "@/lib/finance/expectedReturn";
import type { GrowthAnchor, MultipleBand } from "@/lib/finance/pastAnchors";
import { pct } from "@/lib/format";
import type { ExpectedReturnValues } from "./ExpectedReturnCard";

/**
 * 기대수익률 가정 입력 — **단계별**.
 *
 * ## 왜 마법사인가
 *
 * 이전에는 다섯 칸(이익력·성장률·종료배수·보유기간·요구수익률)을 한 번에 펼쳐놨다.
 * 그러면 두 가지가 안 보인다.
 *
 *   1. **무엇이 사실이고 무엇이 내 판단인지** — 공시 EPS(사실)와 성장률(판단)이 같은 모양의
 *      칸으로 나란히 있었다.
 *   2. **한 번에 하나씩 생각하면 된다는 것** — 다섯 칸은 사람을 얼어붙게 만든다.
 *
 * 그래서 질문을 하나씩 던진다. 각 단계에는 **과거 사실을 곁에 놓되 입력칸은 비워둔다** —
 * 과거 성장률을 기본값으로 채우면 사용자가 그대로 저장해버려 결국 앱이 예측한 것이 된다.
 *
 * 보유기간·요구수익률은 묻지 않는다. 전사 기본값("내 허들")이 이미 있고, 종목별로 다르게
 * 할 사람은 소수라 마지막 단계의 "고급"에 접어둔다.
 */
export function ExpectedReturnWizard({
  symbol,
  values,
  autoMetric,
  nativePrice,
  currencySymbol,
  houseRequiredReturn,
  growthAnchor,
  perBand,
  currentPer,
  onClose,
}: {
  symbol: string;
  values: ExpectedReturnValues;
  /** 공시에서 산출한 주당순이익(종목 통화). 과거 = 사실이라 앱이 가져온다. */
  autoMetric?: number | null;
  nativePrice: number | null;
  currencySymbol: string;
  houseRequiredReturn: number;
  /** 과거 이익 성장률. 없으면 표시하지 않는다(추측하지 않는다). */
  growthAnchor?: GrowthAnchor | null;
  /** 과거 PER 밴드. */
  perBand?: MultipleBand | null;
  currentPer?: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);

  // 수기 이익력은 "공시가 틀렸을 때만" 쓰는 값이라 고급으로 접어둔다.
  const [metric, setMetric] = useState(
    values.currentMetric != null ? String(values.currentMetric) : "",
  );
  const [growth, setGrowth] = useState(
    values.expectedGrowth != null ? String(+(values.expectedGrowth * 100).toFixed(2)) : "",
  );
  const [multiple, setMultiple] = useState(
    values.terminalMultiple != null ? String(values.terminalMultiple) : "",
  );
  const [years, setYears] = useState(
    values.holdingYears != null ? String(values.holdingYears) : "",
  );
  const [required, setRequired] = useState(
    values.requiredReturn != null ? String(+(values.requiredReturn * 100).toFixed(2)) : "",
  );
  const [advanced, setAdvanced] = useState(false);

  const effectiveMetric =
    metric.trim() !== "" ? Number(metric) : (autoMetric ?? null);
  const growthNum = growth.trim() === "" ? null : Number(growth) / 100;
  const multipleNum = multiple.trim() === "" ? null : Number(multiple);
  const yearsNum = years.trim() === "" ? null : Number(years);
  const requiredNum = required.trim() === "" ? null : Number(required) / 100;

  const preview =
    effectiveMetric != null && growthNum != null && multipleNum != null
      ? computeExpectedReturn(
          {
            currentMetric: effectiveMetric,
            expectedGrowth: growthNum,
            terminalMultiple: multipleNum,
            holdingYears: yearsNum ?? undefined,
            requiredReturn: requiredNum ?? houseRequiredReturn,
          },
          nativePrice,
        )
      : null;

  const holdingYears = yearsNum ?? DEFAULT_HOLDING_YEARS;

  function next() {
    if (step === 0) {
      if (growthNum == null || !Number.isFinite(growthNum) || growthNum <= -1) {
        toast.error("성장률을 넣어주세요 (−100%보다 커야 해요).");
        return;
      }
    }
    if (step === 1) {
      if (multipleNum == null || !Number.isFinite(multipleNum) || multipleNum <= 0) {
        toast.error("종료 배수를 넣어주세요 (0보다 커야 해요).");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  function save() {
    if (effectiveMetric == null || !(effectiveMetric > 0)) {
      toast.error("공시 이익이 없어 이익력을 직접 넣어야 해요(고급에서).");
      return;
    }
    start(async () => {
      const res = await setExpectedReturn(symbol, {
        // 비워두면 공시값을 계속 따라간다(실적이 갱신되면 매수가도 자동으로 바뀜).
        currentMetric: metric.trim() === "" ? null : Number(metric),
        expectedGrowth: growthNum,
        terminalMultiple: multipleNum,
        holdingYears: yearsNum,
        requiredReturn: requiredNum,
        baseMetric: null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("가정 등록됨 — 자본배분에 반영돼요");
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-4">
      <StepDots step={step} total={3} />

      {step === 0 && (
        <Step
          title={`앞으로 ${holdingYears}년, 이익이 얼마나 늘까요?`}
          fact={
            growthAnchor
              ? `지난 ${growthAnchor.years}년 실제 이익은 연 ${pct(growthAnchor.cagr)} 움직였어요 (${growthAnchor.fromYear}→${growthAnchor.toYear}).`
              : "과거 이익 데이터가 아직 없어요. 공시를 보고 직접 판단해주세요."
          }
          caution="과거가 그대로 이어진다는 보장은 없어요. 그래서 앱이 대신 정해주지 않습니다."
          value={growth}
          onChange={setGrowth}
          placeholder="예: 12"
          suffix="%"
          label="향후 연평균 이익 성장률"
        />
      )}

      {step === 1 && (
        <Step
          title={`${holdingYears}년 뒤, 시장이 몇 배를 줄까요?`}
          fact={
            perBand
              ? `최근 ${perBand.count}년 PER 은 평균 ${perBand.avg.toFixed(1)}배였어요 (${perBand.min.toFixed(1)}~${perBand.max.toFixed(1)}배).${currentPer != null ? ` 지금은 ${currentPer.toFixed(1)}배.` : ""}`
              : currentPer != null
                ? `지금 PER 은 ${currentPer.toFixed(1)}배예요. 과거 밴드는 아직 못 만들었어요.`
                : "PER 자료가 아직 없어요. 직접 판단해주세요."
          }
          caution="성장이 끝난 뒤에도 지금 배수를 받을지 생각해보세요. 이 숫자가 결과를 크게 흔듭니다."
          value={multiple}
          onChange={setMultiple}
          placeholder="예: 15"
          suffix="배"
          label="종료 시점 PER"
        />
      )}

      {step === 2 && (
        <div>
          <p className="text-sm font-semibold">내 가정으로는 이렇습니다</p>
          {preview ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Cell
                  label="매수 가능가"
                  value={`${currencySymbol}${fmt(preview.buyPrice)}`}
                />
                <Cell
                  label="현재가"
                  value={
                    nativePrice != null ? `${currencySymbol}${fmt(nativePrice)}` : "—"
                  }
                />
                <Cell
                  label="기대 수익률"
                  value={preview.expectedCagr != null ? pct(preview.expectedCagr) : "—"}
                  tone={
                    preview.expectedCagr != null &&
                    preview.expectedCagr >= preview.requiredReturn
                      ? "up"
                      : undefined
                  }
                />
                <Cell label="내 허들" value={pct(preview.requiredReturn)} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {preview.buyable === true
                  ? "지금 가격이 매수 가능가 아래예요 — 살 수 있는 구간입니다."
                  : preview.buyable === false
                    ? "아직 비싸요. 가격이 내려오거나 이익이 늘면 살 수 있게 됩니다."
                    : "현재가를 몰라 판정할 수 없어요."}{" "}
                이건 예측이 아니라 <b>내가 넣은 가정으로 계산한 값</b>입니다.
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              이익력을 못 구했어요. 아래 고급에서 주당 이익을 직접 넣어주세요.
            </p>
          )}

          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="mt-4 text-[11px] font-medium text-primary underline"
          >
            고급 {advanced ? "접기" : "— 이익력·보유기간·요구수익률"}
          </button>

          {advanced && (
            <div className="mt-3 border-t border-border pt-3">
              <Field
                label={`주당 이익 (${currencySymbol})`}
                hint={
                  autoMetric != null
                    ? `비워두면 공시값 ${currencySymbol}${fmt(autoMetric)} 을 계속 따라가요 — 실적이 갱신되면 매수가도 자동으로 바뀝니다.`
                    : "공시 이익을 아직 못 불러왔어요. 공시에 적힌 값을 넣어주세요."
                }
                value={metric}
                onChange={setMetric}
                placeholder={autoMetric != null ? `공시값 ${fmt(autoMetric)}` : "1.35"}
              />
              <Field
                label={`보유기간 (년) · 기본 ${DEFAULT_HOLDING_YEARS}`}
                value={years}
                onChange={setYears}
                placeholder={String(DEFAULT_HOLDING_YEARS)}
              />
              <Field
                label={`요구수익률 (%) · 내 허들 ${+(houseRequiredReturn * 100).toFixed(2)}`}
                hint="비워두면 자본배분의 '내 허들'을 따라갑니다."
                value={required}
                onChange={setRequired}
                placeholder={String(+(houseRequiredReturn * 100).toFixed(2))}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 이동 ── */}
      <div className="mt-4 flex gap-2">
        {step > 0 && (
          <Button
            variant="secondary"
            onClick={() => setStep((s) => s - 1)}
            disabled={pending}
            className="h-10 px-4 text-xs"
          >
            이전
          </Button>
        )}
        {step < 2 ? (
          <Button
            onClick={next}
            className="h-10 flex-1 bg-primary text-xs font-semibold text-primary-foreground"
          >
            다음
          </Button>
        ) : (
          <Button
            onClick={save}
            disabled={pending || !preview}
            className="h-10 flex-1 bg-primary text-xs font-semibold text-primary-foreground"
          >
            가정 등록하기
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={pending}
          className="h-10 px-3 text-xs"
        >
          취소
        </Button>
      </div>
    </div>
  );
}

/** 진행 표시 — 몇 개 남았는지 보이면 사람이 덜 얼어붙는다. */
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={
            "h-1.5 flex-1 rounded-full " + (i <= step ? "bg-primary" : "bg-secondary")
          }
        />
      ))}
      <span className="ml-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
        {step + 1}/{total}
      </span>
    </div>
  );
}

/**
 * 한 단계 = 질문 하나.
 * `fact` 는 앱이 아는 **사실**, `caution` 은 그 사실을 그대로 믿지 말라는 경고,
 * 입력칸은 **비어 있다** — 채워두면 앱이 예측한 것이 된다.
 */
function Step({
  title,
  fact,
  caution,
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  title: string;
  fact: string;
  caution: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix: string;
}) {
  return (
    <div>
      <p className="text-base font-bold leading-snug">{title}</p>

      <div className="mt-3 rounded-xl bg-secondary/60 p-3">
        <p className="text-[11px] font-semibold text-muted-foreground">앱이 아는 사실</p>
        <p className="mt-1 text-xs leading-relaxed">{fact}</p>
      </div>

      <label className="mt-4 block text-[11px] font-medium">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 flex-1 text-right text-lg font-bold tabular-nums"
        />
        <span className="text-sm font-semibold text-muted-foreground">{suffix}</span>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{caution}</p>
    </div>
  );
}

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

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mb-2.5">
      <label className="text-[11px] font-medium">{label}</label>
      <Input
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-9"
      />
      {hint && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
