"use client";

import { useEffect, useRef, useState } from "react";
import {
  money,
  signedMoney,
  moneyCompact,
  wonCompact,
  pct,
  signedPct,
  type Currency,
} from "@/lib/format";

/**
 * 히어로 숫자 카운트업(디자인 §5 "값 변경 시 숫자 카운트업").
 * 마운트 시 0→value, 이후 value 변경 시 이전값→새값으로 ease-out 애니메이션.
 * `prefers-reduced-motion` 이면 즉시 최종값(접근성). tabular-nums 로 자리 고정.
 *
 * ⚠️ 서버 컴포넌트에서도 쓰이므로 **함수 prop 금지**(직렬화 불가). 포맷은 직렬화 가능한
 * `format`(문자열 키) + `currency` 로 받아 클라이언트 내부에서 적용한다.
 */
type Fmt =
  | "money"
  | "signedMoney"
  | "moneyCompact"
  | "wonCompact"
  | "pct"
  | "signedPct"
  | "plain";

function applyFmt(n: number, fmt: Fmt, currency: Currency, decimals?: number): string {
  switch (fmt) {
    case "money":
      return money(n, currency);
    case "signedMoney":
      return signedMoney(n, currency);
    case "moneyCompact":
      return moneyCompact(n, currency);
    case "wonCompact":
      return wonCompact(n);
    case "pct":
      return pct(n, decimals);
    case "signedPct":
      return signedPct(n, decimals);
    default:
      return Math.round(n).toLocaleString();
  }
}

export function CountUp({
  value,
  format = "plain",
  currency = "KRW",
  decimals,
  durationMs = 700,
  className,
  style,
}: {
  value: number;
  format?: Fmt;
  currency?: Currency;
  decimals?: number;
  durationMs?: number;
  className?: string;
  /** 색 등 추가 스타일(예: 수익률·손익의 등락색). tabular-nums 는 항상 적용. */
  style?: React.CSSProperties;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    let start: number | null = null;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // ease-out cubic
    const tick = (now: number) => {
      if (start == null) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setDisplay(from + (to - from) * ease(p));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = to; // 중단 시 다음 애니메이션 기준점 보정
    };
  }, [value, durationMs]);

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {applyFmt(display, format, currency, decimals)}
    </span>
  );
}
