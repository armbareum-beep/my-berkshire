/**
 * 자산군 — **상품유형이 아니라 역할**로 나눈다.
 *
 * ## 왜 필요한가
 *
 * `securities.asset_type` 은 야후 instrumentType 에서 온다 — ETF 면 전부 `ETF` 다
 * (`securities.ts:assetTypeOf`). 그런데 사람이 배분할 때 쓰는 단위는 상품이 아니라 **역할**이다.
 *
 * ```text
 *   KODEX미국30년국채액티브  상품은 ETF   ·  역할은 채권
 *   ACE KRX금현물            상품은 ETF   ·  역할은 원자재
 *   KODEX코리아밸류업        상품도 ETF   ·  역할도 ETF(주식형)
 * ```
 *
 * 사용자 엑셀의 최상위가 정확히 이 축이었다 — **ETF 20% / 주식 75% / 채권 5%**. 지금 앱은
 * 채권을 ETF 에 섞어 놓아 그 정책을 **표현할 수조차 없다**("ETF 20%" 를 정하면 채권까지 깎인다).
 *
 * ## 왜 사용자별로 저장하나
 *
 * `securities` 는 심볼 하나당 한 행인 **전역 카탈로그**다(`holding_id` 가 없다). 거기서
 * `asset_type` 을 고치면 **모든 사용자의 분류가 바뀐다.** 그래서 덮어쓰기는 홀딩별로
 * 따로 저장한다(`holdings.asset_type_overrides`).
 *
 * ## 자동 분류는 **제안까지만**
 *
 * 이름 규칙은 잘 맞지만 완벽할 수 없다. 예를 들어 `KODEX 200미국채혼합` 은 이름에 "미국채"가
 * 있지만 주식+채권 혼합이라 사용자는 ETF 로 둔다. 그래서 규칙은 **제안**만 하고 적용은
 * 사용자가 한 번 훑어보고 누른다 — 조용히 바꾸면 안 채운 값이 생기는 것과 같은 문제다.
 */

/** 배분에서 쓰는 자산군. 표시 순서이기도 하다. */
export const ASSET_CLASSES = ["주식", "ETF", "채권", "원자재", "코인"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export function isAssetClass(v: string): v is AssetClass {
  return (ASSET_CLASSES as readonly string[]).includes(v);
}

/**
 * 채권 — 국채·회사채·단기채 등. 영문 티커만 있는 종목(예: `BIL`)은 이름이 짧아 못 잡는다.
 * 그건 화면에서 한 번 눌러 고치면 된다(제안이 전부를 맞힐 필요는 없다).
 */
const BOND =
  /채권|국고채|국채|회사채|단기채|장기채|물가채|크레딧|treasury|t-?bill|bond|aggregate/i;

/**
 * 원자재 — 금·은·원유 등 실물.
 *
 * 낱글자 `금`·`은` 은 절대 안 쓴다 — "삼성금융지주"나 조사 `은` 이 걸린다. 대신 실제 ETF
 * 이름이 쓰는 형태(`금현물`·`은선물`)를 통째로 본다.
 */
const COMMODITY =
  /[금은](현물|선물)|골드|실버|원유|천연가스|구리|팔라듐|플래티넘|백금|gold|silver|crude|copper|commodit/i;

/**
 * 혼합형은 **어느 한쪽으로 몰지 않는다.**
 *
 * `KODEX 200미국채혼합` 은 이름에 "미국채"가 있지만 주식+채권이라, 채권으로 옮기면 주식
 * 익스포저가 통째로 사라진다. 사용자 엑셀도 이걸 ETF 밑 "혼합"으로 따로 뒀다.
 */
const MIXED = /혼합|밸런스|balanced|multi[-\s]?asset|tdf|타겟데이트/i;

/**
 * 이 종목의 자산군을 바꿔 제안할까. 바꿀 게 없으면 null.
 *
 * 이미 구체적인 분류(채권·원자재·코인)가 붙어 있으면 건드리지 않는다 — 카탈로그가 이미
 * 맞게 넣었거나 사용자가 정한 값이다. 뭉뚱그려진 `ETF`·`주식`만 다시 본다.
 */
export function suggestAssetClass(
  name: string,
  current: string,
): AssetClass | null {
  if (current !== "ETF" && current !== "주식") return null;
  if (MIXED.test(name)) return null;
  // 제안하는 값은 언제나 채권·원자재라 `current` 와 같아질 수 없다 — 위에서 이미 걸렀다.
  if (BOND.test(name)) return "채권";
  if (COMMODITY.test(name)) return "원자재";
  return null;
}

/** 홀딩별 덮어쓰기 — `{ "BIL": "채권" }`. 잘못된 값은 버린다(임의 JSON 방어). */
export type AssetClassOverrides = Record<string, AssetClass>;

export function readAssetClassOverrides(raw: unknown): AssetClassOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: AssetClassOverrides = {};
  for (const [symbol, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && isAssetClass(v)) out[symbol] = v;
  }
  return out;
}

/**
 * 전역 카탈로그 위에 홀딩별 분류를 덮어쓴다.
 *
 * **모든 화면이 이 함수를 지나야 한다.** 한 곳이라도 빼먹으면 같은 종목이 화면마다 다른
 * 유형으로 보이고, 그건 이 앱에서 가장 위험한 버그다(`lib/allocateData.ts` 머리말).
 */
export function applyAssetClassOverrides<
  M extends Record<string, { assetType: string } | undefined>,
>(meta: M, overrides: AssetClassOverrides): M {
  if (Object.keys(overrides).length === 0) return meta;
  const out = { ...meta };
  for (const [symbol, assetType] of Object.entries(overrides)) {
    const row = out[symbol];
    // 안 들고 있는 심볼의 덮어쓰기는 그냥 흘린다 — 팔고 난 뒤에도 값이 남기 때문이다.
    if (row) out[symbol as keyof M] = { ...row, assetType } as M[keyof M];
  }
  return out;
}
