-- 이벤트 출처에 'snapshot' 추가: 온보딩 현재보유 스냅샷(합성 BUY+DEPOSIT) 식별용.
-- 거래내역 정밀도 복원에서 실제 매매로 '교체'할 대상을 구분한다.
-- 'manual'(사용자 입력) | 'auto'(자동 동기화) | 'snapshot'(온보딩 임시 스냅샷)
-- 주의: 이 마이그레이션은 온보딩 source:"snapshot" 코드보다 먼저 배포되어야 한다.
alter table events
  drop constraint if exists events_source_valid;
alter table events
  add constraint events_source_valid check (source in ('manual', 'auto', 'snapshot'));
