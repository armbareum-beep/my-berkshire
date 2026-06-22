/**
 * 지수 요약 지표 — Yahoo Finance v10 quoteSummary (crumb 필요).
 * 지수 심볼(^GSPC 등)은 summaryDetail에서 PE/PBR을 제공하지 않으므로
 * 추종 ETF(SPY, QQQ 등)를 프록시로 사용해 valuation 지표를 가져옴.
 */

import { getYahooCrumb } from "./yahooCrumb";
import { fetchWeightedRoe } from "./etfStats";
import { createClient } from "@/lib/supabase/server";

/** 지수 → 추종 ETF 프록시 맵 (PE/PBR/섹터 데이터 소스). */
const INDEX_ETF_PROXY: Record<string, string> = {
  "^GSPC": "SPY",   // S&P 500 → SPDR S&P 500
  "^IXIC": "QQQ",   // NASDAQ → Invesco QQQ (NASDAQ-100)
  "^DJI":  "DIA",   // Dow Jones → SPDR Dow Jones
  "^N225": "EWJ",   // 닛케이 → iShares MSCI Japan
  "^HSI":  "EWH",   // 항셍 → iShares MSCI Hong Kong
  "^FTSE": "EWU",   // FTSE 100 → iShares MSCI UK
  // ^KS11·^KQ11: 한국 지수 — Yahoo ETF 데이터 없음, 지표 미제공(—)
};

export interface IndexSummary {
  trailingPE: number | null;
  forwardPE: number | null;
  pbr: number | null;
  roe: number | null;  // 소수(0.34=34%), 상위 10개 보유 종목 비중 가중평균
  dividendYield: number | null;
  holdings: Array<{ symbol: string; name: string; weight: number }>;
  sectors: Array<{ name: string; weight: number }>;
}

export interface ShillerCape {
  value: number;
  asOf: string;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "raw" in v) {
    const r = (v as { raw: unknown }).raw;
    return typeof r === "number" && isFinite(r) ? r : null;
  }
  return null;
}

/** topHoldings.equityHoldings는 역수(yield) 형식 → 1/raw가 실제 배수. */
function yieldToRatio(v: unknown): number | null {
  const y = numOrNull(v);
  if (y === null || y <= 0 || y >= 2) return null;
  return Math.round((1 / y) * 100) / 100;
}

/** v10 quoteSummary — topHoldings(섹터/구성종목) + summaryDetail(PER/PBR/배당).
 *  v7는 Yahoo가 2026년 차단. 크럼의 '/'를 URL 인코딩하면 거부되므로 문자열 직접 조합. */
async function fetchQuoteSummary(symbol: string): Promise<{
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  holdings: Array<{ symbol: string; name: string; weight: number }>;
  sectors: Array<{ name: string; weight: number }>;
} | null> {
  const auth = await getYahooCrumb();
  const base = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=topHoldings,summaryDetail`;
  const urlStr = auth ? `${base}&crumb=${auth.crumb}` : base;

  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (auth) headers.Cookie = auth.cookies;

  try {
    const res = await fetch(urlStr, {
      headers,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return null;

    const top = result.topHoldings;
    const sd = result.summaryDetail;

    const rawHoldings: unknown[] = top?.holdings ?? [];
    const holdings = rawHoldings.slice(0, 10).flatMap((h) => {
      if (typeof h !== "object" || h === null) return [];
      const obj = h as Record<string, unknown>;
      const sym = typeof obj.symbol === "string" ? obj.symbol : null;
      const name = typeof obj.holdingName === "string" ? obj.holdingName : "";
      const weight = numOrNull(obj.holdingPercent);
      if (!sym || weight === null) return [];
      return [{ symbol: sym, name, weight }];
    });

    const rawSectors: unknown[] = top?.sectorWeightings ?? [];
    const sectors = rawSectors
      .flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        return Object.entries(s as Record<string, unknown>).flatMap(([key, val]) => {
          const w = numOrNull(val);
          if (w === null) return [];
          return [{ name: key, weight: w }];
        });
      })
      .sort((a, b) => b.weight - a.weight);

    const eq = result.topHoldings?.equityHoldings ?? {};
    return {
      trailingPE: numOrNull(sd?.trailingPE),
      forwardPE: numOrNull(sd?.forwardPE),
      // summaryDetail.priceToBook은 ETF엔 없음 → topHoldings.equityHoldings(역수 변환) 폴백
      priceToBook: numOrNull(sd?.priceToBook) ?? yieldToRatio(eq.priceToBook),
      dividendYield: numOrNull(sd?.trailingAnnualDividendYield),
      holdings,
      sectors,
    };
  } catch {
    return null;
  }
}

/** KRX 캐시에서 한국 지수 PER·PBR 읽기. Yahoo에서 제공하지 않는 ^KS11·^KQ11 전용. */
export async function getKrxIndexStats(
  symbol: string,
): Promise<{ per: number | null; pbr: number | null; dividendYield: number | null } | null> {
  const KRX_SYMBOLS = ["^KS11", "^KQ11"];
  if (!KRX_SYMBOLS.includes(symbol)) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("krx_index_stats_cache")
      .select("per, pbr, dividend_yield")
      .eq("symbol", symbol)
      .single();
    if (!data) return null;
    return {
      per: typeof data.per === "number" ? data.per : null,
      pbr: typeof data.pbr === "number" ? data.pbr : null,
      dividendYield: typeof data.dividend_yield === "number" ? data.dividend_yield : null,
    };
  } catch {
    return null;
  }
}

export async function getIndexSummary(symbol: string): Promise<IndexSummary | null> {
  // 지수 자체 조회 (섹터/구성종목 시도) + ETF 프록시 + KRX 캐시 병렬
  const proxySymbol = INDEX_ETF_PROXY[symbol];
  const [indexData, proxyData, krxData] = await Promise.all([
    fetchQuoteSummary(symbol),
    proxySymbol ? fetchQuoteSummary(proxySymbol) : Promise.resolve(null),
    getKrxIndexStats(symbol),
  ]);

  if (!indexData && !proxyData && !krxData) return null;

  const holdings = proxyData?.holdings ?? indexData?.holdings ?? [];
  const roe = await fetchWeightedRoe(holdings);

  // PER·PBR 우선순위: KRX 캐시(한국 지수) > ETF 프록시 > 지수 직접
  return {
    trailingPE: krxData?.per ?? proxyData?.trailingPE ?? indexData?.trailingPE ?? null,
    forwardPE: proxyData?.forwardPE ?? indexData?.forwardPE ?? null,
    pbr: krxData?.pbr ?? proxyData?.priceToBook ?? indexData?.priceToBook ?? null,
    roe,
    dividendYield:
      krxData?.dividendYield ??
      proxyData?.dividendYield ??
      indexData?.dividendYield ??
      null,
    holdings,
    sectors: proxyData?.sectors ?? indexData?.sectors ?? [],
  };
}

/** Shiller CAPE — S&P 500 전용. FRED API (키 불필요). */
export async function getShillerCape(): Promise<ShillerCape | null> {
  try {
    const res = await fetch(
      "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CAPE",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) return null;

    const text = await res.text();
    const lines = text.trim().split("\n");
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(",");
      if (parts.length < 2) continue;
      const date = parts[0].trim();
      const value = parseFloat(parts[1].trim());
      if (!isNaN(value) && value > 0) return { value, asOf: date };
    }
    return null;
  } catch {
    return null;
  }
}
