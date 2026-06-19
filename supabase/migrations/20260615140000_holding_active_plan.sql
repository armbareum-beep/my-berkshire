-- 리밸런싱 계획(자본배분 작전명령서) — holding 당 활성 계획 1개를 jsonb 로 저장.
-- 구조: { "createdAt": "2026-06-15", "legs": [ { "symbol": "...", "name": "...", "shares": 3 } ] }
-- 진행률은 저장하지 않고 events(계획일 이후 매수)에서 파생 → 상태 불일치 없음. 비우면 계획 없음.
alter table holdings
  add column active_plan jsonb;
