/**
 * Yahoo Finance crumb 인증 — v10 quoteSummary 접근용.
 * 서버사이드 전용(쿠키 관리 필요). 토스 API 교체 시 이 파일만 제거.
 *
 * 흐름: fc.yahoo.com → 쿠키 → getcrumb → crumb
 * crumb은 모듈 변수에 1시간 캐시. 실패 시 null 반환(호출부에서 TER 없는 것으로 처리).
 */

interface CrumbCache {
  crumb: string;
  cookies: string;
  expires: number;
}

let cache: CrumbCache | null = null;

export async function getYahooCrumb(): Promise<{ crumb: string; cookies: string } | null> {
  if (cache && Date.now() < cache.expires) {
    return { crumb: cache.crumb, cookies: cache.cookies };
  }

  try {
    const fcRes = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const rawCookies = fcRes.headers.getSetCookie();
    const cookies = rawCookies.map((c) => c.split(";")[0]).join("; ");

    const crumbRes = await fetch(
      "https://query1.finance.yahoo.com/v1/test/getcrumb",
      { headers: { "User-Agent": "Mozilla/5.0", Cookie: cookies } },
    );
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    // 오류 응답은 JSON이므로 "{" 로 시작하면 실패
    if (!crumb || crumb.startsWith("{")) return null;

    cache = { crumb, cookies, expires: Date.now() + 60 * 60 * 1000 };
    return { crumb, cookies };
  } catch {
    return null;
  }
}

/**
 * ETF 심볼 → 연간 총보수(소수). 실패 시 null.
 * 미국 ETF 전용(한국 ETF는 Yahoo가 제공 안 함).
 */
export async function fetchEtfTer(symbol: string): Promise<number | null> {
  const auth = await getYahooCrumb();
  if (!auth) return null;

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics&crumb=${encodeURIComponent(auth.crumb)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0", Cookie: auth.cookies },
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const ratio =
      json?.quoteSummary?.result?.[0]?.defaultKeyStatistics
        ?.annualReportExpenseRatio?.raw;
    return typeof ratio === "number" ? ratio : null;
  } catch {
    return null;
  }
}

/** ETF 심볼 배열 → TER 맵. 병렬 조회. 실패 종목은 맵에서 빠짐. */
export async function fetchEtfTers(symbols: string[]): Promise<Map<string, number>> {
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const ter = await fetchEtfTer(symbol);
      return ter != null ? ([symbol, ter] as const) : null;
    }),
  );
  const map = new Map<string, number>();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) map.set(r.value[0], r.value[1]);
  }
  return map;
}
