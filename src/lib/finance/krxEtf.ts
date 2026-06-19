import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

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
