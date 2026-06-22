import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { SymbolSearchResult } from "./search";

/**
 * KIS 종목마스터(kis_security_master) 한글/영문/코드 검색.
 * 야후가 못 주는 한글검색을 로컬 인덱스로 해결한다. 동기화는 scripts/syncKisMaster.ts.
 */
export async function searchKisMaster(
  query: string,
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<SymbolSearchResult[]> {
  // PostgREST or-필터 구분자(콤마·괄호·별표)는 제거해 질의 깨짐 방지.
  const safe = query.replace(/[,()*]/g, " ").trim();
  if (!safe) return [];
  const like = `%${safe}%`;

  // 넉넉히 받아 관련도 순으로 재정렬(정확>접두>부분, 동률은 짧은 이름 우선) 후 잘라낸다.
  const { data, error } = await supabase
    .from("kis_security_master")
    .select("symbol, name_ko, name_en, exchange, asset_type")
    .or(`name_ko.ilike.${like},name_en.ilike.${like},symbol.ilike.${safe}%`)
    .limit(Math.max(limit * 3, 45));

  if (error || !data) {
    if (error) console.error("KIS master search failed:", error.message);
    return [];
  }

  const ql = safe.toLowerCase();
  const rank = (r: { name_ko: string; name_en: string | null; symbol: string }): number => {
    const nameKo = r.name_ko.toLowerCase();
    const nameEn = (r.name_en ?? "").toLowerCase();
    const sym = r.symbol.toLowerCase();
    if (nameKo === ql || nameEn === ql || sym === ql) return 0; // 정확 일치
    if (nameKo.startsWith(ql) || nameEn.startsWith(ql) || sym.startsWith(ql)) return 1; // 접두
    return 2; // 부분
  };

  return data
    .sort((a, b) => rank(a) - rank(b) || a.name_ko.length - b.name_ko.length)
    .slice(0, limit)
    .map((r) => ({
      symbol: r.symbol,
      name: r.name_ko,
      exchange: r.exchange,
      assetType: r.asset_type ?? undefined,
    }));
}
