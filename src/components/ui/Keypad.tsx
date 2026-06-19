"use client";

import { Delete } from "lucide-react";

/**
 * 계산기 키패드 프리미티브(목업 거래 플로우) — 바텀시트(NumberPad)와
 * 위저드 인라인 스텝(AmountStep)이 공유. 값은 문자열로 관리(외부 상태·Number()와 호환).
 */

/** 정수부 천단위 콤마(소수부는 입력 그대로). "1234.5" → "1,234.5" */
export function grouped(raw: string): string {
  if (!raw) return "";
  const [int, dec] = raw.split(".");
  const gi = (int || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${gi}.${dec}` : gi;
}

/** 표시 문자열(접두·접미 포함). 값이 비면 "0" 자리. */
export function formatNumber(raw: string, prefix = "", suffix = ""): string {
  return `${prefix}${grouped(raw || "0")}${suffix}`;
}

/** 키 입력 한 번을 문자열 값에 반영(앞자리 0·중복 소수점·00 처리). */
export function applyKey(value: string, k: string, decimal: boolean): string {
  if (k === "del") return value.slice(0, -1);
  if (k === ".") {
    if (!decimal) return value;
    if (!value) return "0.";
    return value.includes(".") ? value : value + ".";
  }
  if (k === "00") return value && value !== "0" ? value + "00" : value;
  // 숫자 0~9
  if (value === "0") return k; // 외톨이 0 은 교체
  return value + k;
}

/** 3×4 키패드 그리드만 — 큰 숫자 표시는 호출부가 그린다. */
export function Keypad({
  value,
  onChange,
  decimal = false,
}: {
  value: string;
  onChange: (v: string) => void;
  decimal?: boolean;
}) {
  const keys = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    decimal ? "." : "00", "0", "del",
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(applyKey(value, k, decimal))}
          className="flex items-center justify-center rounded-2xl py-4 text-2xl font-semibold tabular-nums transition active:bg-secondary"
        >
          {k === "del" ? <Delete size={26} aria-label="지우기" /> : k}
        </button>
      ))}
    </div>
  );
}
