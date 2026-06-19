"use client";

import { Keypad, formatNumber } from "@/components/ui/Keypad";
import { QuickAdd } from "@/components/ui/QuickAdd";
import { Flag } from "@/components/ui/Flag";
import { CURRENCIES } from "@/lib/finance/currencies";

/**
 * 금액/단가/수량 입력 본문 — 큰 숫자 + 인라인 계산기 + 빠른더하기 + 보조설명.
 * 위저드의 단가·수량·금액 스텝이 공유(prefix/suffix/decimal 로 구분).
 */
export function AmountBody({
  value,
  onChange,
  prefix = "",
  suffix = "",
  decimal = false,
  quickAddSteps,
  quickAddLabel,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  decimal?: boolean;
  quickAddSteps?: number[];
  quickAddLabel?: (n: number) => string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="py-4 text-center text-5xl font-extrabold tracking-tight tabular-nums">
        {value ? (
          formatNumber(value, prefix, suffix)
        ) : (
          <span className="text-muted-foreground/30">
            {formatNumber("0", prefix, suffix)}
          </span>
        )}
      </div>
      {hint && <div className="mb-2 text-center text-sm">{hint}</div>}
      {quickAddSteps && (
        <div className="flex justify-center">
          <QuickAdd
            value={value}
            onChange={onChange}
            steps={quickAddSteps}
            label={quickAddLabel}
          />
        </div>
      )}
      <div className="mt-auto">
        <Keypad value={value} onChange={onChange} decimal={decimal} />
      </div>
    </div>
  );
}

/** 통화 선택 칩 행 — 증자/인출(단일)·환전(from/to)에서 사용. */
export function CurrencyChips({
  value,
  onSelect,
  exclude,
}: {
  value: string;
  onSelect: (code: string) => void;
  /** 제외할 통화(환전 받는 통화에서 보내는 통화 제외). */
  exclude?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CURRENCIES.filter((c) => c.code !== exclude).map((c) => (
        <button
          key={c.code}
          type="button"
          onClick={() => onSelect(c.code)}
          className={
            "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold " +
            (c.code === value
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground")
          }
        >
          <Flag code={c.code} className="h-3.5 w-5 rounded-[2px] object-cover" />
          {c.label}
        </button>
      ))}
    </div>
  );
}
