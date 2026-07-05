-- 038: 보유 종목 공시 — 종목명·심볼·비중(%)만 담는 표시 전용 jsonb.
-- 형식: {"v":1,"items":[{"symbol":"AAPL","name":"애플","pct":34}, ...]} — pct 내림차순.
-- 정확한 금액·수량은 여전히 어떤 컬럼에도 없다(034 불변식의 부분 개정 — 종목명·%만 공개).
alter table ranking_scores
  add column if not exists holdings jsonb;
