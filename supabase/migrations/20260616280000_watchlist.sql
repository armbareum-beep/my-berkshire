-- ENUF — 관심종목(watchlist)
-- 매수 전에도 종목을 분석·시세 추적할 수 있게(증권통식 관심종목 대체).
-- holding 단위, 종목당 1행. RLS: 자기 holding 소속만.

create table watchlist (
  id          uuid primary key default gen_random_uuid(),
  holding_id  uuid not null references holdings (id) on delete cascade,
  symbol      text not null,
  created_at  timestamptz not null default now(),
  unique (holding_id, symbol)
);
create index watchlist_holding_id_idx on watchlist (holding_id);
alter table watchlist enable row level security;
create policy "watchlist_select_own" on watchlist
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "watchlist_insert_own" on watchlist
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "watchlist_delete_own" on watchlist
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
