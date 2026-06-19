import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { findCatalogItem } from "./finance/catalog";

export interface SecurityMeta {
  symbol: string;
  name: string;
  exchange?: string | null;
  /** 네이티브 거래통화(예: KRW, USD). 기본 KRW. */
  currency?: string | null;
  /** 야후 instrumentType(EQUITY/ETF 등). 자산배분 유형 태그로 변환. */
  instrumentType?: string | null;
}

/** 코인 심볼 판별 — 야후 암호화폐는 `BTC-USD` 형태(USD 페어만 커버). */
export function isCrypto(symbol: string): boolean {
  return /^[A-Z0-9]{2,6}-USD$/.test(symbol);
}

/** 수량 단위 — 코인=개, 그 외(주식·ETF)=주. */
export function qtyUnit(symbol: string): string {
  return isCrypto(symbol) ? "개" : "주";
}

/** 종목코드 → 국가(자산배분 태그). 6자리=한국, 코인=기타, 그 외=미국. */
export function countryOf(symbol: string): string {
  if (isCrypto(symbol)) return "기타";
  return /^\d{6}$/.test(symbol) ? "한국" : "미국";
}

/** 유형 라벨 — 카탈로그 명시 유형(원자재·코인·ETF) 우선 → 코인 → ETF → 주식. */
export function assetTypeOf(
  instrumentType?: string | null,
  symbol?: string | null,
): string {
  if (symbol) {
    const cat = findCatalogItem(symbol)?.assetType;
    if (cat) return cat; // 원자재 ETF 등 — 야후 instrumentType(ETF)보다 카탈로그 분류 우선
  }
  if (instrumentType === "CRYPTOCURRENCY" || (symbol && isCrypto(symbol)))
    return "코인";
  return instrumentType === "ETF" ? "ETF" : "주식";
}

export interface SecurityRecord {
  name: string;
  country: string;
  assetType: string;
  currency: string;
  /** 산업 섹터(한국어 라벨). 미조회·미분류면 null. 자산배분·리밸런싱 산업 차원. */
  sector: string | null;
}

/**
 * 종목 메타 보관 — 매수·설립 시 종목명을 securities 에 적재(없을 때만).
 * 한 번 적재되면 이후 대시보드·기록 화면이 코드 대신 이름을 보여줄 수 있다.
 * ignoreDuplicates: 기존 행은 건드리지 않음(처음 알게 된 이름 유지).
 */
export async function upsertSecurities(
  supabase: SupabaseClient<Database>,
  items: SecurityMeta[],
): Promise<void> {
  const seen = new Map<string, SecurityMeta>();
  for (const it of items) {
    if (!it.symbol || !it.name) continue;
    if (!seen.has(it.symbol))
      seen.set(it.symbol, {
        symbol: it.symbol,
        name: it.name,
        exchange: it.exchange ?? null,
        currency: it.currency ?? "KRW",
      });
  }
  if (seen.size === 0) return;
  const rows = [...seen.values()].map((s) => ({
    symbol: s.symbol,
    name: s.name,
    exchange: s.exchange ?? null,
    currency: s.currency ?? "KRW",
    country: countryOf(s.symbol), // 자산배분 국가 태그(코드로 자동 판별)
    asset_type: assetTypeOf(s.instrumentType, s.symbol), // 유형 태그(주식/ETF/코인)
  }));
  await supabase
    .from("securities")
    .upsert(rows, { onConflict: "symbol", ignoreDuplicates: true });
}

/**
 * 종목코드 → 종목명 맵. securities(사용자 적재) 우선, 없으면 정적 카탈로그.
 * 둘 다 없으면 호출부가 코드 자체로 폴백한다.
 */
export async function loadSecurityNames(
  supabase: SupabaseClient<Database>,
  symbols: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return out;

  const { data } = await supabase
    .from("securities")
    .select("symbol, name")
    .in("symbol", uniq);
  for (const row of data ?? []) out[row.symbol] = row.name;

  // securities 에 없는 건 정적 카탈로그로 보완
  for (const s of uniq) {
    if (!out[s]) {
      const c = findCatalogItem(s);
      if (c) out[s] = c.name;
    }
  }
  return out;
}

/**
 * 종목코드 → 메타(이름·국가·유형·통화) 맵. 자산배분 화면용.
 * securities 적재분 우선, 없으면 코드 기반 폴백(국가=코드 판별, 유형=주식, 통화=KRW).
 */
export async function loadSecurityMeta(
  supabase: SupabaseClient<Database>,
  symbols: string[],
): Promise<Record<string, SecurityRecord>> {
  const out: Record<string, SecurityRecord> = {};
  const uniq = [...new Set(symbols.filter(Boolean))];
  if (uniq.length === 0) return out;

  const { data } = await supabase
    .from("securities")
    .select("symbol, name, country, asset_type, currency, sector")
    .in("symbol", uniq);
  const rows = new Map((data ?? []).map((r) => [r.symbol, r]));

  for (const s of uniq) {
    const r = rows.get(s);
    out[s] = {
      name: r?.name ?? findCatalogItem(s)?.name ?? s,
      country: r?.country ?? countryOf(s),
      assetType: r?.asset_type ?? assetTypeOf(null, s),
      currency: r?.currency ?? "KRW",
      sector: r?.sector ?? null,
    };
  }
  return out;
}

/**
 * 섹터 미적재 종목의 산업 태그를 공시 API(DART/EDGAR)로 조회해 securities.sector 에 저장.
 * 멱등 — 이미 sector 가 있는 행은 건너뜀. 실패한 종목은 다음 호출에서 재시도(저장 안 함).
 * 자산유형이 코인·원자재면 섹터 개념이 없어 조회 생략. 반환 = 이번에 채운 symbol→sector.
 * (자산배분·리밸런싱 산업 차원 진입 시 호출. 한 번 채우면 이후 즉시 읽힘.)
 */
export async function backfillSectors(
  supabase: SupabaseClient<Database>,
  meta: Record<string, SecurityRecord>,
): Promise<Record<string, string>> {
  const filled: Record<string, string> = {};
  const targets = Object.entries(meta).filter(
    ([, m]) =>
      m.sector == null && m.assetType !== "코인" && m.assetType !== "원자재",
  );
  if (targets.length === 0) return filled;

  const { fetchSector } = await import("./finance/sector");
  const found = await Promise.all(
    targets.map(async ([symbol, m]) => {
      const sector = await fetchSector(symbol).catch(() => null);
      return { symbol, name: m.name, sector };
    }),
  );
  const rows = found.filter((f) => f.sector);
  if (rows.length) {
    // securities 에 행이 없을 수도 있어 name 동반 upsert(sector 만 갱신).
    await supabase.from("securities").upsert(
      rows.map((r) => ({ symbol: r.symbol, name: r.name, sector: r.sector })),
      { onConflict: "symbol" },
    );
    for (const r of rows) filled[r.symbol] = r.sector as string;
  }
  return filled;
}
