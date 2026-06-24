-- ENUF — 레버리지 금융비용 보정 체크포인트 (spec 012)
-- 대출 이자는 저장 행 없이 조회 시 파생(잔액×이율×경과개월/12). 이 테이블은
-- 추정 누계를 실제값에 스냅하는 division-level 보정만 저장한다.
--  · kind='interest_actual' : 직전 체크포인트~date 의 확정 이자(비용, 수익 분자 차감). date 가 추정 tail 의 기점을 리셋.
--  · kind='capital'         : 자본 투입(수익률 분모=실질취득가 가산).
--  · events 와 분리 → 주식 XIRR 불변(헌장 V, 이중계상 0).
--  · division 은 v1 'REAL_ESTATE' 만. 마진↔주식(P3)은 비대상.

create table financing_reconciliation (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid not null references holdings (id) on delete cascade,
  division    text not null default 'REAL_ESTATE',
  date        date not null,
  kind        text not null check (kind in ('interest_actual', 'capital')),
  amount      numeric not null check (amount >= 0),   -- ₩
  note        text,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz                              -- 소프트 삭제
);
create index financing_reconciliation_holding_idx
  on financing_reconciliation (holding_id, division, date);

-- RLS — 자기 holding 소속만 (manual_asset_income 정책과 동형)
alter table financing_reconciliation enable row level security;
create policy "financing_reconciliation_select_own" on financing_reconciliation
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "financing_reconciliation_insert_own" on financing_reconciliation
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "financing_reconciliation_update_own" on financing_reconciliation
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "financing_reconciliation_delete_own" on financing_reconciliation
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
