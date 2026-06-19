-- 목표비중(리밸런싱) — 종목별 목표 비중 맵을 holding 에 저장.
-- 예: {"005930": 0.2, "AAPL": 0.3} (합이 1에 가깝도록 권장하나 강제하지 않음)
-- 비즈니스 로직: 현재비중(보유자산 대비) − 목표비중 = 드리프트.
alter table holdings
  add column target_weights jsonb not null default '{}'::jsonb;
