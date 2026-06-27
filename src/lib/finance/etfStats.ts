/**
 * ETF 구성 지표 — Yahoo Finance v7/quote (인증 불필요) + v10 topHoldings (crumb).
 * v7는 trailingPE/PBR을 안정적으로 제공. v10 topHoldings는 가중평균+섹터+구성종목용.
 * 토스증권 Open API 승인 시 내부 fetch 구현만 교체(인터페이스 유지).
 */

import { getYahooCrumb } from "./yahooCrumb";

export interface EtfEquityHoldings {
  per: number | null;
  pbr: number | null;
  roe: number | null;
  psr: number | null;
}

export interface EtfHolding {
  symbol: string;
  name: string;
  weight: number;
}

export interface EtfSector {
  name: string;
  weight: number;
}

export interface EtfStats {
  equityHoldings: EtfEquityHoldings;
  holdings: EtfHolding[];
  sectors: EtfSector[];
  dividendYield: number | null;
}

const SECTOR_KO: Record<string, string> = {
  technology: "기술",
  healthcare: "헬스케어",
  financial_services: "금융",
  financialServices: "금융",
  consumer_cyclical: "임의소비재",
  consumerCyclical: "임의소비재",
  industrials: "산업재",
  communication_services: "커뮤니케이션",
  communicationServices: "커뮤니케이션",
  consumer_defensive: "필수소비재",
  consumerDefensive: "필수소비재",
  energy: "에너지",
  basic_materials: "소재",
  basicMaterials: "소재",
  real_estate: "부동산",
  realEstate: "부동산",
  utilities: "유틸리티",
};

function toYahooCandidates(symbol: string): string[] {
  return /^\d{6}$/.test(symbol) ? [`${symbol}.KS`, `${symbol}.KQ`] : [symbol];
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "raw" in v) {
    const r = (v as { raw: unknown }).raw;
    return typeof r === "number" && isFinite(r) ? r : null;
  }
  return null;
}

/** topHoldings.equityHoldings는 비율 역수(yield) 형식으로 저장됨 → 1/raw가 실제 배수. */
function yieldToRatio(v: unknown): number | null {
  const y = numOrNull(v);
  if (y === null || y <= 0 || y >= 2) return null; // 2 이상은 이미 배수 형식으로 본 것이므로 스킵
  return Math.round((1 / y) * 100) / 100;
}

/** v10 quoteSummary — crumb 필요. topHoldings(가중평균 PER/PBR/ROE + 섹터 + 구성종목) +
 *  summaryDetail(trailingPE·PBR·배당수익률). v7는 Yahoo가 2026년 차단. */
