/**
 * 시세 피드 — STEP 6: 무료 소스(야후 파이낸스, 키 불필요)로 실시세 조회.
 * 토스증권 Open API 승인 시 fetchOne 구현만 교체하면 된다(인터페이스 유지).
 *
 * 원칙(PRD 6): 시세를 못 받으면 0/이전값으로 조용히 대체하지 않는다 → available:false 로 알림.
 * 실시간 시세는 DB에 저장하지 않는다.
 */

import type { PriceMap } from "./valuation";
import { getFxToKrw } from "./fx";
import { financeSource } from "./source";
import { kisFetch, type KisQuoteResponse } from "./kis/client";
import { normalizeDomesticPrice, normalizeOverseasPrice } from "./kis/normalize";
import { tossFetch, type TossPricesResponse } from "./toss/client";
import { normalizeTossPrices } from "./toss/normalize";

export interface PriceResult {
  prices: PriceMap;
  /** 전일 종가(일간 등락 계산용). */
  previousCloses: PriceMap;
  /** 종목별 네이티브 거래통화(야후 meta.currency). 예: { AAPL: "USD", "005930": "KRW" }. */
  currencies: Record<string, string>;
  /** 종목별 유형(야후 meta.instrumentType). 예: { AAPL: "EQUITY", "069500": "ETF" }. */
  instrumentTypes: Record<string, string>;
  /** 피드 정상 여부. false면 화면은 "시세 갱신 필요" 분기. */
  available: boolean;
}

/**
 * 내부 종목코드 → 야후 심볼 후보. 6자리 숫자=한국 → KOSPI(.KS)·KOSDAQ(.KQ) 둘 다 시도.
 * 그 외(미국 등)는 그대로. 우리 내부 코드는 거래소 구분 없이 6자리만 저장하므로 둘 다 던져 본다.
 */
function toYahooCandidates(symbol: string): string[] {
  return /^\d{6}$/.test(symbol) ? [`${symbol}.KS`, `${symbol}.KQ`] : [symbol];
}

