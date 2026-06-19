-- ENUF — 초기 스키마 (이벤트 드리븐 모델)
-- 출처: /docs/rational-capital-prd-v0.7.md "부록: 백엔드 DB 스키마 설계 프롬프트"
--
-- 핵심 원칙
--  · 단일 events 테이블이 5가지 투자행동(BUY/SELL/DIVIDEND/DEPOSIT/WITHDRAWAL)을 모두 커버.
--  · 계층: events → accounts → holdings → auth.users. 이벤트를 holding에 직접 붙이지 않음.
--  · positions 는 매수/매도 events에서 파생되는 VIEW(직접 수정 불가).
--  · 실시간 시세·세율은 저장하지 않음(시세=외부 API, 세율=lib/config 상수).
--  · 모든 테이블 RLS: 사용자는 자기 데이터만 read/write.

-- ─────────────────────────────────────────────────────────────
-- 1. ENUM 타입
-- ─────────────────────────────────────────────────────────────
create type holding_mode as enum ('ledger', 'challenge', 'live');
create type account_type as enum ('GENERAL', 'ISA', 'PENSION', 'OVERSEAS');
create type event_type   as enum ('BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL');
-- ─────────────────────────────────────────────────────────────
-- 2. holdings — 개인 투자 지주회사(설립 등기 1회성 스냅샷)
-- ─────────────────────────────────────────────────────────────
create table holdings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name              text not null,                       -- 회사명 (J1)
  mode              holding_mode not null,               -- 회사 단위 고정, 전환 불가
  founded_at        date not null,                       -- 설립일 (성과는 이 날짜 이후만 계산)
  initial_capital   numeric not null default 0,          -- 초기 자본금
  initial_valuation numeric not null default 0,          -- 설립 시 평가액 스냅샷
  created_at        timestamptz not null default now()
);
create index holdings_user_id_idx on holdings (user_id);
-- ─────────────────────────────────────────────────────────────
-- 3. accounts — 계좌 레이어(세금은 account_type에서 파생, 수수료는 계좌별 rate)
-- ─────────────────────────────────────────────────────────────
create table accounts (
  id              uuid primary key default gen_random_uuid(),
  holding_id      uuid not null references holdings (id) on delete cascade,
  name            text not null default 'main',
  account_type    account_type not null default 'GENERAL',
  commission_rate numeric not null default 0.00015,      -- 계좌별 위탁수수료율(예: 0.015%)
  created_at      timestamptz not null default now()
);
create index accounts_holding_id_idx on accounts (holding_id);
-- ─────────────────────────────────────────────────────────────
-- 4. events — 단일 이벤트 테이블(5가지 투자행동)
--    symbol: BUY/SELL/DIVIDEND 만 / quantity: BUY/SELL 만
--    price_or_amount: 거래는 주당가격, 현금흐름(입금/출금/배당)은 금액
-- ─────────────────────────────────────────────────────────────
create table events (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references accounts (id) on delete cascade,
  type            event_type not null,
  symbol          text,        -- nullable
  quantity        numeric,     -- nullable
  price_or_amount numeric not null,
  fee_and_tax     numeric not null default 0,
  date            date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 무결성: 종목/수량이 필요한 타입에만 존재하도록 강제
  constraint events_symbol_required check (
    (type in ('BUY', 'SELL', 'DIVIDEND') and symbol is not null)
    or (type in ('DEPOSIT', 'WITHDRAWAL') and symbol is null)
  ),
  constraint events_quantity_required check (
    (type in ('BUY', 'SELL') and quantity is not null and quantity > 0)
    or (type in ('DIVIDEND', 'DEPOSIT', 'WITHDRAWAL') and quantity is null)
  )
);
create index events_account_id_idx on events (account_id);
create index events_date_idx on events (date);
-- updated_at 자동 갱신
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();
-- ─────────────────────────────────────────────────────────────
-- 5. 가입(=holding 생성) 시 기본 계좌 1개 자동 생성
-- ─────────────────────────────────────────────────────────────
create or replace function create_default_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into accounts (holding_id, name, account_type)
  values (new.id, 'main', 'GENERAL');
  return new;
end;
$$;
create trigger holdings_create_default_account
  after insert on holdings
  for each row execute function create_default_account();
-- ─────────────────────────────────────────────────────────────
-- 6. positions — 파생 VIEW(계좌별·종목별 수량/평균단가). 직접 수정 불가.
--    security_invoker: 조회 사용자의 RLS가 그대로 적용됨.
--    평균단가 = Σ(매수수량 × 매수단가) / Σ(매수수량)  (이동평균, 매도는 수량만 차감)
-- ─────────────────────────────────────────────────────────────
create view positions
with (security_invoker = on)
as
select
  a.holding_id,
  e.account_id,
  e.symbol,
  sum(case when e.type = 'BUY' then e.quantity else 0 end)
    - sum(case when e.type = 'SELL' then e.quantity else 0 end) as quantity,
  case
    when sum(case when e.type = 'BUY' then e.quantity else 0 end) > 0
    then sum(case when e.type = 'BUY' then e.quantity * e.price_or_amount else 0 end)
       / sum(case when e.type = 'BUY' then e.quantity else 0 end)
    else 0
  end as avg_cost
from events e
join accounts a on a.id = e.account_id
where e.type in ('BUY', 'SELL') and e.symbol is not null
group by a.holding_id, e.account_id, e.symbol
having sum(case when e.type = 'BUY' then e.quantity else 0 end)
     - sum(case when e.type = 'SELL' then e.quantity else 0 end) <> 0;
-- ─────────────────────────────────────────────────────────────
-- 7. RLS — 사용자는 자기 holdings / accounts / events 만 read/write
-- ─────────────────────────────────────────────────────────────
alter table holdings enable row level security;
alter table accounts enable row level security;
alter table events   enable row level security;
-- holdings: 소유자 = auth.uid()
create policy "holdings_select_own" on holdings
  for select using (user_id = auth.uid());
create policy "holdings_insert_own" on holdings
  for insert with check (user_id = auth.uid());
create policy "holdings_update_own" on holdings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "holdings_delete_own" on holdings
  for delete using (user_id = auth.uid());
-- accounts: 자기 holding 소속만
create policy "accounts_select_own" on accounts
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "accounts_insert_own" on accounts
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "accounts_update_own" on accounts
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "accounts_delete_own" on accounts
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
-- events: 자기 holding의 계좌 소속만
create policy "events_select_own" on events
  for select using (
    account_id in (
      select a.id from accounts a
      join holdings h on h.id = a.holding_id
      where h.user_id = auth.uid()
    )
  );
create policy "events_insert_own" on events
  for insert with check (
    account_id in (
      select a.id from accounts a
      join holdings h on h.id = a.holding_id
      where h.user_id = auth.uid()
    )
  );
create policy "events_update_own" on events
  for update using (
    account_id in (
      select a.id from accounts a
      join holdings h on h.id = a.holding_id
      where h.user_id = auth.uid()
    )
  ) with check (
    account_id in (
      select a.id from accounts a
      join holdings h on h.id = a.holding_id
      where h.user_id = auth.uid()
    )
  );
create policy "events_delete_own" on events
  for delete using (
    account_id in (
      select a.id from accounts a
      join holdings h on h.id = a.holding_id
      where h.user_id = auth.uid()
    )
  );
