-- ENUF — 부채(대출) 레이어
-- 순자산 = 자산 − 부채. 지주회사가 레버리지를 쓰면 리스크가 커진다(버핏式 경계).
--
-- 설계 원칙
--  · 부채는 holdings 에 직접 붙는다(계좌별이 아니라 회사 레벨 재무상태표 항목).
--  · V1은 "현재 잔액(수기)" 모델 — 상환 이벤트 없이 잔액을 직접 수정. (이자/상환 자동화는 추후)
--  · 모든 금액 ₩(기능통화). 이자율은 연이율(소수).
--  · RLS: accounts 와 동일 패턴(자기 holding 소속만).

-- 부채 종류: 신용대출 / 담보대출(주택 등) / 증권 마진 / 기타
create type liability_kind as enum ('CREDIT', 'MORTGAGE', 'MARGIN', 'OTHER');
create table liabilities (
  id            uuid primary key default gen_random_uuid(),
  holding_id    uuid not null references holdings (id) on delete cascade,
  name          text not null,                              -- 표시명(예: "신한 신용대출")
  kind          liability_kind not null default 'CREDIT',
  principal     numeric not null default 0 check (principal >= 0),       -- 현재 잔액(₩)
  interest_rate numeric not null default 0 check (interest_rate >= 0),   -- 연이율(소수, 0.05=5%)
  started_at    date,                                       -- 차입일(선택)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz                                 -- 소프트 삭제(events 와 동일 관례)
);
create index liabilities_holding_id_idx on liabilities (holding_id);
-- updated_at 자동 갱신(init_schema 의 set_updated_at 재사용)
create trigger liabilities_set_updated_at
  before update on liabilities
  for each row execute function set_updated_at();
-- ─────────────────────────────────────────────────────────────
-- RLS — 사용자는 자기 holding 의 부채만 read/write (accounts 정책과 동일)
-- ─────────────────────────────────────────────────────────────
alter table liabilities enable row level security;
create policy "liabilities_select_own" on liabilities
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "liabilities_insert_own" on liabilities
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "liabilities_update_own" on liabilities
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "liabilities_delete_own" on liabilities
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
