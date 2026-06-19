"use client";

/** 금액 알약 라벨: 10000→"+1만", 10000000→"+1,000만", 1억→"+1억". */
export function wonStepLabel(n: number): string {
  if (n >= 100_000_000) {
    const eok = n / 100_000_000;
    return `+${eok % 1 === 0 ? eok.toLocaleString() : eok}억`;
  }
  if (n >= 10_000) return `+${(n / 10_000).toLocaleString()}만`;
  return `+${n.toLocaleString()}`;
}

/** 금액 입력 기본 단계(원). */
export const WON_STEPS = [10_000, 100_000, 1_000_000, 10_000_000];
/** 수량 입력 기본 단계(주). */
export const QTY_STEPS = [1, 10, 100];

/** 달러 알약 라벨: 1→"+$1". */
export function usdStepLabel(n: number): string {
  return `+$${n.toLocaleString()}`;
}

/**
 * 단가(주당 가격) 입력용 통화별 빠른 더하기 설정.
 * 한국 6자리 코드=원(천·만 단위), 그 외=달러($1·$10·$100).
 */
export function priceStepsFor(symbol: string): {
  steps: number[];
  label: (n: number) => string;
} {
  if (/^\d{6}$/.test(symbol))
    return { steps: [1_000, 10_000, 100_000], label: wonStepLabel };
  return { steps: [1, 10, 100], label: usdStepLabel };
}

/**
 * 빠른 더하기 알약 — 누르면 현재 입력값에 더한다(게이미피케이션 입력 보조).
 * 숫자 인풋 바로 아래에 둔다.
 */
export function QuickAdd({
  value,
  onChange,
  steps,
  label = (n) => `+${n.toLocaleString()}`,
  allowClear = true,
}: {
  /** 현재 인풋 문자열 값. */
  value: string;
  onChange: (next: string) => void;
  steps: number[];
  /** 알약 표시 라벨(기본 +숫자). 금액은 wonStepLabel 사용. */
  label?: (n: number) => string;
  allowClear?: boolean;
}) {
  const cur = Number(value) || 0;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {steps.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(String(cur + s))}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm transition active:scale-95"
        >
          {label(s)}
        </button>
      ))}
      {allowClear && cur !== 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground"
        >
          지우기
        </button>
      )}
    </div>
  );
}
