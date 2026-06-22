import type { SupabaseClient } from "@supabase/supabase-js";
import type { EtfHolding } from "./etfStats";

export interface KrxEtfHoldingsSnapshot {
  holdings: EtfHolding[];
  sourceDate: string;
}

/** KRX ETF 구성종목과 해당 구성의 기준일을 함께 반환한다. */
export async function getKrxEtfHoldingsSnapshot(
  symbol: string,
  supabase: SupabaseClient,
): Promise<KrxEtfHoldingsSnapshot | null> {
  if (!/^\d{6}$/.test(symbol)) return null;

  const { data, error } = await supabase
    .from("etf_holdings_cache")
    .select("holdings, source_date")
    .eq("symbol", symbol)
    .maybeSingle();

  if (error) {
    console.error("ETF holdings cache read error:", error.message);
    return null;
  }
  if (!data || !Array.isArray(data.holdings) || data.holdings.length === 0) return null;

  return {
    holdings: data.holdings as EtfHolding[],
    sourceDate: String(data.source_date),
  };
}

/** KRX 싱크로 저장된 ETF 구성종목 반환. 없으면 null (Yahoo 프록시 폴백). */
export async function getKrxEtfHoldings(
  symbol: string,
  supabase: SupabaseClient,
): Promise<EtfHolding[] | null> {
  return (await getKrxEtfHoldingsSnapshot(symbol, supabase))?.holdings ?? null;
}
