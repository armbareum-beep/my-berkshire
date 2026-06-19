-- 이벤트 출처 구분: 'manual'(사용자 입력) | 'auto'(자동 동기화, 예: 배당 피드).
-- 기존 행은 모두 'manual'(기본값). 자동 배당 dedup·UI 뱃지·수동 폴백 구분에 사용.
alter table events
  add column if not exists source text not null default 'manual';
alter table events
  add constraint events_source_valid check (source in ('manual', 'auto'));
