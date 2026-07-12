-- 거래사례비교법(국토부 실거래가) 평가 — 평가방법 확장 + RTMS 매칭키
-- current_value 는 cron(월 1회)/수동 갱신 시 최신 실거래가로 영속 업데이트된다.
-- (direct/transaction_comp 는 영속값, cap_rate 만 읽기 시점 파생 — realAssets.ts 참조)
alter table manual_assets
  drop constraint if exists manual_assets_valuation_method_check;
alter table manual_assets
  add constraint manual_assets_valuation_method_check
    check (valuation_method in ('direct', 'cap_rate', 'transaction_comp'));

alter table manual_assets
  -- 법정동 시군구 코드 앞 5자리(예: 11110 = 서울 종로구)
  add column if not exists rtms_lawd_cd text,
  -- 국토부 실거래가 API 유형: 아파트 | 연립다세대 | 오피스텔 | 분양권
  add column if not exists rtms_property_type text
    check (rtms_property_type in ('APT', 'RH', 'OFFI', 'SILV')),
  -- RTMS 응답의 단지명 원문(aptNm/mhouseNm/offiNm) — 정규화 완전일치 매칭 키
  add column if not exists rtms_complex_name text,
  -- 전용면적(㎡) — ±10% 허용오차로 유사 거래 매칭
  add column if not exists rtms_exclusive_area numeric
    check (rtms_exclusive_area > 0);
