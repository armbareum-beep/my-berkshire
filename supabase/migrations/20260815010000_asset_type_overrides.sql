-- 자산유형 덮어쓰기 — 상품이 아니라 **역할**로 배분하기 위해
--
--   KODEX미국30년국채액티브(H)   securities.asset_type = 'ETF'   ·  역할은 채권
--   ACE KRX금현물                securities.asset_type = 'ETF'   ·  역할은 원자재
--
-- 사용자 엑셀의 최상위 축이 정확히 이거였다 — **ETF 20% / 주식 75% / 채권 5%**. 지금 앱은
-- 채권을 ETF 에 섞어 놓아 그 정책을 표현할 수조차 없다("ETF 20%"를 정하면 채권까지 깎인다).
--
-- ⚠️ 왜 `securities.asset_type` 을 고치지 않나: `securities` 는 심볼당 한 행인 **전역
--    카탈로그**다(`holding_id` 가 없다). 거기서 고치면 모든 사용자의 분류가 함께 바뀐다.
--    그래서 덮어쓰기는 홀딩별로 따로 든다.
--
-- 모양: { "<symbol>": "<자산군>" } — 예) { "BIL": "채권", "411060": "원자재" }
-- 없는 심볼 키는 무시된다(읽는 쪽 `applyAssetClassOverrides`). 기본값은 빈 객체라
-- 마이그레이션만으로는 아무 분류도 바뀌지 않는다 — 적용은 사용자가 화면에서 누른다.

alter table holdings
  add column if not exists asset_type_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(asset_type_overrides) = 'object');

comment on column holdings.asset_type_overrides is
  '심볼별 자산유형 덮어쓰기 { symbol: "주식|ETF|채권|원자재|코인" }. 전역 securities.asset_type 위에 이 홀딩에서만 적용된다.';
