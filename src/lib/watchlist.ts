import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/** 관심종목 심볼 목록(최근 추가순). */
export async function loadWatchlist(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("watchlist")
    .select("symbol")
    .eq("holding_id", holdingId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => r.symbol);
}
