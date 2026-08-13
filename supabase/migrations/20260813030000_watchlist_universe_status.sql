-- Approved Universe — Capital Allocator PRD v0.3 §3.1·§16 (investment_universe.status)
--
-- PRD 는 신규 테이블 `investment_universe` 를 제안하지만, 이 앱엔 이미 같은 모양의
-- `watchlist`(holding_id, symbol)가 있다. 스펙 v1.1 §13.2 "신규 테이블 없음" 원칙에 따라
-- 새 테이블 대신 상태 컬럼만 얹는다.
--
--   APPROVED — 자본배분 후보. 아직 한 주도 없어도 후보가 된다(PRD §3.1 의 핵심).
--   WATCH    — 관심만. 후보 아님.
--
-- ⚠️ 기본값이 'WATCH' 인 이유: 기존 watchlist 행은 전부 "관심종목"이었다. 이걸 APPROVED 로
--    올리면 사용자가 고르지도 않은 종목이 갑자기 자본배분 후보가 된다. 기존 의미를 지킨다.
--
-- 보유 중인데 행이 없는 종목은 코드가 APPROVED 로 간주한다(`universe.ts`) — 지금까지
-- 보유 종목이 자동으로 후보였던 동작을 보존하기 위해서다. 보유 종목을 후보에서 빼려면
-- WATCH 행을 만들면 된다.

alter table watchlist
  add column if not exists status text not null default 'WATCH'
    check (status in ('APPROVED', 'WATCH'));

comment on column watchlist.status is
  'APPROVED = 자본배분 후보(미보유도 가능), WATCH = 관심만. 보유 중이고 행이 없으면 코드가 APPROVED 로 간주.';

-- 후보 조회는 "이 회사의 APPROVED 전부"라 (holding_id, status) 로 들어온다.
create index if not exists watchlist_holding_status_idx
  on watchlist (holding_id, status);
