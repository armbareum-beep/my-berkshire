import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import type { InvestmentEvent } from "./finance/valuation";
import { getDailyKrwCloses, type DailyBar } from "./finance/prices";
import { buildValueSeries, type ValuePoint } from "./finance/valueSeries";
import { getOrComputeSnapshot, type SnapshotResult } from "./calculationSnapshots";

export interface PortfolioValueSeriesSnapshot {
  closes: Record<string, DailyBar[]>;
  available: boolean;
  points: ValuePoint[];
}

export function loadPortfolioValueSeries({
  supabase,
  holdingId,
  portfolioRevision,
  foundedAt,
  initialValuation,
  events,
  today,
}: {
  supabase: SupabaseClient<Database>;
  holdingId: string;
  portfolioRevision: number;
  foundedAt: string;
  initialValuation: number;
  events: InvestmentEvent[];
  today: string;
}): Promise<SnapshotResult<PortfolioValueSeriesSnapshot>> {
  const symbols = [
    ...new Set(
      events
        .filter((event) => event.type === "BUY" && event.symbol)
        .map((event) => event.symbol as string),
    ),
  ];

  return getOrComputeSnapshot({
    supabase,
    holdingId,
    kind: "portfolio-value-series",
    portfolioRevision,
    asOfDate: today,
    ttlMs: 60 * 60 * 1000,
    compute: async () => {
      const { series: closes, available } = symbols.length
        ? await getDailyKrwCloses(symbols, foundedAt, today)
        : { series: {}, available: true };
      const points = buildValueSeries(
        { foundedAt, initialValuation },
        events,
        closes,
        today,
      );
      return { closes, available, points };
    },
  });
}
