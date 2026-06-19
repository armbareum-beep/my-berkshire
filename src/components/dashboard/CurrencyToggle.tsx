"use client";

import { useCurrency } from "./CurrencyProvider";
import type { Currency } from "@/lib/format";

/**
 * 표시 통화 토글(₩/$) — 클라이언트 컨텍스트만 뒤집어 **즉시** 전환(서버 왕복·새로고침 없음).
 * 서버가 ₩·$ 두 버전을 미리 렌더하고 CurrencyView 가 골라 보여 준다. 쿠키 영속화는 컨텍스트가 담당.
 * variant: "chip"=두 칸 토글, "icon"=현재 통화 원형 버튼(누르면 전환).
 */
export function CurrencyToggle({
  current,
  variant = "chip",
}: {
  current: Currency;
  variant?: "chip" | "icon";
}) {
  const { setCurrency } = useCurrency();

  function set(ccy: Currency) {
    if (ccy === current) return;
    setCurrency(ccy);
  }

  if (variant === "icon") {
    // ₩ ⇄ $ 스왑 알약 — 현재 통화 강조 + 화살표로 "전환됨"을 명시. 누르면 전환.
    const next: Currency = current === "KRW" ? "USD" : "KRW";
    const on = "text-foreground";
    const off = "text-muted-foreground/40";
    return (
      <button
        type="button"
        onClick={() => set(next)}
        aria-label={`표시 통화 ${current === "KRW" ? "달러로" : "원화로"} 전환`}
        className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm font-bold transition active:scale-95"
      >
        <span className={current === "KRW" ? on : off}>₩</span>
        <span className="text-xs text-muted-foreground">⇄</span>
        <span className={current === "USD" ? on : off}>$</span>
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-full bg-secondary p-0.5 text-sm">
      {(["KRW", "USD"] as Currency[]).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => set(c)}
          className={
            "rounded-full px-3 py-1 font-bold transition " +
            (current === c
              ? "bg-card text-foreground shadow-card"
              : "text-muted-foreground")
          }
        >
          {c === "KRW" ? "₩ 원화" : "$ 달러"}
        </button>
      ))}
    </div>
  );
}
