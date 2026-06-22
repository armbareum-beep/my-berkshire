import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export interface KrxEtfProduct {
  symbol: string;
  name: string;
  ter: number;
  sourceDate: string;
}

/** KRX 동기화 캐시에 있는 ETF 공식 상품정보. 캐시에 있으면 카탈로그 밖 ETF도 판별 가능하다. */
export async function getKrxEtfProduct(
  symbol: string,
  supabase: SupabaseClient<Database>,
): Promise<KrxEtfProduct | null> {
  if (!/^\d{6}$/.test(symbol)) return null;
  const { data, error } = await supabase
    .from("etf_ter_cache")
    .select("symbol, name, ter, source_date")
    .eq("symbol", symbol)
    .maybeSingle();
  if (error || !data) return null;
  return {
    symbol: data.symbol,
    name: data.name,
    ter: Number(data.ter),
    sourceDate: data.source_date,
  };
}

/** Read cached Korean ETF TER values. KRX access is handled by scripts/syncKrxTer.ts. */
export async function fetchKrxEtfTers(
  symbols: string[],
  supabase: SupabaseClient<Database>,
): Promise<Map<string, number>> {
  const normalized = [...new Set(symbols.filter((symbol) => /^\d{6}$/.test(symbol)))];
  if (normalized.length === 0) return new Map();

  const { data, error } = await supabase
    .from("etf_ter_cache")
    .select("symbol, ter")
    .in("symbol", normalized);

  if (error) {
    console.error("Failed to read KRX ETF TER cache:", error.message);
    return new Map();
  }

  return new Map(data.map((row) => [row.symbol, Number(row.ter)]));
}
