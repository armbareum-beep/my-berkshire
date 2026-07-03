-- 아카이브된 리밸런싱 계획(자본배분 작전명령서) — 완수/교체/삭제된 active_plan 원문 보관.
-- 완수 여부·완수일은 저장하지 않는다(events에서 매번 재판정, 헌장 V). FIFO 20개 상한은
-- 애플리케이션(rebalance/actions.ts)에서 관리.
alter table holdings
  add column if not exists archived_plans jsonb not null default '[]';
