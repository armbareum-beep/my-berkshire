/**
 * Approved Universe — Capital Allocator PRD v0.3 §3.1.
 *
 * > 사용자가 직접 "좋은 기업"이라고 판단한 기업만 등록한다.
 * > 앱은 "좋은 기업인지"를 평가하지 않는다.
 *
 * 그동안 자본배분 후보는 **이미 보유한 종목**으로 고정이었다. 그래서
 *   · 아직 한 주도 없는 기업은 후보에 넣을 수 없고(= 첫 매수를 계획할 수 없고)
 *   · 정리하기로 한 보유 종목을 후보에서 뺄 수 없었다.
 * 둘 다 "기업 선택은 인간의 영역"이라는 PRD 전제와 어긋난다.
 *
 * 저장은 기존 `watchlist` 테이블에 상태 컬럼 하나로 한다(스펙 v1.1 §13.2 신규 테이블 없음).
 *
 * ## 행이 없을 때의 규칙
 *
 * ```text
 * 보유 O · 행 없음   → APPROVED   (지금까지의 동작 보존)
 * 보유 O · WATCH     → 후보 제외   (명시적으로 뺀 것)
 * 보유 X · APPROVED  → 후보 포함   (아직 안 샀지만 사고 싶은 기업)
 * 보유 X · 행 없음   → 후보 아님
 * ```
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export type UniverseStatus = "APPROVED" | "WATCH";

/** symbol → 명시적으로 저장된 상태. 행이 없는 종목은 맵에 없다. */
export type UniverseStatusMap = Record<string, UniverseStatus>;

export interface UniverseEntry {
  symbol: string;
  status: UniverseStatus;
  /** 한 주라도 들고 있는가. */
  held: boolean;
  /** 상태가 저장되지 않아 보유 여부로 판정된 종목인가(= 아직 사용자가 고른 적 없음). */
  implicit: boolean;
}

/**
 * 보유 종목과 저장된 상태를 합쳐 후보 목록을 만든다.
 * 반환 순서는 보유 우선 → 심볼순으로 안정적이다(화면이 매번 뒤집히지 않게).
 */
export function resolveUniverse(
  heldSymbols: string[],
  statuses: UniverseStatusMap,
): UniverseEntry[] {
  const held = new Set(heldSymbols);
  const symbols = new Set([...heldSymbols, ...Object.keys(statuses)]);

  const entries: UniverseEntry[] = [];
  for (const symbol of symbols) {
    const saved = statuses[symbol];
    const isHeld = held.has(symbol);
    // 저장된 상태가 없으면 보유 여부가 곧 판정이다.
    const status: UniverseStatus = saved ?? (isHeld ? "APPROVED" : "WATCH");
    entries.push({ symbol, status, held: isHeld, implicit: saved == null });
  }

  return entries.sort((a, b) =>
    a.held !== b.held ? (a.held ? -1 : 1) : a.symbol.localeCompare(b.symbol),
  );
}

/** 자본배분 후보 심볼만. */
export function approvedSymbols(entries: UniverseEntry[]): string[] {
  return entries.filter((e) => e.status === "APPROVED").map((e) => e.symbol);
}

/**
 * 산업(섹터)별 묶음 — 화면에서 "무엇을 고를지"를 산업 단위로 보게 한다.
 * 섹터를 모르는 종목은 `unknownLabel` 그룹으로 모아 맨 뒤에 둔다(추측하지 않는다).
 */
export function groupBySector<T extends { symbol: string }>(
  items: T[],
  sectorOf: (symbol: string) => string | null | undefined,
  unknownLabel = "미분류",
): { sector: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = sectorOf(item.symbol) || unknownLabel;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()]
    .map(([sector, list]) => ({ sector, items: list }))
    .sort((a, b) => {
      // 미분류는 항상 맨 뒤. 나머지는 종목 많은 순 → 이름순.
      if (a.sector === unknownLabel) return 1;
      if (b.sector === unknownLabel) return -1;
      return b.items.length - a.items.length || a.sector.localeCompare(b.sector);
    });
}

/** 저장된 후보 상태(symbol → status). 컬럼이 아직 없으면 빈 맵. */
export async function loadUniverseStatuses(
  supabase: SupabaseClient<Database>,
  holdingId: string,
): Promise<UniverseStatusMap> {
  const { data } = await supabase
    .from("watchlist")
    .select("symbol, status")
    .eq("holding_id", holdingId);

  const out: UniverseStatusMap = {};
  for (const row of data ?? []) {
    out[row.symbol] = row.status === "APPROVED" ? "APPROVED" : "WATCH";
  }
  return out;
}
