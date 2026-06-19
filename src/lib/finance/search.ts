/**
 * 종목 검색·시세 클라이언트 인터페이스 — UI 는 이 두 함수만 호출한다.
 *
 * 교체 지점: 실제 데이터 소스(현재 야후)는 /api/search · /api/quote 라우트에 있다.
 * 토스증권 Open API 승인 시 그 라우트 구현만 바꾸면 되고, 이 인터페이스·UI 는 그대로.
 */

export interface SymbolSearchResult {
  /** 내부 종목코드(6자리 한국 코드 또는 미국 티커). 거래소 접미사(.KS/.KQ)는 제거됨. */
  symbol: string;
  name: string;
  /** 거래소 표시명(예: KOSPI, KOSDAQ, NASDAQ). 없으면 null. */
  exchange: string | null;
  /** 자산유형(주식/ETF/코인) — 검색 결과 뱃지·필터용. */
  assetType?: string;
  /** ETF 총보수(연, 소수). 참고용. 카탈로그 ETF만 채워짐. */
  ter?: number;
}

/** 종목명·티커로 검색. 빈 질의는 빈 배열. 실패해도 throw 하지 않고 [] 반환. */
export async function searchSymbols(
  query: string,
  signal?: AbortSignal,
): Promise<SymbolSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.results) ? (json.results as SymbolSearchResult[]) : [];
  } catch {
    return []; // AbortError 포함 — 호출부에서 조용히 무시
  }
}

/** 종목코드 배열의 현재가 맵 조회. 실패 시 {}. */
export async function fetchQuotes(
  symbols: string[],
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch(
      `/api/quote?symbols=${encodeURIComponent(symbols.join(","))}`,
    );
    if (!res.ok) return {};
    const json = await res.json();
    return (json?.prices ?? {}) as Record<string, number>;
  } catch {
    return {};
  }
}
