-- ENUF — 수기 할인율(요구수익률) 추가
-- 내재가치 = 오너이익 / 할인율. 기본 할인율 = max(미국채10년물×2, 8%)이지만,
-- 할인율(요구수익률)은 가장 주관적인 가정 → 종목별로 직접 덮어쓸 수 있게.
-- null = 기본 규칙(10년물×2) 사용. 소수 저장(0.09 = 9%).

alter table manual_fundamentals
  add column discount_rate numeric check (discount_rate > 0 and discount_rate <= 1);
