-- ENUF — 대출↔부동산 연결 (spec 012 확장)
-- 담보대출을 특정 수기자산(부동산)에 연결 → 물건별 이자 귀속·정확한 누적 기점.
--  · nullable: 미연결 대출은 종전대로 사업부 공통 풀에서 차감(하위호환).
--  · on delete set null: 물건 삭제 시 대출은 남고 연결만 해제(부채 보존).
--  · 마진·신용 등 비담보 대출은 보통 미연결.

alter table liabilities
  add column manual_asset_id uuid references manual_assets (id) on delete set null;

create index liabilities_manual_asset_idx on liabilities (manual_asset_id);
