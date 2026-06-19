import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/database.types";
import type { StyleResult } from "./style";

const KIND = "style-history";
const VERSION = "v1";

export interface StyleHistorySnapshot {
  asOfDate: string;
  primaryStyle: {
    key: string;
    label: string;
    score: number;
  } | null;
  dimensions: {
    key: string;
    label: string;
    score: number;
    available: boolean;
  }[];
}

export function toStyleHistorySnapshot(
  style: StyleResult,
  asOfDate: string,
): StyleHistorySnapshot {
  return {
    asOfDate,
    primaryStyle: (style.compositeStyle ?? style.primaryStyle)
      ? {
          key: (style.compositeStyle ?? style.primaryStyle)!.key,
          label: (style.compositeStyle ?? style.primaryStyle)!.label,
          score: (style.compositeStyle ?? style.primaryStyle)!.score,
        }
      : null,
    dimensions: style.dimensions.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      score: dimension.score,
      available: dimension.available !== false,
    })),
  };
}

/** 현재 분기 시작일. 이 날짜보다 앞선 최신 기록을 직전 비교점으로 쓴다. */
function currentQuarterStart(today: string) {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
}

export async function loadPreviousStyleSnapshot(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  today: string,
): Promise<StyleHistorySnapshot | null> {
  const { data } = await supabase
    .from("calculation_snapshots")
    .select("data, as_of_date")
    .eq("holding_id", holdingId)
    .eq("kind", KIND)
    .eq("parameters_hash", VERSION)
    .lt("as_of_date", currentQuarterStart(today))
    .order("as_of_date", { ascending: false })
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const snapshot = data.data as unknown as StyleHistorySnapshot;
  return { ...snapshot, asOfDate: data.as_of_date };
}

export async function saveStyleSnapshot(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  portfolioRevision: number,
  snapshot: StyleHistorySnapshot,
): Promise<void> {
  await supabase.from("calculation_snapshots").upsert(
    {
      holding_id: holdingId,
      kind: KIND,
      portfolio_revision: portfolioRevision,
      as_of_date: snapshot.asOfDate,
      parameters_hash: VERSION,
      data: snapshot as unknown as Json,
      status: "fresh",
      computed_at: new Date().toISOString(),
      expires_at: null,
      error_message: null,
    },
    {
      onConflict:
        "holding_id,kind,portfolio_revision,as_of_date,parameters_hash",
    },
  );
}
