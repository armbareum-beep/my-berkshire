import type { NextRequest } from "next/server";
import { getKrwPrices } from "@/lib/finance/prices";

/**
 * 시세 프록시 — 검색으로 고른 종목의 현재가를 즉시 가져온다(챌린지/라이브 매수가 표시용).
 * 기능통화=KRW 이므로 외국 종목은 현재 환율로 ₩ 환산해 반환(앱 전역 ₩ 일관성).
 * 소스는 prices.getKrwPrices(현재 야후). 토스 교체도 그쪽 한 곳만.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("symbols")?.trim() ?? "";
  const symbols = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const { prices, previousCloses, currencies, available } =
    await getKrwPrices(symbols);
  return Response.json({ prices, previousCloses, currencies, available });
}
