/**
 * 지수 요약 지표 — Yahoo Finance v10 quoteSummary (crumb 필요).
 * 지수 심볼(^GSPC 등)은 summaryDetail에서 PE/PBR을 제공하지 않으므로
 * 추종 ETF(SPY, QQQ 등)를 프록시로 사용해 valuation 지표를 가져옴.
 */

import { getYahooCrumb } from "./yahooCrumb";
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
  pbr: number | null;
  roe: number | null;  // 소수(0.34=34%), 상위 10개 보유 종목 비중 가중평균
  dividendYield: number | null;
  holdings: Array<{ symbol: string; name: string; weight: number }>;
  sectors: Array<{ name: string; weight: number }>;
  /** 한국 지수(^KS11·^KQ11) 여부 — PER/PBR/배당이 KRX 캐시 전용 출처. */
  isKoreaIndex: boolean;
  /** 한국 지수의 KRX 캐시 행 존재 여부. false면 "데이터 준비 중"(미동기화). */
  krxAvailable: boolean;
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

/** PER/PBR/배당이 KRX 캐시 전용 출처인 한국 지수. */
const KRX_INDEX_SYMBOLS = ["^KS11", "^KQ11"];

/** KRX 캐시에서 한국 지수 PER·PBR 읽기. Yahoo에서 제공하지 않는 ^KS11·^KQ11 전용. */
export async function getKrxIndexStats(
  symbol: string,
): Promise<{ per: number | null; pbr: number | null; dividendYield: number | null } | null> {
  if (!KRX_INDEX_SYMBOLS.includes(symbol)) return null;
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

  const isKoreaIndex = KRX_INDEX_SYMBOLS.includes(symbol);

  // 한국 지수는 KRX 캐시가 비어도(미동기화) "데이터 준비 중"을 셀별로 보여주기 위해
  // 요약 객체를 유지한다. 그 외 지수는 출처가 전혀 없으면 null.
  if (!indexData && !proxyData && !krxData && !isKoreaIndex) return null;

  const holdings = proxyData?.holdings ?? indexData?.holdings ?? [];

  // PER·PBR 우선순위: KRX 캐시(한국 지수) > ETF 프록시 > 지수 직접
  const trailingPE = krxData?.per ?? proxyData?.trailingPE ?? indexData?.trailingPE ?? null;
  const pbr = krxData?.pbr ?? proxyData?.priceToBook ?? indexData?.priceToBook ?? null;

  // ROE = PBR / PER (회계 항등식: E/B = (P/PER)/(P/PBR)). 지수 단위 한 쌍으로 일관 산출 —
  // 구성종목 가중(상위10) 불필요. 한국·미국·ETF 모두 동일.
  const roe = pbr != null && trailingPE != null && trailingPE > 0 ? pbr / trailingPE : null;

  // KRX 행이 있어도 값이 전부 null(미발표·싱크 미완)이면 "준비 중"으로 취급.
  const krxHasValue =
    krxData != null &&
    (krxData.per != null || krxData.pbr != null || krxData.dividendYield != null);

  return {
    trailingPE,
    pbr,
    roe,
    dividendYield:
      krxData?.dividendYield ??
      proxyData?.dividendYield ??
      indexData?.dividendYield ??
      null,
    holdings,
    sectors: proxyData?.sectors ?? indexData?.sectors ?? [],
    isKoreaIndex,
    krxAvailable: krxHasValue,
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
