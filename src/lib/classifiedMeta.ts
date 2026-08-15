/**
 * **분류가 적용된** 종목 메타 — 배분·구성 화면은 `loadSecurityMeta` 대신 전부 이걸 쓴다.
 *
 * `securities.asset_type` 은 야후 instrumentType 이라 ETF 면 전부 `ETF` 다. 그런데 사람이
 * 배분하는 단위는 상품이 아니라 **역할**이다 — `KODEX미국30년국채액티브` 는 상품은 ETF,
 * 역할은 채권. 그 차이를 홀딩별로 덮어쓴 게 `holdings.asset_type_overrides` 이고
 * (전역 카탈로그 `securities` 를 고치면 남의 분류까지 바뀐다), 이 모듈이 그걸 씌운다.
 *
 * ## 왜 `securities.ts` 안이 아닌가
 *
 * 활성 회사를 알아야 하고, 그건 쿠키를 읽는다(`getActiveHolding` → `next/headers`).
 * `securities.ts` 는 클라이언트 컴포넌트도 가져다 쓰는 파일이라, 거기에 이 함수를 두면
 * `next/headers` 가 브라우저 번들로 딸려 들어가 빌드가 깨진다. 그래서 **서버 전용 모듈로
 * 분리**한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { getActiveHolding } from "./holdings";
import { loadSecurityMeta, type SecurityRecord } from "./securities";
import { applyAssetClassOverrides, readAssetClassOverrides } from "./assetClass";

/**
 * ⚠️ 유형을 읽는 화면이 하나라도 `loadSecurityMeta` 를 그냥 쓰면 **같은 종목이 화면마다
 *    다른 유형으로 보인다** — 이 앱에서 가장 위험한 버그다(`lib/allocateData.ts` 머리말).
 *
 * 비용은 사실상 0 이다. 두 조회 모두 요청 단위로 메모이즈돼 있다(`React.cache`).
 */
export async function loadClassifiedMeta(
  supabase: SupabaseClient<Database>,
  symbols: string[],
): Promise<Record<string, SecurityRecord>> {
  const [meta, holding] = await Promise.all([
    loadSecurityMeta(supabase, symbols),
    getActiveHolding(supabase),
  ]);
  return applyAssetClassOverrides(
    meta,
    readAssetClassOverrides(holding?.asset_type_overrides),
  );
}
