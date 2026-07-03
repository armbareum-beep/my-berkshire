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
  /** 규율 점수(0~100). VERSION "v1" 유지를 위해 옵셔널 — 구 스냅샷엔 없음(콜드스타트). */
  score?: number;
  /** 등급 라벨(style.ts gradeOf 결과). 옵셔널 — 없으면 등급업 비교 대상에서 제외. */
  gradeLabel?: string;
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
    score: style.score ?? undefined,
    gradeLabel: style.grade?.label,
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

/**
 * 임의 커트라인 기준 최신 스냅샷 1건 — `loadPreviousStyleSnapshot`(분기 시작 고정)과 달리
 * `before`를 자유롭게 받는다. 미지정이면 전체 최신 1건, 지정하면 그 이전 최신 1건(등급업 비교의 "직전" 조회용).
 */
export async function loadLatestStyleSnapshot(
  supabase: SupabaseClient<Database>,
  holdingId: string,
  before?: string,
): Promise<StyleHistorySnapshot | null> {
  let query = supabase
    .from("calculation_snapshots")
    .select("data, as_of_date")
    .eq("holding_id", holdingId)
    .eq("kind", KIND)
    .eq("parameters_hash", VERSION);
  if (before !== undefined) {
    query = query.lt("as_of_date", before);
  }
  const { data } = await query
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
