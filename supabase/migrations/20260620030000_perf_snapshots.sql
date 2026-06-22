-- user_perf_snapshots: 사용자 수익률 스냅샷 (퍼센타일 · 리더보드용)
-- 익명 집계만 노출 — 개인 신원 없음. 90일 이상 운용 기준으로 순위 산출.
create table public.user_perf_snapshots (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  holding_id   uuid        not null references public.holdings(id) on delete cascade,
  xirr         numeric,                -- 연환산 수익률(소수), 90일 미만이면 null
  cumulative_return numeric,           -- 누적 수익률(소수)
  days         integer     not null,   -- 운용 일수
  portfolio_krw bigint,               -- 현재 포트폴리오 평가액 KRW
  updated_at   timestamptz not null default now(),
  unique(holding_id)
);

create index user_perf_snapshots_user_id_idx on public.user_perf_snapshots(user_id);

alter table public.user_perf_snapshots enable row level security;

create policy "users manage own perf snapshot"
  on public.user_perf_snapshots
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── 집계 함수 (security definer: RLS 우회해 전체 유저 집계) ─────────────────

-- 내 XIRR이 전체 중 어느 위치인지
create or replace function public.get_xirr_percentile(p_xirr numeric)
returns table(rank bigint, total bigint, top_pct numeric)
language sql security definer stable
as $$
  select
    (count(*) filter (where xirr > p_xirr)) + 1        as rank,
    count(*)                                             as total,
    case when count(*) = 0 then null
         else round(
           (count(*) filter (where xirr > p_xirr))::numeric
           / count(*) * 100,
           1
         )
    end                                                  as top_pct
  from public.user_perf_snapshots
  where xirr is not null and days >= 90;
$$;

-- 분포 히스토그램 (8 구간)
create or replace function public.get_xirr_histogram()
returns table(bucket text, lo numeric, hi numeric, cnt bigint)
language sql security definer stable
as $$
  with buckets(bucket, lo, hi) as (values
    ('<-20%',    null::numeric, -0.20),
    ('-20~-10%', -0.20,        -0.10),
    ('-10~0%',   -0.10,         0.00),
    ('0~10%',    0.00,          0.10),
    ('10~20%',   0.10,          0.20),
    ('20~30%',   0.20,          0.30),
    ('30~50%',   0.30,          0.50),
    ('>50%',     0.50,          null)
  )
  select
    b.bucket, b.lo, b.hi,
    count(s.xirr) as cnt
  from buckets b
  left join public.user_perf_snapshots s
    on  s.xirr is not null
    and s.days >= 90
    and (b.lo is null or s.xirr >= b.lo)
    and (b.hi is null or s.xirr <  b.hi)
  group by b.bucket, b.lo, b.hi
  order by b.lo nulls first;
$$;

-- 익명 리더보드 (신원 비공개, is_me로 내 행 표시)
create or replace function public.get_xirr_leaderboard(p_limit int default 20)
returns table(rank bigint, xirr_pct numeric, cumulative_pct numeric, days integer, is_me boolean)
language sql security definer stable
as $$
  select
    row_number() over (order by xirr desc) as rank,
    round(xirr * 100, 1)                   as xirr_pct,
    round(cumulative_return * 100, 1)      as cumulative_pct,
    days,
    (user_id = auth.uid())                 as is_me
  from public.user_perf_snapshots
  where xirr is not null and days >= 90
  order by xirr desc
  limit p_limit;
$$;
