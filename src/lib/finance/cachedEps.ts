/**
 * 공시 EPS 벌크 조회 — `/allocate` 처럼 **여러 종목을 한 번에** 계산하는 화면용.
 *
 * 핵심 제약: 여기서는 **캐시만 읽고 공시 API 를 부르지 않는다.**
 * `getFundamentals()` 는 캐시 미스 시 DART/EDGAR 를 호출하는데, 보유 종목 수만큼
 * 부르면 N+1 이 되어 배분 화면이 느려진다. 캐시에 없는 종목은 그냥 빠지고(자동 EPS 없음),
 * 사용자가 그 종목 상세를 한 번 열면 채워진다.
 *
 * ⚠️ 통화: `fundamentals_cache` 의 값은 **₩ 기준**이다(`edgar.ts` 가 미국 공시를 ₩ 로
 * 환산해 파이프라인을 ₩ 단일로 유지한다). 기대수익률 가정은 종목 통화 기준이라
 * 호출부에서 `toNativeEps()` 로 되돌려야 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

/** ₩ 기준 주당순이익. 캐시에 없거나 산출 불가한 종목은 맵에 없다. */
export type CachedEpsMap = Record<string, number>;

interface CachedShape {
  eps?: number | null;
  netIncome?: number | null;
  shares?: number | null;
}

/**
 * 종목별 최신 연도 EPS(₩). 연결(CFS) 우선, 없으면 별도(OFS).
 * `eps` 가 비어 있으면 netIncome/shares 로 보완한다(옛 캐시 행 대응).
 */
export async function loadCachedEps(
  supabase: SupabaseClient<Database>,
  symbols: string[],
): Promise<CachedEpsMap> {
  const uniq = [...new Set(symbols)].filter(Boolean);
  if (uniq.length === 0) return {};

  const { data } = await supabase
    .from("fundamentals_cache")
    .select("symbol, year, fs_div, data")
    .in("symbol", uniq);
  if (!data || data.length === 0) return {};

  // 연도 내림차순 → 같은 연도면 연결 우선. getFundamentals 의 정렬 규칙과 동일하게 맞춘다.
  const sorted = [...data].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : a.fs_div === "연결" ? -1 : 1,
  );

  const out: CachedEpsMap = {};
  for (const row of sorted) {
    if (out[row.symbol] != null) continue; // 이미 더 최신 행을 잡았다
    const eps = epsOf(row.data as unknown as CachedShape | null);
    // 적자·0 은 기대수익률 모형을 못 쓴다 → 담지 않는다(가짜 정밀 금지).
    if (eps != null && eps > 0) out[row.symbol] = eps;
  }
  return out;
}

/** 캐시 한 행에서 주당순이익을 뽑는다. `eps` 가 비면 netIncome/shares 로 보완(옛 행 대응). */
function epsOf(f: CachedShape | null): number | null {
  if (!f) return null;
  const eps =
    f.eps != null && Number.isFinite(f.eps)
      ? Number(f.eps)
      : f.netIncome != null && f.shares != null && f.shares > 0
        ? Number(f.netIncome) / Number(f.shares)
        : null;
  return eps != null && Number.isFinite(eps) ? eps : null;
}

/** 한 종목의 연도별 이익력(₩). 오래된 해부터. */
export interface EpsPoint {
  year: number;
  eps: number;
}

/**
 * 종목별 **EPS 시계열** — 과거 성장률을 재는 데 쓴다(`lib/defaultAssumptions.ts`).
 *
 * `loadCachedEps` 와 같은 캐시를 보지만 최신 한 해만 접는 대신 **연도별로 편다.**
 * 여기서도 공시 API 는 안 부른다 — 캐시에 있는 해만 쓴다.
 *
 * ⚠️ 적자 연도를 **버리지 않고 그대로 담는다.** 손실은 성장률을 못 재게 만드는 사실
 * 자체이고, 조용히 빼면 사이클 바닥이 지워져 성장률이 부풀려진다(SK하이닉스 2023년
 * −13,242원을 빼면 5년 CAGR 이 +54% 가 된다). 판단은 읽는 쪽이 한다.
 */
export async function loadEpsSeries(
  supabase: SupabaseClient<Database>,
  symbols: string[],
): Promise<Record<string, EpsPoint[]>> {
  const uniq = [...new Set(symbols)].filter(Boolean);
  if (uniq.length === 0) return {};

  const { data } = await supabase
    .from("fundamentals_cache")
    .select("symbol, year, fs_div, data")
    .in("symbol", uniq);
  if (!data || data.length === 0) return {};

  // 같은 해에 연결·개별이 함께 있으면 연결을 쓴다(`loadCachedEps` 와 같은 규칙).
  const best = new Map<string, { fs: string; eps: number }>();
  for (const row of data) {
    const eps = epsOf(row.data as unknown as CachedShape | null);
    if (eps == null) continue;
    const key = `${row.symbol}:${row.year}`;
    const prev = best.get(key);
    if (!prev || (prev.fs !== "연결" && row.fs_div === "연결"))
      best.set(key, { fs: row.fs_div, eps });
  }

  const out: Record<string, EpsPoint[]> = {};
  for (const [key, v] of best) {
    const i = key.lastIndexOf(":");
    const symbol = key.slice(0, i);
    (out[symbol] ??= []).push({ year: Number(key.slice(i + 1)), eps: v.eps });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.year - b.year);
  return out;
}

/** 이 앱의 통화 판정 — 6자리 숫자 코드면 원화, 그 외는 달러. */
export function nativeCurrencyOf(symbol: string): "KRW" | "USD" {
  return /^\d{6}$/.test(symbol) ? "KRW" : "USD";
}

/**
 * ₩ EPS → 종목 통화 EPS. 사용자가 입력하는 가정과 단위를 맞추기 위한 역환산.
 * 환율을 모르면 null — 억지로 숫자를 만들지 않는다.
 *
 * ⚠️ 정확도 한계: 파이프라인이 **적재 시점 환율**로 ₩ 환산했는데 여기서는 **현재 환율**로
 * 되돌리므로, 그 사이 환율이 움직였으면 오차가 남는다. 자동값은 어디까지나 출발점이고
 * 사용자가 수기로 덮어쓸 수 있다(`er_current_metric`).
 */
export function toNativeEps(
  epsKrw: number | null | undefined,
  symbol: string,
  usdKrw: number | null | undefined,
): number | null {
  if (epsKrw == null || !Number.isFinite(epsKrw) || epsKrw <= 0) return null;
  if (nativeCurrencyOf(symbol) === "KRW") return epsKrw;
  return usdKrw && usdKrw > 0 ? epsKrw / usdKrw : null;
}