async function fetchChart(y: string): Promise<{
  price: number;
  prevClose: number | null;
  currency: string;
  instrumentType: string;
} | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?interval=1d&range=1d`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      // 10초 캐시 — 장중 자동갱신(15초)이 새 값을 받도록(매 요청 외부호출은 방지).
      next: { revalidate: 10 },
    },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number") return null;
  const prev = meta?.previousClose ?? meta?.chartPreviousClose;
  const currency = typeof meta?.currency === "string" ? meta.currency : "KRW";
  const instrumentType =
    typeof meta?.instrumentType === "string" ? meta.instrumentType : "EQUITY";
  return {
    price,
    prevClose: typeof prev === "number" ? prev : null,
    currency,
    instrumentType,
  };
}

async function fetchOne(symbol: string): Promise<{
  price: number;
  prevClose: number | null;
  currency: string;
  instrumentType: string;
} | null> {
  // KOSPI(.KS) 먼저, 실패 시 KOSDAQ(.KQ) 폴백. 첫 시도 성공이 대부분이라 추가 비용은 드물다.
  for (const y of toYahooCandidates(symbol)) {
    try {
      const hit = await fetchChart(y);
      if (hit) return hit;
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

/** KIS 시세 대상 심볼인가 — 국내 6자리 또는 미국 보통주/ETF 티커(지수·환율·코인 제외). */
function isKisEligible(symbol: string): boolean {
  if (/^\d{6}$/.test(symbol)) return true;
  return /^[A-Za-z]{1,5}$/.test(symbol);
}

const KIS_US_EXCHANGES = ["NAS", "NYS", "AMS"];

/** KIS 현재가 1종목. 국내=inquire-price, 미국=price(EXCD 후보 순회). 실패 시 null. */
async function fetchOneKis(symbol: string): Promise<{
  price: number;
  prevClose: number | null;
  currency: string;
  instrumentType: string;
} | null> {
  if (/^\d{6}$/.test(symbol)) {
    const res = await kisFetch<KisQuoteResponse>(
      "/uapi/domestic-stock/v1/quotations/inquire-price",
      { trId: "FHKST01010100", params: { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: symbol }, revalidate: 10 },
    );
    return normalizeDomesticPrice(res.output);
  }
  // 미국: 거래소(EXCD)를 모르므로 NAS·NYS·AMS를 동시 조회하고 우선순위 순으로 첫 유효값 채택
  // (티커는 한 거래소에만 존재 — 잘못된 거래소는 last=0 → null). 순차 대비 왕복 1회로 단축.
  const results = await Promise.all(
    KIS_US_EXCHANGES.map(async (excd) => {
      try {
        const res = await kisFetch<KisQuoteResponse>(
          "/uapi/overseas-price/v1/quotations/price",
          { trId: "HHDFS00000300", params: { AUTH: "", EXCD: excd, SYMB: symbol }, revalidate: 10 },
        );
        return normalizeOverseasPrice(res.output);
      } catch {
        return null;
      }
    }),
  );
  for (const hit of results) {
    if (hit) return hit;
  }
  return null;
}

/** 소스·심볼별 현재가 fetcher 선택. KIS 모드라도 시세전용(지수·환율·코인)은 야후. KIS 실패 시 야후 폴백. */
async function fetchOneRouted(symbol: string) {
  if (financeSource() === "kis" && isKisEligible(symbol)) {
    try {
      const hit = await fetchOneKis(symbol);
      if (hit) return hit;
    } catch {
      // KIS 실패 → 야후 폴백
    }
  }
  return fetchOne(symbol);
}

/**
 * 토스 모드 현재가 — `/api/v1/prices` 배치(여러 종목 1콜). 전일종가는 토스 미제공(빈값).
 * 시세전용(지수·환율·코인)·토스 실패분은 야후 per-symbol 폴백.
 */
async function getPricesToss(symbols: string[]): Promise<PriceResult> {
  const eligible = symbols.filter(isKisEligible);
  const rest = symbols.filter((s) => !isKisEligible(s));
  const prices: PriceMap = {};
  const previousCloses: PriceMap = {};
  const currencies: Record<string, string> = {};
  const instrumentTypes: Record<string, string> = {};
  let anyOk = false;

  if (eligible.length > 0) {
    try {
      const res = await tossFetch<TossPricesResponse>("/api/v1/prices", {
        params: { symbols: eligible.join(",") },
        revalidate: 0,
      });
      for (const [sym, q] of Object.entries(normalizeTossPrices(res))) {
        prices[sym] = q.price;
        currencies[sym] = q.currency;
        instrumentTypes[sym] = "EQUITY";
        anyOk = true;
      }
    } catch {
      rest.push(...eligible); // 토스 실패 → 야후 폴백
    }
  }

  if (rest.length > 0) {
    const results = await Promise.allSettled(rest.map(fetchOne));
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value != null) {
        prices[rest[i]] = r.value.price;
        if (r.value.prevClose != null) previousCloses[rest[i]] = r.value.prevClose;
        currencies[rest[i]] = r.value.currency;
        instrumentTypes[rest[i]] = r.value.instrumentType;
        anyOk = true;
      }
    });
  }

  return { prices, previousCloses, currencies, instrumentTypes, available: anyOk };
}

/**
 * 종목코드 배열의 현재가·전일종가 조회. 일부만 실패하면 그 종목만 빠지고 available:true.
 * 전부 실패(피드 장애/네트워크)면 available:false.
 */
export async function getPrices(symbols: string[]): Promise<PriceResult> {
  if (symbols.length === 0)
    return {
      prices: {},
      previousCloses: {},
      currencies: {},
      instrumentTypes: {},
      available: true,
    };

  if (financeSource() === "toss") return getPricesToss(symbols);

  const results = await Promise.allSettled(symbols.map(fetchOneRouted));
  const prices: PriceMap = {};
  const previousCloses: PriceMap = {};
  const currencies: Record<string, string> = {};
  const instrumentTypes: Record<string, string> = {};
  let anyOk = false;
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value != null) {
      prices[symbols[i]] = r.value.price;
      if (r.value.prevClose != null) previousCloses[symbols[i]] = r.value.prevClose;
      currencies[symbols[i]] = r.value.currency;
      instrumentTypes[symbols[i]] = r.value.instrumentType;
      anyOk = true;
    }
  });

  if (!anyOk)
    return {
      prices: {},
      previousCloses: {},
      currencies: {},
      instrumentTypes: {},
      available: false,
    };
  return { prices, previousCloses, currencies, instrumentTypes, available: true };
}

export interface KrwPriceResult {
  /** 현재가 — 모두 ₩ 환산. */
  prices: PriceMap;
  previousCloses: PriceMap;
  /** 종목별 네이티브 통화. */
  currencies: Record<string, string>;
  /** USD→KRW 환율(표시 $ 모드용). */
  usdKrw: number | null;
  available: boolean;
}

/**
 * 현재가를 모두 원화(KRW)로 환산해 반환 — 앱 기능통화가 KRW이므로 시세는 항상 ₩로 다룬다.
 * 외국 종목은 현재 환율 적용. 환율 못 받은 통화의 종목은 결과에서 빠진다(잘못된 ₩ 표기 방지).
 */
export async function getKrwPrices(symbols: string[]): Promise<KrwPriceResult> {
  const {
    prices: native,
    previousCloses: prev,
    currencies,
    available,
  } = await getPrices(symbols);

  // 표시 통화 토글($)을 위해 USD 환율은 보유 종목과 무관하게 항상 받는다(한국주식만 보유해도 $ 모드 가능).
  const fx = await getFxToKrw([...Object.values(currencies), "USD"]);
  const prices: PriceMap = {};
  const previousCloses: PriceMap = {};
  for (const [sym, px] of Object.entries(native)) {
    const ccy = currencies[sym] ?? "KRW";
    const rate = ccy === "KRW" ? 1 : fx[ccy];
    if (!rate) continue;
    prices[sym] = px * rate;
    if (prev[sym] != null) previousCloses[sym] = prev[sym] * rate;
  }
  return { prices, previousCloses, currencies, usdKrw: fx.USD ?? null, available };
}

/** 일별 종가 한 점(₩ 환산). 시·고·저·거래량은 선택(시세차트 OHLCV 표시용). */
export interface DailyBar {
  date: string; // YYYY-MM-DD
  close: number; // ₩
  open?: number; // ₩
  high?: number; // ₩
  low?: number; // ₩
  volume?: number; // 주/계약 수 — 통화 환산 안 함
}

export interface DailyClosesResult {
  /** 종목코드 → 오름차순 일별 ₩ 종가. 실패 종목은 빠짐. */
  series: Record<string, DailyBar[]>;
  /** 전부 실패면 false. */
  available: boolean;
}

function toYMD(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/** 봉 간격 — 일/주/월. 긴 구간(5년·최대)은 월봉으로 받아 가볍게. */
export type BarInterval = "1d" | "1wk" | "1mo";

/** 한 심볼의 종가 시계열(네이티브) + 통화. benchmark.ts 의 지수 기법을 종목에 적용. */
async function fetchCloseSeries(
  y: string,
  p1: number,
  p2: number,
  interval: BarInterval,
): Promise<{ bars: DailyBar[]; currency: string } | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?period1=${p1}&period2=${p2}&interval=${interval}`,
    { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 3600 } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const ts: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  const closes: (number | null)[] = q.close ?? [];
  const opens: (number | null)[] = q.open ?? [];
  const highs: (number | null)[] = q.high ?? [];
  const lows: (number | null)[] = q.low ?? [];
  const volumes: (number | null)[] = q.volume ?? [];
  const currency =
    typeof result?.meta?.currency === "string" ? result.meta.currency : "KRW";
  const bars: DailyBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c !== "number") continue; // 종가 없는 봉(휴장·결측)은 건너뜀
    const bar: DailyBar = { date: toYMD(ts[i]), close: c };
    if (typeof opens[i] === "number") bar.open = opens[i] as number;
    if (typeof highs[i] === "number") bar.high = highs[i] as number;
    if (typeof lows[i] === "number") bar.low = lows[i] as number;
    if (typeof volumes[i] === "number") bar.volume = volumes[i] as number;
    bars.push(bar);
  }
  return bars.length ? { bars, currency } : null;
}

