import type { NextRequest } from "next/server";
import type { SymbolSearchResult } from "@/lib/finance/search";
import { CATALOG, findCatalogItem } from "@/lib/finance/catalog";
import { assetTypeOf } from "@/lib/securities";
import { fetchEtfTers } from "@/lib/finance/yahooCrumb";
import { fetchKrxEtfTers } from "@/lib/finance/krxEtf";
import { createClient } from "@/lib/supabase/server";
import { financeSource } from "@/lib/finance/source";
import { searchKisMaster } from "@/lib/finance/kisMaster";

/** 야후 quoteType + 심볼 → 자산유형 라벨. 카탈로그 명시 유형(원자재 등) 우선. */
function classOf(quoteType: string | undefined, symbol: string): string {
  const cat = findCatalogItem(symbol)?.assetType;
  if (cat) return cat;
  if (quoteType === "CRYPTOCURRENCY") return "코인";
  if (quoteType === "ETF") return "ETF";
  return assetTypeOf(null, symbol); // 코인 심볼 폴백 포함, 그 외 주식
}

/**
 * 종목 검색 프록시 — 현재 소스: 야후 파이낸스 search(키 불필요).
 * 토스증권 Open API 승인 시 이 파일의 fetch·정규화만 교체(인터페이스 유지).
 *
 * 클라이언트가 CORS·User-Agent 제약 없이 검색하도록 서버에서 중계한다.
 */

/** 야후 심볼 → 내부 코드. 005930.KS / 247540.KQ → 005930, AAPL → AAPL. */
function toInternalSymbol(yahooSymbol: string): string {
  const m = yahooSymbol.match(/^(\d{6})\.(KS|KQ)$/);
  return m ? m[1] : yahooSymbol;
}

interface YahooQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  exchDisp?: string;
  quoteType?: string;
}


export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ results: [] });

  // KIS·토스 모드: 한글검색을 종목마스터 인덱스로 처리(소스 무관). 기본(yahoo)이면 아래 기존 경로.
  // 토스도 텍스트검색 API가 없어 동일 마스터 인덱스를 재사용한다.
  if (financeSource() !== "yahoo") {
    const supabaseMaster = await createClient();
    return Response.json({ results: await searchKisMaster(q, supabaseMaster) });
  }

  // 로컬 카탈로그 매칭(한글명·코드). 야후가 한글 질의를 못 받으므로 최소 보장.
  const ql = q.toLowerCase();
  const local: SymbolSearchResult[] = CATALOG.filter(
    (c) => c.name.toLowerCase().includes(ql) || c.symbol.toLowerCase().includes(ql),
  ).map((c) => ({
    symbol: c.symbol,
    name: c.name,
    exchange: null,
    assetType: c.assetType ?? classOf(undefined, c.symbol),
    ter: c.ter,
  }));

  // KRX ETF 전체(871개) 검색 — etf_ter_cache에서 이름·코드 매칭
  // PostgREST .or() 필터는 , ( ) 가 구문 구분자라 사용자 입력을 그대로 넣으면 깨진다.
  // 예약문자·LIKE 와일드카드를 제거한 값만 필터에 사용한다.
  const filterQ = q.replace(/[,()"'\\%_]/g, "");
  const supabaseForEtf = await createClient();
  const { data: krxEtfs } = filterQ
    ? await supabaseForEtf
        .from("etf_ter_cache")
        .select("symbol, name, ter")
        .or(`name.ilike.%${filterQ}%,symbol.ilike.${filterQ}%`)
        .limit(15)
    : { data: [] };
  const seenLocal = new Set(local.map((l) => l.symbol));
  const krxResults: SymbolSearchResult[] = (krxEtfs ?? [])
    .filter((r) => !seenLocal.has(r.symbol))
    .map((r) => ({
      symbol: r.symbol,
      name: r.name,
      exchange: "KRX",
      assetType: "ETF",
      ter: typeof r.ter === "number" ? r.ter : undefined,
    }));

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        q,
      )}&quotesCount=15&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 300 } },
    );
    if (!res.ok) return Response.json({ results: local });

    const json = await res.json();
    const quotes: YahooQuote[] = Array.isArray(json?.quotes) ? json.quotes : [];

    // 로컬 카탈로그 → KRX ETF → 야후 순으로 병합(코드 기준 중복 제거).
    const seen = new Set<string>([...local.map((l) => l.symbol), ...krxResults.map((r) => r.symbol)]);
    const results: SymbolSearchResult[] = [...local, ...krxResults];
    // ETF 심볼 수집 — 미국=Yahoo crumb, 한국=KRX
    const usEtfSymbols: string[] = [];
    const krEtfSymbols: string[] = [];
    for (const qt of quotes) {
      // 주식·ETF + 코인(USD 페어만). 지수·통화·선물·EUR페어 제외.
      const isEquity = qt.quoteType === "EQUITY" || qt.quoteType === "ETF";
      const isCryptoUsd =
        qt.quoteType === "CRYPTOCURRENCY" && !!qt.symbol?.endsWith("-USD");
      if (!qt.symbol || (!isEquity && !isCryptoUsd)) continue;
      const symbol = toInternalSymbol(qt.symbol);
      // 미지원 해외거래소 제외: 한국(.KS/.KQ→6자리)·미국(접미사 없음)·코인(-USD)만.
      // 내부 심볼에 점(.)이 남으면 .NZ/.NS/.L 등 → 제외(영어 ETF 홍수 차단).
      if (symbol.includes(".")) continue;
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      const item: SymbolSearchResult = {
        symbol,
        name: qt.shortname || qt.longname || qt.symbol,
        exchange: qt.exchDisp || qt.exchange || null,
        assetType: classOf(qt.quoteType, symbol),
      };
      results.push(item);
      if (qt.quoteType === "ETF") {
        if (/^\d{6}$/.test(symbol)) {
          krEtfSymbols.push(symbol);
        } else {
          usEtfSymbols.push(symbol);
        }
      }
    }

    // ETF TER 병렬 조회: 미국=Yahoo quoteSummary(crumb), 한국=KRX (etf_ter_cache에 없는 것만)
    const krEtfSymbolsNotCached = krEtfSymbols.filter((s) => !seenLocal.has(s) && !krxResults.find((r) => r.symbol === s));
    const [usTermap, krTermap] = await Promise.all([
      usEtfSymbols.length > 0 ? fetchEtfTers(usEtfSymbols) : Promise.resolve(new Map<string, number>()),
      krEtfSymbolsNotCached.length > 0
        ? fetchKrxEtfTers(krEtfSymbolsNotCached, supabaseForEtf)
        : Promise.resolve(new Map<string, number>()),
    ]);
    for (const item of results) {
      if (item.ter == null) {
        item.ter = usTermap.get(item.symbol) ?? krTermap.get(item.symbol);
      }
    }

    return Response.json({ results });
  } catch {
    return Response.json({ results: [...local, ...krxResults] });
  }
}
