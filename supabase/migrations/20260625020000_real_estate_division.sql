-- ENUF — 부동산 사업부(수익 내는 사업부) (spec 011)
-- 부동산 등 수기자산을 주식과 동급의 "수익 내는 사업부"로 승격.
--  · 임대수익(실현)·매도차익(실현)·평가차익(미실현)을 분리. 분모 = 실질취득가.
--  · 임대/매도는 events 와 분리된 자체 원장 → XIRR/포지션 경로를 안 탄다(이중계상 방지).
--  · XIRR 엔 여전히 부동산 미포함(시세 시계열 없음). 누적수익률에만 합산.
--  · 세금·비용은 거래당 단일 합산 필드(주식 fee_and_tax 패턴). 모르면 0/null.
--  · 추가 컬럼은 전부 nullable → 기존 데이터 하위호환.

-- A. manual_assets 확장 ────────────────────────────────────────
alter table manual_assets
  add column acquisition_cost numeric check (acquisition_cost >= 0),  -- 취득 부대비용(세금·중개 단일 합산, ₩)
  add column valuation_source text,                                   -- 평가 출처(KB시세·실거래가·감정가)
  add column valued_at        date,                                   -- 평가 갱신일
  add column sale_price       numeric check (sale_price >= 0),        -- 매도가(₩). null=보유 중
  add column sale_at          date,                                   -- 매도일. null=보유, 있으면 매도됨
  add column sale_cost        numeric check (sale_cost >= 0);         -- 매도 부대비용(양도세·중개 단일 합산, ₩)

-- B. 임대수익 원장(자산별, events 와 분리) ──────────────────────
create table manual_asset_income (
  id              uuid primary key default gen_random_uuid(),
  holding_id      uuid not null references holdings (id) on delete cascade,
  manual_asset_id uuid not null references manual_assets (id) on delete cascade,
  date            date not null,
  amount          numeric not null check (amount >= 0),            -- 임대수익(₩)
  cost            numeric not null default 0 check (cost >= 0),    -- 임대 관련 비용(재산세·관리비 단일 합산, ₩)
  note            text,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz                                      -- 소프트 삭제
);
create index manual_asset_income_asset_idx on manual_asset_income (manual_asset_id);
create index manual_asset_income_holding_idx on manual_asset_income (holding_id);

-- RLS — 자기 holding 소속만 (manual_assets 정책과 동일)
alter table manual_asset_income enable row level security;
create policy "manual_asset_income_select_own" on manual_asset_income
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_asset_income_insert_own" on manual_asset_income
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_asset_income_update_own" on manual_asset_income
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_asset_income_delete_own" on manual_asset_income
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
