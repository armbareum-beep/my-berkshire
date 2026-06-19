"use client";

import { useCurrency } from "./CurrencyProvider";

/**
 * 표시 통화에 따라 ₩ 또는 $ 버전을 보여 주는 스위처.
 * 서버가 두 버전(krw/usd)을 모두 렌더해 내려보내고, 토글은 클라이언트에서 둘 중 하나만
 * 고른다 → 통화 전환 시 네트워크/서버 재렌더 0. (계산은 서버에서 ₩ 기준으로 끝나 있음.)
 */
export function CurrencyView({
  krw,
  usd,
}: {
  krw: React.ReactNode;
  usd: React.ReactNode;
}) {
  const { currency } = useCurrency();
  return <>{currency === "USD" ? usd : krw}</>;
}
