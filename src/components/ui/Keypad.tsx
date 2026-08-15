"use client";

import { useState } from "react";
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

/**
 * 패드가 막 뜬 상태에서의 **첫 입력은 기존 값을 지우고 시작한다.**
 *
 * 칸에는 대개 값이 미리 들어 있다 — 투자 가능 현금, 지금 목표비중, 고치려는 거래의 금액.
 * 그걸 그대로 이어 쓰면 `50,000,000` 에서 `3` 을 눌렀을 때 `500,000,003` 이 된다.
 * 사용자 지적: *"숫자 누르면 초기화해줘. 지금은 기존 써있는 금액에 추가되어 더해지고 있어."*
 *
 * 지우기(⌫)는 예외다. 처음부터 ⌫ 를 누르는 건 "이 값을 한 글자 지우겠다"는 뜻이지
 * "새로 쓰겠다"가 아니라, 지울 값을 먼저 없애면 아무 일도 안 일어난다.
 */
export function applyFirstKey(
  value: string,
  k: string,
  decimal: boolean,
  fresh: boolean,
): string {
  return applyKey(fresh && k !== "del" ? "" : value, k, decimal);
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
  // "처음"은 **이 패드가 뜬 뒤 아직 사용자가 값을 안 건드린 상태**다.
  //
  // 마운트만으로 판단하면 안 된다 — 키패드 옆에 QuickAdd(+10만) 가 같이 있는 화면에서
  // 퀵애드로 100,000 을 만든 직후 숫자를 누르면 그게 지워진다. 퀵애드도 사용자의 편집이라
  // 그 뒤로는 이어 써야 맞다. 그래서 **뜰 때의 값과 달라졌는지**도 같이 본다.
  // 뜰 때의 값은 `useState` 로 붙든다 — ref 는 렌더 중에 읽을 수 없다(react-hooks/refs).
  const [initial] = useState(value);
  const [typed, setTyped] = useState(false);
  const fresh = !typed && value === initial;

  const press = (k: string) => {
    setTyped(true);
    onChange(applyFirstKey(value, k, decimal, fresh));
  };

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
          onClick={() => press(k)}
          className="flex items-center justify-center rounded-2xl py-4 text-2xl font-semibold tabular-nums transition active:bg-secondary"
        >
          {k === "del" ? <Delete size={26} aria-label="지우기" /> : k}
        </button>
      ))}
    </div>
  );
}
