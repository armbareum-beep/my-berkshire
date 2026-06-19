/**
 * 배당 피드 — STEP B: 무료 소스(야후 파이낸스)로 종목별 배당 내역 조회.
 *
 * 배당은 결정적이다: 배당락일(ex-date)·주당배당금(DPS)이 공개값 → 사용자 입력 변수 없음.
 * 따라서 보유수량만 알면 배당 이벤트를 자동 생성할 수 있다(syncDividends).
 *
 * 야후 chart 엔드포인트에 events=div 를 붙이면 기간 내 배당락 타임스탬프→DPS 맵을 준다.
 * DPS 는 종목의 네이티브 통화(meta.currency) 기준. ₩ 환산은 호출부(sync)에서 현재 환율로.
 *
 * 토스 등 다른 소스로 교체 시 fetchDividendsOne 만 바꾸면 된다(인터페이스 유지).
 */

/** 한 건의 배당락. amountNative = 주당배당금(종목 네이티브 통화). */
export interface DividendPayment {
  /** 배당락일 YYYY-MM-DD(UTC 기준 달력일). */
  exDate: string;
  /** 주당 배당금(네이티브 통화). */
  amountNative: number;
}

export interface SymbolDividends {
  /** 종목 네이티브 거래통화(예: USD, KRW). */
  currency: string;
  payments: DividendPayment[];
}

/** 추정 배당(미래) — 확정과 구분되는 "예상" 표시용. amountNative = 주당(네이티브). */
export interface ProjectedPayment extends DividendPayment {
  estimated: true;
}

/** YYYY-MM-DD 에 days 일 더한 날짜(UTC 기준 달력 연산). */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

/** 두 YYYY-MM-DD 사이 일수(b−a). */
function dayGap(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

/**
 * 향후 배당 추정 — **인터페이스 seam**(토스 API 승인 시 실제 예정 배당으로 교체).
 * 야후는 과거 배당만 주므로, 과거 배당락일 **간격 중앙값**으로 다음 배당락일을 투영.
 * 보수적: 주기 추론에 이력 ≥2회 필요, 주당배당금(DPS)은 **직전 값 유지**(성장 가정 안 함).
 *
 * @param payments 과거 배당(오름차순 무관, 내부 정렬). amountNative=주당.
 * @param today    오늘 YYYY-MM-DD.
 * @param horizonDays 예측 지평(기본 365일).
 * @returns 미래 배당락일별 예상 주당배당금(estimated:true). 없으면 [].
 */
export function projectDividends(
  payments: DividendPayment[],
  today: string,
  horizonDays = 365,
): ProjectedPayment[] {
  if (payments.length < 2) return [];
  const sorted = [...payments].sort((a, b) => a.exDate.localeCompare(b.exDate));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++)
    gaps.push(dayGap(sorted[i - 1].exDate, sorted[i].exDate));
  gaps.sort((a, b) => a - b);
  const cadence = gaps[Math.floor(gaps.length / 2)]; // 중앙값
  if (!(cadence > 0)) return [];

  const lastDps = sorted[sorted.length - 1].amountNative;
  const end = addDays(today, horizonDays);
  const out: ProjectedPayment[] = [];
  let next = addDays(sorted[sorted.length - 1].exDate, cadence);
  let guard = 0;
  while (next <= end && guard++ < 24) {
    if (next > today)
      out.push({ exDate: next, amountNative: lastDps, estimated: true });
    next = addDays(next, cadence);
  }
  return out;
}

/**
 * 연 주당배당금(네이티브) — 배당수익률 계산용.
 * 우선 **최근 12개월 실제 배당 합(TTM)**, 이력이 모자라면 과거 주기로 **향후 12개월 추정**.
 * 둘 다 없으면 0.
 * @param payments 과거 배당(amountNative=주당).
 * @param today    오늘 YYYY-MM-DD.
 */
export function annualDpsNative(
  payments: DividendPayment[],
  today: string,
): number {
  if (payments.length === 0) return 0;
  const oneYearAgo = addDays(today, -365);
  const ttm = payments
    .filter((p) => p.exDate > oneYearAgo && p.exDate <= today)
    .reduce((s, p) => s + p.amountNative, 0);
  if (ttm > 0) return ttm;
  // TTM 실적이 없으면(예: 신규 보유·연 1회 배당 직후) 향후 12개월 추정으로 폴백.
  return projectDividends(payments, today, 365).reduce(
    (s, p) => s + p.amountNative,
    0,
  );
}

/** 내부 6자리=한국 → .KS/.KQ 둘 다 시도(prices.ts 와 동일 규칙). */
function toYahooCandidates(symbol: string): string[] {
  return /^\d{6}$/.test(symbol) ? [`${symbol}.KS`, `${symbol}.KQ`] : [symbol];
}

/** unix(초, UTC) → YYYY-MM-DD. 배당락은 달력일이므로 UTC 기준으로 안정화. */
function unixToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

async function fetchDividendsChart(
  y: string,
  period1: number,
  period2: number,
): Promise<SymbolDividends | null> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${y}` +
      `?period1=${period1}&period2=${period2}&interval=1d&events=div`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      // 배당은 자주 바뀌지 않음 → 6시간 캐시(매 방문마다 외부 호출 방지).
      next: { revalidate: 21600 },
    },
  );
  if (!res.ok) return null;
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const currency =
    typeof result.meta?.currency === "string" ? result.meta.currency : "KRW";

  const divs = result.events?.dividends;
  const payments: DividendPayment[] = [];
  if (divs && typeof divs === "object") {
    for (const key of Object.keys(divs)) {
      const d = divs[key];
      const amount = typeof d?.amount === "number" ? d.amount : null;
      const ts = typeof d?.date === "number" ? d.date : Number(key);
      if (amount != null && amount > 0 && Number.isFinite(ts)) {
        payments.push({ exDate: unixToDate(ts), amountNative: amount });
      }
    }
  }
  payments.sort((a, b) => a.exDate.localeCompare(b.exDate));
  return { currency, payments };
}

async function fetchDividendsOne(
  symbol: string,
  period1: number,
  period2: number,
): Promise<SymbolDividends | null> {
  for (const y of toYahooCandidates(symbol)) {
    try {
      const hit = await fetchDividendsChart(y, period1, period2);
      // 후보가 응답했고(배당 0건이어도 유효) → 그대로 채택. 첫 성공이 대부분.
      if (hit) return hit;
    } catch {
      // 다음 후보 시도
    }
  }
  return null;
}

/**
 * 종목코드 배열의 기간 내 배당 내역 조회.
 * @param fromDate 조회 시작 YYYY-MM-DD(보통 가장 이른 보유 이벤트일).
 * @param toDate   조회 종료 YYYY-MM-DD(보통 오늘).
 * 일부 종목 실패는 그 종목만 빠진다(맵에서 누락).
 */
export async function getDividends(
  symbols: string[],
  fromDate: string,
  toDate: string,
): Promise<Record<string, SymbolDividends>> {
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return {};

  // 경계 포함을 위해 앞뒤로 하루 여유. ms → s.
  const period1 = Math.floor(Date.parse(`${fromDate}T00:00:00Z`) / 1000) - 86400;
  const period2 = Math.floor(Date.parse(`${toDate}T00:00:00Z`) / 1000) + 86400;

  const results = await Promise.allSettled(
    uniq.map((s) =>
      fetchDividendsOne(s, period1, period2).then((d) => [s, d] as const),
    ),
  );
  const out: Record<string, SymbolDividends> = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value[1] != null) {
      out[r.value[0]] = r.value[1];
    }
  }
  return out;
}
