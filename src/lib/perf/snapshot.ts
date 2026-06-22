import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import type { ReturnResult } from "../finance/returns";

type HoldingMode = Database["public"]["Enums"]["holding_mode"];

export interface HistogramBucket {
  bucket: string;
  lo: number | null;
  hi: number | null;
  cnt: number;
}

export interface PercentileData {
  rank: number;
  total: number;
  topPct: number | null;
  histogram: HistogramBucket[];
}

export async function upsertPerfSnapshot(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  userId: string,
  result: ReturnResult,
  portfolioKrw: number | null,
  mode: HoldingMode = "challenge",
  investmentKrw: number | null = null,
  alpha: number | null = null,
  benchmarkSymbol: string | null = null,
): Promise<void> {
  await supabase.from("user_perf_snapshots").upsert(
    {
      user_id: userId,
      holding_id: holdingId,
      xirr: result.xirr ?? null,
      cumulative_return: result.cumulativeReturn ?? null,
      days: result.days,
      portfolio_krw: portfolioKrw != null ? Math.round(portfolioKrw) : null,
      mode,
      investment_krw: investmentKrw != null ? Math.round(investmentKrw) : null,
      alpha: alpha ?? null,
      benchmark_symbol: benchmarkSymbol,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "holding_id" },
  );
}

export async function fetchAlphaPercentile(
  supabase: SupabaseClient<Database>,
  alpha: number | null,
  mode: HoldingMode = "challenge",
): Promise<PercentileData | null> {
  if (alpha == null || mode === "ledger") return null;

  const [pctRes, histRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("get_alpha_percentile", { p_alpha: alpha, p_mode: mode }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("get_alpha_histogram", { p_mode: mode }),
  ]);

  if (pctRes.error || histRes.error) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = (pctRes.data as any[])?.[0];
  if (!row) return null;

  return {
    rank: Number(row.rank),
    total: Number(row.total),
    topPct: row.top_pct != null ? Number(row.top_pct) : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    histogram: ((histRes.data as any[]) ?? []).map((h) => ({
      bucket: h.bucket as string,
      lo: h.lo != null ? Number(h.lo) : null,
      hi: h.hi != null ? Number(h.hi) : null,
      cnt: Number(h.cnt),
    })),
  };
}
