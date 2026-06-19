-- ENUF — 수기 펀더멘털 입력(오너이익용 D&A 등)
-- 한국 DART는 감가상각(D&A)을 현금흐름표 본문에 안 쪼개고 '조정'으로 합산(주석에만) →
-- 오너이익(=순이익+D&A−총CapEx, spec §12-1) 자동계산 불가 → 사용자가 주석 보고 직접 입력.
--
-- 설계: 순이익·CapEx는 DART 자동, D&A만 수기. holding 단위(계산은 종목별).
-- RLS: liabilities/manual_assets 와 동일(자기 holding 소속만). 종목당 1행(upsert).

create table manual_fundamentals (
  id           uuid primary key default gen_random_uuid(),
  holding_id   uuid not null references holdings (id) on delete cascade,
  symbol       text not null,                       -- 종목코드
  dna          numeric check (dna >= 0),            -- 감가상각비(₩, 수기). null=미입력
  fiscal_year  integer,                             -- 이 D&A 가 대응하는 사업연도(신선도 표시)
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (holding_id, symbol)                       -- 종목당 1행 → upsert
);
create index manual_fundamentals_holding_id_idx on manual_fundamentals (holding_id);
create trigger manual_fundamentals_set_updated_at
  before update on manual_fundamentals
  for each row execute function set_updated_at();
alter table manual_fundamentals enable row level security;
create policy "manual_fundamentals_select_own" on manual_fundamentals
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_fundamentals_insert_own" on manual_fundamentals
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_fundamentals_update_own" on manual_fundamentals
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_fundamentals_delete_own" on manual_fundamentals
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