async function fetchTopHoldings(yahooSymbol: string): Promise<{
  equityHoldings: EtfEquityHoldings;
  holdings: EtfHolding[];
  sectors: EtfSector[];
  dividendYield: number | null;
} | null> {
  const auth = await getYahooCrumb();
  // URLSearchParams는 크럼의 '/' 등을 %2F로 인코딩 → Yahoo 거부. 문자열 직접 조합.
  const base = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=topHoldings,summaryDetail`;
  const urlStr = auth ? `${base}&crumb=${auth.crumb}` : base;

  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (auth) headers.Cookie = auth.cookies;

  try {
    const res = await fetch(urlStr, {
      headers,
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return null;

    const top = result.topHoldings;
    const sd = result.summaryDetail;

    // summaryDetail에서 PER/PBR/배당수익률 (v7 대체)
    const sdPer = numOrNull(sd?.trailingPE);
    const sdPbr = numOrNull(sd?.priceToBook);
    const sdDivYield = numOrNull(sd?.trailingAnnualDividendYield);

    const eq = top?.equityHoldings ?? {};
    // topHoldings.equityHoldings 값들은 역수(yield) 형식 — yieldToRatio로 배수 변환.
    // PER은 summaryDetail.trailingPE가 올바름(trailingPE가 직접 배수). ROE는 미제공.
    const equityHoldings: EtfEquityHoldings = {
      per: sdPer ?? yieldToRatio(eq.priceToEarnings),
      pbr: yieldToRatio(eq.priceToBook) ?? sdPbr,
      roe: numOrNull(eq.returnOnEquity),
      psr: yieldToRatio(eq.priceToSales),
    };

    const rawHoldings: unknown[] = top?.holdings ?? [];
    const holdings: EtfHolding[] = rawHoldings.slice(0, 10).flatMap((h) => {
      if (typeof h !== "object" || h === null) return [];
      const obj = h as Record<string, unknown>;
      const sym = typeof obj.symbol === "string" ? obj.symbol : null;
      const name = typeof obj.holdingName === "string" ? obj.holdingName : "";
      const weight = numOrNull(obj.holdingPercent);
      if (!sym || weight === null) return [];
      return [{ symbol: sym, name, weight }];
    });

    const rawSectors: unknown[] = top?.sectorWeightings ?? [];
    const sectors: EtfSector[] = rawSectors
      .flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        return Object.entries(s as Record<string, unknown>).flatMap(([key, val]) => {
          const w = numOrNull(val);
          if (w === null) return [];
          return [{ name: SECTOR_KO[key] ?? key, weight: w }];
        });
      })
      .sort((a, b) => b.weight - a.weight);

    const hasAnything =
      equityHoldings.per !== null ||
      equityHoldings.pbr !== null ||
      holdings.length > 0 ||
      sectors.length > 0 ||
      sdDivYield !== null;
    if (!hasAnything) return null;

    return { equityHoldings, holdings, sectors, dividendYield: sdDivYield };
  } catch {
    return null;
  }
}

/**
 * 상위 보유 종목의 개별 ROE를 병렬 조회해 비중 가중평균 반환.
 * Yahoo topHoldings는 ROE를 제공하지 않으므로 종목별 financialData를 직접 조회.
 * revalidate 86400 캐싱 덕에 반복 로드 비용 없음.
 */
export async function fetchWeightedRoe(
  holdings: EtfHolding[],
): Promise<number | null> {
  if (!holdings.length) return null;
  const auth = await getYahooCrumb();

  const results = await Promise.allSettled(
    holdings.map(async (h) => {
      const base = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(h.symbol)}?modules=financialData`;
      const urlStr = auth ? `${base}&crumb=${auth.crumb}` : base;
      const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
      if (auth) headers.Cookie = auth.cookies;
      const res = await fetch(urlStr, { headers, next: { revalidate: 86400 } });
      if (!res.ok) return null;
      const json = await res.json();
      const roe = numOrNull(json?.quoteSummary?.result?.[0]?.financialData?.returnOnEquity);
      return roe !== null ? { weight: h.weight, roe } : null;
    }),
  );

  let sumW = 0, sumWRoe = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      sumW += r.value.weight;
      sumWRoe += r.value.weight * r.value.roe;
    }
  }
  return sumW > 0 ? sumWRoe / sumW : null; // 소수(Yahoo raw 형식 그대로) — 0.34 = 34%
}

async function fetchFromYahoo(yahooSymbol: string): Promise<EtfStats | null> {
  const top = await fetchTopHoldings(yahooSymbol);
  if (!top) return null;

  const roe = await fetchWeightedRoe(top.holdings);

  return {
    equityHoldings: { ...top.equityHoldings, roe },
    holdings: top.holdings,
    sectors: top.sectors,
    dividendYield: top.dividendYield,
  };
}

export async function getEtfStats(symbol: string, proxySymbol?: string): Promise<EtfStats | null> {
  let directResult: EtfStats | null = null;
  for (const candidate of toYahooCandidates(symbol)) {
    try {
      const result = await fetchFromYahoo(candidate);
      if (result?.equityHoldings.per != null) return result; // PER 있으면 확정
      if (result && !directResult) directResult = result;   // PER 없어도 일단 보관
    } catch {
      // 다음 후보 시도
    }
  }
  // 한국 ETF는 Yahoo가 PER·구성데이터를 미제공 → 동일 지수 미국 ETF(proxy)로 보완.
  // directResult가 있어도 PER이 없으면 proxy를 시도해 equityHoldings를 덮어씀.
  if (proxySymbol) {
    try {
      const proxy = await fetchFromYahoo(proxySymbol);
      if (proxy) {
        // holdings·sectors는 직접 조회 결과 우선, equityHoldings(PER·PBR 등)는 proxy 사용.
        return directResult
          ? { ...directResult, equityHoldings: proxy.equityHoldings }
          : proxy;
      }
    } catch {
      // ignore
    }
  }
  return directResult;
}
