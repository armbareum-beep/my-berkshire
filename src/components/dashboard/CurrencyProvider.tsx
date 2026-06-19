"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { Currency } from "@/lib/format";

/**
 * 표시 통화(₩/$) 클라이언트 컨텍스트 — 토글을 **서버 왕복 없이** 즉시 전환.
 * 계산은 ₩ 기준(서버에서 ₩·$ 두 버전을 미리 렌더), 여기선 어느 쪽을 보일지만 고른다.
 * 영속화는 쿠키에 직접 기록 → 다음 네비게이션/방문 때 서버가 같은 통화로 렌더(플래시 없음).
 */
type CurrencyCtx = {
  currency: Currency;
  setCurrency: (c: Currency) => void;
};

const Ctx = createContext<CurrencyCtx | null>(null);

export function CurrencyProvider({
  initial,
  children,
}: {
  initial: Currency;
  children: React.ReactNode;
}) {
  const [currency, setCurrencyState] = useState<Currency>(initial);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    // 쿠키를 클라이언트에서 직접 — 서버 액션·새로고침 없이 즉시. SSR 초깃값은 이 쿠키를 읽는다.
    document.cookie = `display_ccy=${c === "USD" ? "USD" : "KRW"}; path=/; max-age=${
      60 * 60 * 24 * 365
    }`;
  }, []);

  return <Ctx value={{ currency, setCurrency }}>{children}</Ctx>;
}

export function useCurrency(): CurrencyCtx {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useCurrency 는 CurrencyProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
