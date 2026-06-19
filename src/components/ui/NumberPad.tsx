"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Keypad, formatNumber, grouped } from "@/components/ui/Keypad";

/**
 * 계산기식 숫자 입력(목업 거래 플로우 이식) — 네이티브 키보드 대신 하단 시트 키패드.
 * 칸을 탭하면 큰 숫자 + 3×4 키패드가 올라와 그 칸을 채운다(토스 송금 무드).
 * 값은 문자열로 관리(외부 onChange 와 호환 — QuickAdd·Number() 그대로 사용).
 * 키패드 그리드·입력 로직은 공용 Keypad 프리미티브 재사용.
 */

export function NumberPad({
  value,
  onChange,
  onClose,
  prefix = "",
  suffix = "",
  decimal = false,
  title,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  prefix?: string;
  suffix?: string;
  /** 소수점 허용(코인 수량·달러 센트). false 면 "00" 키. */
  decimal?: boolean;
  title?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="relative mx-auto w-full max-w-[480px] rounded-t-3xl bg-card px-5 pb-8 pt-4 shadow-card-lg">
        <div className="mx-auto mb-2 h-1.5 w-9 rounded-full bg-border" />
        {title && <p className="text-center text-sm text-muted-foreground">{title}</p>}
        <div className="py-5 text-center text-5xl font-extrabold tracking-tight tabular-nums">
          {value ? (
            formatNumber(value, prefix, suffix)
          ) : (
            <span className="text-muted-foreground/30">{formatNumber("0", prefix, suffix)}</span>
          )}
        </div>
        {hint && <div className="mb-2 text-center">{hint}</div>}
        <Keypad value={value} onChange={onChange} decimal={decimal} />
        <button
          type="button"
          onClick={onClose}
          className="mt-3 h-12 w-full rounded-xl bg-primary text-base font-semibold text-primary-foreground transition active:scale-[0.99]"
        >
          확인
        </button>
      </div>
    </div>
  );
}

/**
 * 키패드로 입력하는 숫자 칸 — 라벨 + 탭하면 키패드 시트가 뜨는 디스플레이.
 * 기존 <Input type=number> 자리를 대체. 값은 문자열(외부 상태와 동일).
 */
export function NumberPadField({
  label,
  value,
  onChange,
  placeholder,
  prefix = "",
  suffix = "",
  decimal = false,
  title,
  hint,
  className,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  decimal?: boolean;
  title?: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      {label && <label className="text-sm font-medium">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "mt-2 flex h-12 w-full items-center rounded-xl border border-input bg-card px-3 text-lg tabular-nums transition active:scale-[0.99]",
          !value && "text-muted-foreground",
        )}
      >
        {value ? `${prefix}${grouped(value)}${suffix}` : (placeholder ?? "0")}
      </button>
      {open && (
        <NumberPad
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
          prefix={prefix}
          suffix={suffix}
          decimal={decimal}
          title={title ?? label}
          hint={hint}
        />
      )}
    </div>
  );
}
