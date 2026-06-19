/**
 * 지수·환율 등 "시세 전용" 종목 — 펀더멘털이 없어 관심종목에서 시세만 추적.
 * 야후 심볼 사용(토스 교체 시 search/quote seam 에서 함께 매핑).
 */
export const PRESET_QUOTES: { symbol: string; name: string }[] = [
  { symbol: "^KS11", name: "코스피" },
  { symbol: "^KQ11", name: "코스닥" },
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "나스닥" },
  { symbol: "^DJI", name: "다우" },
  { symbol: "USDKRW=X", name: "원/달러" },
  { symbol: "JPYKRW=X", name: "원/엔" },
  { symbol: "GC=F", name: "금" },
  { symbol: "BTC-USD", name: "비트코인(USD)" },
];

/** 지수·환율 등 펀더멘털 없는 "시세 전용" 여부 — 상세 진입 대신 시세만. */
export function isQuoteOnly(symbol: string, instrumentType?: string): boolean {
  if (instrumentType === "INDEX" || instrumentType === "CURRENCY") return true;
  return symbol.startsWith("^") || symbol.includes("=");
}
