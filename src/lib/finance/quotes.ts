/**
 * 지수·환율 등 "시세 전용" 종목 — 펀더멘털이 없어 관심종목에서 시세만 추적.
 * 야후 심볼 사용(토스 교체 시 search/quote seam 에서 함께 매핑).
 */
export interface PresetQuote {
  symbol: string;
  name: string;
  /** ISO 국가코드 — 지수 플래그 표시용. */
  country?: string;
  /** true면 /index/[symbol] 상세 페이지 진입 허용. */
  isIndex?: boolean;
  /** 지수가 대표하는 시장과 산출 방식. 지수 상세 개요에 표시. */
  description?: string;
}

export const PRESET_QUOTES: PresetQuote[] = [
  {
    symbol: "^KS11",
    name: "코스피",
    country: "KR",
    isIndex: true,
    description: "유가증권시장에 상장된 주식의 전반적인 흐름을 시가총액 방식으로 보여주는 한국 대표 지수입니다.",
  },
  {
    symbol: "^KQ11",
    name: "코스닥",
    country: "KR",
    isIndex: true,
    description: "코스닥시장 상장 종목의 전반적인 흐름을 시가총액 방식으로 보여주는 지수입니다. 성장기업과 기술기업 비중이 비교적 큽니다.",
  },
  {
    symbol: "^GSPC",
    name: "S&P 500",
    country: "US",
    isIndex: true,
    description: "미국을 대표하는 대형 상장기업 약 500곳으로 구성된 시가총액 가중 지수입니다. 미국 대형주 시장의 흐름을 폭넓게 보여줍니다.",
  },
  {
    symbol: "^IXIC",
    name: "나스닥",
    country: "US",
    isIndex: true,
    description: "나스닥 시장에 상장된 보통주 전반을 담는 시가총액 가중 지수입니다. 기술기업 비중이 크지만 기술주만으로 구성되지는 않습니다.",
  },
  {
    symbol: "^DJI",
    name: "다우",
    country: "US",
    isIndex: true,
    description: "미국의 대표적인 대형 우량기업 30곳으로 구성된 가격 가중 지수입니다. 시가총액보다 주가가 높은 종목의 움직임이 더 크게 반영됩니다.",
  },
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

/** `{CCY}KRW=X` 환율 심볼 → 통화코드(예: "USDKRW=X" → "USD"). 환율 아니면 null. */
export function fxCodeFromSymbol(symbol: string): string | null {
  const m = /^([A-Za-z]{3})KRW=X$/.exec(symbol.trim());
  return m ? m[1].toUpperCase() : null;
}
