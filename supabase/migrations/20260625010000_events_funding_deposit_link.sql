-- 007-family-ledger-growth — 매수에 짝지어 생성된 증자(DEPOSIT)를 매수 행에 연결.
-- 배경: "새 돈으로(증자)" 매수는 비용만큼 별도 DEPOSIT 행을 만든다. 그런데 매수를 삭제하면
--       BUY만 지워지고 짝 DEPOSIT은 남아 → 현금(통화 풀)에 유령 잔액이 생긴다.
--       (삭제는 새 돈을 만들면 안 된다 — 새 현금은 오직 매도·배당으로만.)
-- 해결: BUY 가 자신을 자금한 DEPOSIT 의 id 를 들고 있게 해, 삭제 시 짝 증자도 함께 정리.
alter table public.events
  add column if not exists funding_deposit_id uuid references public.events(id) on delete set null;

comment on column public.events.funding_deposit_id is
  '이 BUY 가 "새 돈으로(증자)"로 자금됐을 때 짝지어 만든 DEPOSIT 행의 id. 매수 삭제 시 함께 soft-delete(유령 현금 방지). cash 자금 매수는 null.';
