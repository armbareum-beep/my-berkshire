-- 이벤트 수정·삭제·상쇄 감사 추적 (PRD 4)
--  · deleted_at: 소프트 삭제(장부 자유 삭제 / 챌린지·라이브 당일 삭제). 데이터는 보존, 계산에서 제외.
--  · reverses_event_id: 과거 이벤트 상쇄(챌린지·라이브). 오늘 날짜 상쇄 이벤트가 원본을 가리킴.
--    원본·상쇄 둘 다 보존하되 계산에서 (원본 + 상쇄마커) 모두 제외 → 효과 0.

alter table events
  add column deleted_at timestamptz,
  add column reverses_event_id uuid references events (id) on delete cascade;
create index events_reverses_event_id_idx on events (reverses_event_id);
create index events_deleted_at_idx on events (deleted_at);
-- positions 뷰: 삭제·상쇄된 이벤트를 제외하도록 재정의.
create or replace view positions
with (security_invoker = on)
as
with reversed_ids as (
  -- 활성 상쇄가 가리키는 원본 id (이들은 취소된 것이므로 제외)
  select reverses_event_id as id
  from events
  where reverses_event_id is not null and deleted_at is null
)
select
  a.holding_id,
  e.account_id,
  e.symbol,
  sum(case when e.type = 'BUY' then e.quantity else 0 end)
    - sum(case when e.type = 'SELL' then e.quantity else 0 end) as quantity,
  case
    when sum(case when e.type = 'BUY' then e.quantity else 0 end) > 0
    then sum(case when e.type = 'BUY' then e.quantity * e.price_or_amount else 0 end)
       / sum(case when e.type = 'BUY' then e.quantity else 0 end)
    else 0
  end as avg_cost
from events e
join accounts a on a.id = e.account_id
where e.type in ('BUY', 'SELL')
  and e.symbol is not null
  and e.deleted_at is null            -- 소프트 삭제 제외
  and e.reverses_event_id is null     -- 상쇄 마커 제외
  and e.id not in (select id from reversed_ids)  -- 취소된 원본 제외
group by a.holding_id, e.account_id, e.symbol
having sum(case when e.type = 'BUY' then e.quantity else 0 end)
     - sum(case when e.type = 'SELL' then e.quantity else 0 end) <> 0;