async function fetchCloseSeriesOne(
  symbol: string,
  p1: number,
  p2: number,
  interval: BarInterval,
): Promise<{ bars: DailyBar[]; currency: string } | null> {
  for (const y of toYahooCandidates(symbol)) {
    try {
      const hit = await fetchCloseSeries(y, p1, p2, interval);
      if (hit) return hit;
    } catch {
      // 다음 후보
    }
  }
  return null;
}

/**
 * 종목들의 일별 종가 시계열을 **₩ 환산**해 반환(자산추이 재구성용).
 * 외화 종목은 **현재 환율**로 환산(과거 환율 시계열은 추후 — 환율반영 벤치마크와 묶음).
 * @param from 시작 YYYY-MM-DD(보통 설립일 14일 전 여유는 호출부에서).
 * @param to   종료 YYYY-MM-DD(오늘).
 * @param interval 봉 간격(기본 일봉). 5년·최대 차트는 "1mo"(월봉)로 가볍게.
 */
export async function getDailyKrwCloses(
  symbols: string[],
  from: string,
  to: string,
  interval: BarInterval = "1d",
): Promise<DailyClosesResult> {
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return { series: {}, available: true };

  // 설립 당일 봉 누락·휴장 대비 14일 여유(benchmark.ts 와 동일).
  const p1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 14 * 86400;
  const p2 = Math.floor(Date.parse(`${to}T23:59:59Z`) / 1000) + 86400;

  const results = await Promise.allSettled(
    uniq.map((s) =>
      fetchCloseSeriesOne(s, p1, p2, interval).then((r) => [s, r] as const),
    ),
  );

  const native: Record<string, { bars: DailyBar[]; currency: string }> = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1]) native[r.value[0]] = r.value[1];
  }
  if (Object.keys(native).length === 0) return { series: {}, available: false };

  // 통화별 현재 환율로 ₩ 환산.
  const currencies = [...new Set(Object.values(native).map((v) => v.currency))];
  const fx = await getFxToKrw(currencies);

  const series: Record<string, DailyBar[]> = {};
  for (const [sym, v] of Object.entries(native)) {
    const rate = v.currency === "KRW" ? 1 : fx[v.currency];
    if (!rate) continue; // 환율 못 받은 통화 제외(잘못된 ₩ 방지)
    // 가격 필드만 ₩ 환산, 거래량(수량)은 그대로.
    series[sym] = v.bars.map((b) => ({
      date: b.date,
      close: b.close * rate,
      ...(b.open != null ? { open: b.open * rate } : {}),
      ...(b.high != null ? { high: b.high * rate } : {}),
      ...(b.low != null ? { low: b.low * rate } : {}),
      ...(b.volume != null ? { volume: b.volume } : {}),
    }));
  }
  return { series, available: true };
}

/**
 * 한 종목의 **연말 종가(₩)** 맵(연도 → 종가) — 과거 PER용("당시 종가").
 * 일별 종가에서 각 연도 마지막 거래일 종가를 취함(오름차순이라 같은 해 마지막이 연말).
 * 시세 소스는 동일(야후, 토스 교체 시 함께 교체). 실패 시 빈 맵.
 */
export async function getYearEndCloses(
  symbol: string,
  fromYear: number,
  toYear: number,
): Promise<Map<number, number>> {
  const { series } = await getDailyKrwCloses(
    [symbol],
    `${fromYear}-01-01`,
    `${toYear}-12-31`,
  );
  const bars = series[symbol] ?? [];
  const map = new Map<number, number>();
  for (const b of bars) map.set(Number(b.date.slice(0, 4)), b.close); // 오름차순 → 해당 연도 마지막 종가
  return map;
}
