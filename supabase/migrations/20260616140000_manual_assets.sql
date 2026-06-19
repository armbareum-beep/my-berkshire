-- ENUF — 수기 평가 자산(부동산·실물·대체) = "사업부" 레이어
-- 순자산 = 투자자산 + 현금 + 수기자산 − 부채.
--
-- 설계 원칙(메모리 xirr-asset-scope / complexity-gamification-philosophy)
--  · 평가원천 = 수기(내가 입력). 피드(시세) 자산이 아님 → 투자 XIRR 에서 제외, 순자산에만 합산.
--  · events 가 아니라 holdings 직속 테이블 → XIRR/포지션 계산 경로를 자동으로 안 탄다.
--  · kind enum 만 늘리면 새 자산클래스 추가(부동산→토지·상가·비상장·미술품…). 공유 패턴.
--  · 모든 금액 ₩(기능통화). 상가 수익률환원법(NOI/cap rate)·임대 인컴은 추후(현재는 수기 평가액).
--  · RLS: liabilities 와 동일(자기 holding 소속만).

create type manual_asset_kind as enum (
  'REAL_ESTATE',  -- 주택·아파트·자가
  'LAND',         -- 토지
  'COMMERCIAL',   -- 상가·수익형 건물(추후 수익률환원법)
  'UNLISTED',     -- 비상장 주식·스타트업 지분·스톡옵션
  'COLLECTIBLE',  -- 미술품·시계·수집품 등 대체자산
  'OTHER'
);
create table manual_assets (
  id             uuid primary key default gen_random_uuid(),
  holding_id     uuid not null references holdings (id) on delete cascade,
  name           text not null,                                   -- 표시명(예: "마포 자가")
  kind           manual_asset_kind not null default 'REAL_ESTATE',
  current_value  numeric not null default 0 check (current_value >= 0),  -- 현재 평가액(₩, 수기)
  acquired_price numeric check (acquired_price >= 0),             -- 취득가(₩, 선택 — 손익 표시용)
  acquired_at    date,                                            -- 취득일(선택)
  note           text,                                            -- 메모(선택)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz                                      -- 소프트 삭제
);
create index manual_assets_holding_id_idx on manual_assets (holding_id);
create trigger manual_assets_set_updated_at
  before update on manual_assets
  for each row execute function set_updated_at();
-- ─────────────────────────────────────────────────────────────
-- RLS — 자기 holding 의 수기 자산만 read/write (liabilities 정책과 동일)
-- ─────────────────────────────────────────────────────────────
alter table manual_assets enable row level security;
create policy "manual_assets_select_own" on manual_assets
  for select using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_assets_insert_own" on manual_assets
  for insert with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_assets_update_own" on manual_assets
  for update using (
    holding_id in (select id from holdings where user_id = auth.uid())
  ) with check (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
create policy "manual_assets_delete_own" on manual_assets
  for delete using (
    holding_id in (select id from holdings where user_id = auth.uid())
  );
