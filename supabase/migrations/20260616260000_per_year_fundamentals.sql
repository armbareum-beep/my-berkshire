-- ENUF — 2단계: 수기 펀더멘털 연도별 전환 + 가정 분리
--
-- 그동안 manual_fundamentals 는 종목당 1행이라 D&A·유지CapEx(연도별 금액)가 연도 롤오버 시
-- 섞이는 문제(stale)가 있었음. 다년 정규화 오너이익(§12)을 위해 금액을 연도별로 쌓는다.
--   · 금액류(dna·maint_capex) = 연도별 → manual_fundamentals 를 (holding,symbol,fiscal_year) 유니크로.
--   · 가정류(discount_rate·growth_rate) = 연도 무관 → 새 valuation_assumptions 로 분리(종목당 1행).
-- stale 개념 소멸: 연도마다 칸이 따로라 섞일 일이 없음.

-- 1) 가정 테이블(연도 무관)
create table valuation_assumptions (
  id            uuid primary key default gen_random_uuid(),
  holding_id    uuid not null references holdings (id) on delete cascade,
  symbol        text not null,
  discount_rate numeric check (discount_rate > 0 and discount_rate <= 1), -- 요구수익률(소수). null=기본 규칙
  growth_rate   numeric check (growth_rate >= 0 and growth_rate < 1),      -- 고든 성장률(소수). null=0%
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (holding_id, symbol)
);
create index valuation_assumptions_holding_id_idx on valuation_assumptions (holding_id);
create trigger valuation_assumptions_set_updated_at
  before update on valuation_assumptions
  for each row execute function set_updated_at();
alter table valuation_assumptions enable row level security;
create policy "valuation_assumptions_select_own" on valuation_assumptions
  for select using (holding_id in (select id from holdings where user_id = auth.uid()));
create policy "valuation_assumptions_insert_own" on valuation_assumptions
  for insert with check (holding_id in (select id from holdings where user_id = auth.uid()));
create policy "valuation_assumptions_update_own" on valuation_assumptions
  for update using (holding_id in (select id from holdings where user_id = auth.uid()))
  with check (holding_id in (select id from holdings where user_id = auth.uid()));
create policy "valuation_assumptions_delete_own" on valuation_assumptions
  for delete using (holding_id in (select id from holdings where user_id = auth.uid()));
-- 2) 기존 가정값을 새 테이블로 이관(종목당 1행으로 집계)
insert into valuation_assumptions (holding_id, symbol, discount_rate, growth_rate)
select holding_id, symbol, max(discount_rate), max(growth_rate)
from manual_fundamentals
where discount_rate is not null or growth_rate is not null
group by holding_id, symbol;
-- 3) manual_fundamentals 를 연도별 금액 전용으로 정리
alter table manual_fundamentals drop column discount_rate;
alter table manual_fundamentals drop column growth_rate;
-- 금액 없는(가정 전용이던) 행·연도 없는 행 제거 → 연도별 키 성립
delete from manual_fundamentals where dna is null and maint_capex is null;
delete from manual_fundamentals where fiscal_year is null;
alter table manual_fundamentals alter column fiscal_year set not null;
-- 유니크 (holding,symbol) → (holding,symbol,fiscal_year)
alter table manual_fundamentals drop constraint manual_fundamentals_holding_id_symbol_key;
alter table manual_fundamentals
  add constraint manual_fundamentals_holding_symbol_year_key
  unique (holding_id, symbol, fiscal_year);
