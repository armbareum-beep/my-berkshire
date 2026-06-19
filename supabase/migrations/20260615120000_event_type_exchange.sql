-- 환전(EXCHANGE) 이벤트 유형 추가 — 통화 간 현금 이동(₩↔외화).
-- enum 값 추가는 별도 마이그레이션으로(같은 트랜잭션 내에서 추가·사용 불가).
alter type event_type add value if not exists 'EXCHANGE';
