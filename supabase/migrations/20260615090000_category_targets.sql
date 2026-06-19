-- 다단계 리밸런싱 — 카테고리(국가/유형) 단위 목표비중.
-- 키는 차원 네임스페이스로 구분: "country:미국", "country:한국", "assetType:ETF" ...
-- 값은 0~1(차원별 합이 1에 가깝도록 권장, 강제 X). 종목별 target_weights 와 별개.
alter table holdings
  add column category_targets jsonb not null default '{}'::jsonb;
