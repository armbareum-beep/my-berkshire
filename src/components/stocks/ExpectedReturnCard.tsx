"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearExpectedReturn,
  setExpectedReturn,
} from "@/app/stocks/[symbol]/actions";
import {
  computeExpectedReturn,
  DEFAULT_HOLDING_YEARS,
  DEFAULT_REQUIRED_RETURN,
} from "@/lib/finance/expectedReturn";
import { pct } from "@/lib/format";

export interface ExpectedReturnValues {
  currentMetric: number | null;
  expectedGrowth: number | null;
  terminalMultiple: number | null;
  holdingYears: number | null;
  requiredReturn: number | null;
}

/** 숫자 → 입력 문자열(빈 값은 ""). 소수점 잔재(0.30000000000000004) 제거. */
const s = (n: number | null | undefined, scale = 1) =>
  n == null ? "" : String(+(n * scale).toFixed(4));

/** 입력 문자열 → 숫자(빈 값은 null). */
const n = (v: string, scale = 1): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const x = Number(t);
  return Number.isFinite(x) ? x / scale : null;
};

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
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const [metric, setMetric] = useState(s(values.currentMetric));
  const [growth, setGrowth] = useState(s(values.expectedGrowth, 100));
  const [multiple, setMultiple] = useState(s(values.terminalMultiple));
  const [years, setYears] = useState(s(values.holdingYears));
  const [required, setRequired] = useState(s(values.requiredReturn, 100));

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

  function save() {
    // 비워두면 공시값을 계속 따라간다(실적이 갱신되면 매수가도 자동으로 바뀜).
    const currentMetric = n(metric);
    const expectedGrowth = n(growth, 100);
    const terminalMultiple = n(multiple);
    if (currentMetric == null && autoMetric == null) {
      toast.error("공시 이익이 없어 직접 입력이 필요해요.");
      return;
    }
    if (expectedGrowth == null || terminalMultiple == null) {
      toast.error("성장률과 종료 배수는 직접 정해야 해요.");
      return;
    }
    start(async () => {
      const res = await setExpectedReturn(symbol, {
        currentMetric,
        expectedGrowth,
        terminalMultiple,
        holdingYears: n(years),
        requiredReturn: n(required, 100),
        baseMetric: null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("가정 저장됨 — 자본배분에도 반영돼요");
      setOpen(false);
      router.refresh();
    });
  }

  function clear() {
    start(async () => {
      const res = await clearExpectedReturn(symbol);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("가정 삭제됨 — 비중 기준으로만 배분해요");
      setMetric("");
      setGrowth("");
      setMultiple("");
      setYears("");
      setRequired("");
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
        <div className="mt-3 rounded-lg border border-border p-3">
          <Field
            label={`현재 주당 이익 (EPS, ${currencySymbol})`}
            hint={
              autoMetric != null
                ? `비워두면 공시값 ${currencySymbol}${fmt(autoMetric)} 을 계속 따라가요(실적 갱신 시 자동 반영). 직접 넣으면 그 값이 우선합니다.`
                : "공시 이익을 아직 못 불러왔어요. 공시에 적힌 값을 종목 통화로 넣어주세요."
            }
            value={metric}
            onChange={setMetric}
            placeholder={autoMetric != null ? `공시값 ${fmt(autoMetric)}` : "1.35"}
          />
          <Field
            label="향후 이익 성장률 (연 %)"
            hint="보유기간 동안의 연평균. 음수도 가능."
            value={growth}
            onChange={setGrowth}
            placeholder="35"
          />
          <Field
            label="종료 시점 배수 (PER)"
            hint="보유기간이 끝날 때 이 기업이 받을 배수."
            value={multiple}
            onChange={setMultiple}
            placeholder="50"
          />
          <Field
            label={`보유기간 (년) · 기본 ${DEFAULT_HOLDING_YEARS}`}
            value={years}
            onChange={setYears}
            placeholder={String(DEFAULT_HOLDING_YEARS)}
          />
          <Field
            label={`요구수익률 (%) · 내 허들 ${+(houseRequiredReturn * 100).toFixed(2)}`}
            hint="비워두면 자본배분의 '내 허들'을 따라갑니다. 이 수익률에 못 미치면 매수 후보에서 빠져요."
            value={required}
            onChange={setRequired}
            placeholder={String(+(houseRequiredReturn * 100).toFixed(2))}
          />

          <div className="mt-3 flex gap-2">
            <Button
              onClick={save}
              disabled={pending}
              className="h-9 flex-1 bg-primary text-xs font-semibold text-primary-foreground"
            >
              저장
            </Button>
            {saved && (
              <Button
                variant="secondary"
                onClick={clear}
                disabled={pending}
                className="h-9 px-3 text-xs"
              >
                삭제
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="h-9 px-3 text-xs"
            >
              취소
            </Button>
          </div>
        </div>
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
