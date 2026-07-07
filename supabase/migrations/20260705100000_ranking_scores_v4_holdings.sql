-- 랭킹 v4 — ranking_scores.holdings(jsonb) 추가.
-- NULL = 미계산(구버전 계산분). 대시보드/랭킹 재방문 시 upsert로 자연 채움.

ALTER TABLE ranking_scores
  ADD COLUMN IF NOT EXISTS holdings JSONB;
