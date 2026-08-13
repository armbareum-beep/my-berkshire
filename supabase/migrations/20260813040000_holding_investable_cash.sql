-- 투자 가능 현금 — 스펙 v1.1 §16.4
--
--   전체 현금:      200,000,000원   ← My Berkshire 순자산이 보는 금액
--   투자 가능 현금:  50,000,000원   ← Allocate 가 쓰는 금액
--
-- 둘을 나누는 이유는 "생활비와 비상금까지 배분 대상으로 삼지는 않는다"이다. 지금까지는
-- 이 개념이 없어서 사용자가 배분할 때마다 금액을 직접 타이핑해야 했다.
--
-- ⚠️ 통화: **₩ 로 저장한다.** 표시통화(USD/KRW)는 화면 설정이라 저장값에 섞으면
--    USD 로 보다가 넣은 값이 ₩ 화면에서 1/1400 로 보인다. 읽을 때 환산한다(§16.3).
--
-- null = "안 정함" → 코드가 보유 현금 전액으로 폴백한다. 값을 미리 채우지 않는다.

alter table holdings
  add column if not exists investable_cash numeric
    check (investable_cash >= 0);

comment on column holdings.investable_cash is
  '투자 가능 현금(₩ 기준). Allocate 배분에만 쓴다. null = 안 정함(보유 현금 전액으로 폴백).';
