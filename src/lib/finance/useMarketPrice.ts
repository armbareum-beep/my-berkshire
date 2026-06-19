"use client";

import { useEffect, useState } from "react";
import { fetchQuotes } from "./search";

/**
 * 고른 종목의 현재가 해석 — 서버가 미리 넘긴 시세(seed, 카탈로그)에 있으면 그걸,
 * 없으면(검색으로 고른 종목) /api/quote 로 즉시 가져온다. 챌린지/라이브 매수가 표시용.
 *
 * seed 는 폼에 prop 으로 들어온 안정적 참조라 키 입력마다 재조회하지 않는다.
 */
export function useMarketPrice(
  symbol: string | null,
  seed: Record<string, number>,
): number | undefined {
  const [extra, setExtra] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!symbol || seed[symbol] != null) return;
    let alive = true;
    fetchQuotes([symbol]).then((p) => {
      if (alive && p[symbol] != null)
        setExtra((e) => ({ ...e, [symbol]: p[symbol] }));
    });
    return () => {
      alive = false;
    };
  }, [symbol, seed]);

  if (!symbol) return undefined;
  return seed[symbol] ?? extra[symbol];
}
