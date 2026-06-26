-- 015-account-members — 컴퍼니(CEO) 레이어
-- 계층: holdings(지주회사) → members(컴퍼니/CEO) → accounts(계좌) → events(자회사/종목)
--
-- · members: 가족 한 사람의 계좌 묶음 = 하나의 컴퍼니. holding 안의 순수 데이터(로그인 비귀속).
-- · accounts.member_id: 계좌의 주인 컴퍼니(nullable — null=기본 컴퍼니 '본인' 취급).
-- · included=false 컴퍼니는 연결(합산) 계산에서 제외(회사 페이지 토글).
-- · 무중단: 기존 holding마다 '본인' 컴퍼니 생성 후 전 계좌 연결. 기존 화면 동일.
--
-- 롤백: alter table accounts drop column member_id;  drop table members;
--       create_default_account() 를 직전 버전(계좌만 생성)으로 원복.

-- ─────────────────────────────────────────────────────────────
-- 1. members — 컴퍼니(CEO) 레이어
-- ─────────────────────────────────────────────────────────────
create table members (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid not null references holdings (id) on delete cascade,
  name        text not null,                       -- 컴퍼니/CEO 표시명(예: '민준')
  emoji       text,                                -- 아바타용(선택). null이면 이름 글자 폴백
  included    boolean not null default true,       -- false면 연결(합산) 계산에서 제외(토글)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index members_holding_id_idx on members (holding_id);

-- ─────────────────────────────────────────────────────────────
-- 2. accounts.member_id — 계좌의 주인 컴퍼니(nullable = 기본 컴퍼니)
-- ─────────────────────────────────────────────────────────────
alter table accounts
  add column member_id uuid references members (id) on delete set null;
create index accounts_member_id_idx on accounts (member_id);

-- ─────────────────────────────────────────────────────────────
-- 3. RLS — accounts 와 동일 패턴(소속 holding 소유자만)
-- ─────────────────────────────────────────────────────────────
alter table members enable row level security;
create policy "members_select_own" on members
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "members_insert_own" on members
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "members_update_own" on members
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "members_delete_own" on members
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 4. 백필 — 기존 holding마다 '본인' 컴퍼니 1개 생성 후 전 계좌 연결
-- ─────────────────────────────────────────────────────────────
with seed as (
  insert into members (holding_id, name, sort_order)
  select id, '본인', 0 from holdings
  returning id, holding_id
)
update accounts a
   set member_id = s.id
  from seed s
 where a.holding_id = s.holding_id
   and a.member_id is null;

-- ─────────────────────────────────────────────────────────────
-- 5. 기본 계좌 트리거 교체 — holding 생성 시 '본인' 컴퍼니 + 'main' 계좌(연결)
-- ─────────────────────────────────────────────────────────────
create or replace function create_default_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_member_id uuid;
begin
  insert into members (holding_id, name, sort_order)
  values (new.id, '본인', 0)
  returning id into default_member_id;

  insert into accounts (holding_id, name, account_type, member_id)
  values (new.id, 'main', 'GENERAL', default_member_id);
  return new;
end;
$$;
-- 트리거(holdings_create_default_account)는 기존 그대로 이 함수를 호출.
