import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/database.types";
import { measureServer } from "./serverTiming";

type SnapshotKind =
  | "lookthrough-current"
  | "lookthrough-series"
  | "lookthrough-flags"
  | "portfolio-value-series";

interface SnapshotOptions<T> {
  supabase: SupabaseClient<Database>;
  holdingId: string;
  kind: SnapshotKind;
  portfolioRevision: number;
  asOfDate: string;
  parametersHash?: string;
  ttlMs: number;
  compute: () => Promise<T>;
}

export interface SnapshotResult<T> {
  data: T;
  /**
   * snapshot = 신선한 메모, stale = 만료됐지만 즉시 반환(뒤에서 갱신 중),
   * computed = 새로 계산, fallback = 계산 실패해 마지막 성공값으로 대체.
   */
  source: "snapshot" | "stale" | "computed" | "fallback";
}

// 같은 키의 계산이 동시에 중복 실행되지 않도록(요청 내·요청 간) 진행 중 Promise 를 공유.
const inflight = new Map<string, Promise<unknown>>();
// 백그라운드 갱신이 이미 예약된 키 — 동시 stale 응답이 중복 예약하지 않도록.
const refreshing = new Set<string>();

function snapshotKey({
  holdingId,
  kind,
  portfolioRevision,
  asOfDate,
  parametersHash = "",
}: Pick<
  SnapshotOptions<unknown>,
  "holdingId" | "kind" | "portfolioRevision" | "asOfDate" | "parametersHash"
>) {
  return [
    holdingId,
    kind,
    portfolioRevision,
    asOfDate,
    parametersHash,
  ].join(":");
}

function isFresh(expiresAt: string | null) {
  return expiresAt === null || Date.parse(expiresAt) > Date.now();
}

/**
 * 계산 + 스냅샷 저장(동일 키 중복 실행 dedupe). 성공 데이터 반환.
 * 전경(첫 계산)과 백그라운드 갱신(stale revalidate)이 공유한다.
 */
function computeAndStore<T>(
  options: SnapshotOptions<T>,
  key: string,
  parametersHash: string,
): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const run = (async () => {
    const data = await measureServer(`${options.kind}:compute`, options.compute);
    const expiresAt = new Date(Date.now() + options.ttlMs).toISOString();
    await measureServer(`${options.kind}:snapshot-write`, async () =>
      options.supabase.from("calculation_snapshots").upsert(
        {
          holding_id: options.holdingId,
          kind: options.kind,
          portfolio_revision: options.portfolioRevision,
          as_of_date: options.asOfDate,
          parameters_hash: parametersHash,
          data: data as unknown as Json,
          status: "fresh",
          computed_at: new Date().toISOString(),
          expires_at: expiresAt,
          error_message: null,
        },
        {
          onConflict:
            "holding_id,kind,portfolio_revision,as_of_date,parameters_hash",
        },
      ),
    );

    // 쌓임 방지 — 새 revision 메모를 성공적으로 쓴 뒤 같은 종류의 옛 revision 메모는 삭제.
    // (데이터가 바뀌어 revision 이 오르면 옛 revision 은 더는 유효하지 않다. 실패-폴백은
    //  '새 계산 실패 시'라 이 시점 이전에만 옛 메모를 참조 — 여기선 이미 새 메모가 존재.)
    if (options.portfolioRevision > 0) {
      await options.supabase
        .from("calculation_snapshots")
        .delete()
        .eq("holding_id", options.holdingId)
        .eq("kind", options.kind)
        .eq("parameters_hash", parametersHash)
        .lt("portfolio_revision", options.portfolioRevision);
    }

    return data;
  })();

  inflight.set(key, run);
  void run.finally(() => inflight.delete(key));
  return run;
}

/**
 * 외부 데이터 장애 등으로 계산이 실패했을 때의 마지막 보루.
 * (holding, kind) 기준 가장 최근 성공 스냅샷을 revision·날짜 무관하게 가져온다.
 * 살짝 오래된 값일 수 있지만 화면이 깨지는 것보단 낫다(완료기준: API 장애에도 사용 가능).
 */
async function readLastGood<T>(
  options: SnapshotOptions<T>,
  parametersHash: string,
): Promise<T | null> {
  const res = await options.supabase
    .from("calculation_snapshots")
    .select("data")
    .eq("holding_id", options.holdingId)
    .eq("kind", options.kind)
    .eq("parameters_hash", parametersHash)
    .eq("status", "fresh")
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return res.data ? (res.data.data as unknown as T) : null;
}

export async function getOrComputeSnapshot<T>(
  options: SnapshotOptions<T>,
): Promise<SnapshotResult<T>> {
  const parametersHash = options.parametersHash ?? "";
  const key = snapshotKey({ ...options, parametersHash });

  const cached = await measureServer(`${options.kind}:snapshot-read`, async () =>
    options.supabase
      .from("calculation_snapshots")
      .select("data, expires_at")
      .eq("holding_id", options.holdingId)
      .eq("kind", options.kind)
      .eq("portfolio_revision", options.portfolioRevision)
      .eq("as_of_date", options.asOfDate)
      .eq("parameters_hash", parametersHash)
      .maybeSingle(),
  );

  if (cached.data) {
    // 신선하면 그대로 반환.
    if (isFresh(cached.data.expires_at)) {
      return { data: cached.data.data as unknown as T, source: "snapshot" };
    }
    // 만료됐지만 같은 키(=같은 포트폴리오 상태)의 메모가 있다 → 즉시 보여주고 뒤에서 갱신.
    // (revision 이 같으므로 데이터 정합성 문제는 없다 — 외부 데이터 신선도만 갱신.)
    if (!refreshing.has(key)) {
      refreshing.add(key);
      try {
        after(() => {
          void computeAndStore(options, key, parametersHash)
            .catch(() => {})
            .finally(() => refreshing.delete(key));
        });
      } catch {
        // 요청 컨텍스트 밖(after 사용 불가) — 백그라운드 갱신은 건너뛰고 stale 그대로 반환.
        refreshing.delete(key);
      }
    }
    return { data: cached.data.data as unknown as T, source: "stale" };
  }

  // 메모가 아예 없다(예: 데이터 변경으로 revision 이 바뀜) → 정확성을 위해 동기 계산.
  try {
    const data = await computeAndStore(options, key, parametersHash);
    return { data, source: "computed" };
  } catch (err) {
    // 계산 실패(외부 API 장애 등) → 마지막 성공 스냅샷으로 폴백, 없으면 에러 전파.
    const fallback = await readLastGood(options, parametersHash);
    if (fallback !== null) return { data: fallback, source: "fallback" };
    throw err;
  }
}
