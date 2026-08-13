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
 ## 판정 규칙
 *
 * ```text
 * 보유 O            → 항상 후보 (status 무시)
 * 보유 X · APPROVED → 후보      (아직 안 샀지만 사고 싶은 기업)
 * 보유 X · 그 외    → 후보 아님
 * ```
 *
 * ⚠️ **보유 종목은 status 로 빼지 않는다.** 한때 "보유 O · WATCH = 명시적 제외"로 뒀는데,
 * `watchlist` 행은 대부분 **관심종목 기능**이 만든 것이지 "배분에서 빼겠다"는 결정이 아니다.
 * 상태 컬럼을 얹으며 기존 행을 전부 `WATCH` 기본값으로 채운 탓에, 관심종목에 담아둔
 * 보유 주식이 자본배분에서 **조용히 사라졌다**(16종목 중 9종목이 빠져 ETF만 남는 사례).
 *
 * 게다가 "배분에서 빼기"는 이제 **목표비중 0** 이 한다 — 부족분이 0 이라 배분되지 않는다.
 * 같은 일을 하는 두 번째 스위치를 둘 이유가 없다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export type UniverseStatus = "APPROVED" | "WATCH";

/** symbol → 명시적으로 저장된 상태. 행이 없는 종목은 맵에 없다. */
export type UniverseStatusMap = Record<string, UniverseStatus>;

export interface UniverseEntry {
  symbol: string;
  /** 배분 후보 판정 결과. 보유 종목은 저장된 status 와 무관하게 늘 APPROVED 다. */
  status: UniverseStatus;
  /** 한 주라도 들고 있는가. */
  held: boolean;
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
    const isHeld = held.has(symbol);
    // 보유하면 무조건 후보. 미보유는 저장된 상태를 따르고, 없으면 후보가 아니다.
    const status: UniverseStatus = isHeld
      ? "APPROVED"
      : statuses[symbol] === "APPROVED"
        ? "APPROVED"
        : "WATCH";
    entries.push({ symbol, status, held: isHeld });
  }

  return entries.sort((a, b) =>
    a.held !== b.held ? (a.held ? -1 : 1) : a.symbol.localeCompare(b.symbol),
  );
}

/** 자본배분 후보 심볼만. */
export function approvedSymbols(entries: UniverseEntry[]): string[] {
  return entries.filter((e) => e.status === "APPROVED").map((e) => e.symbol);
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
