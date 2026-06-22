-- mode + investment_krw 컬럼 추가
alter table user_perf_snapshots
  add column if not exists mode holding_mode not null default 'challenge';

alter table user_perf_snapshots
  add column if not exists investment_krw bigint;

-- ── 기존 3개 함수 교체 (mode 필터 추가) ──────────────────────────────

-- 1) 백분위: challenge/live 끼리만 집계
create or replace function get_xirr_percentile(p_xirr numeric, p_mode holding_mode default 'challenge')
returns table(rank bigint, total bigint, top_pct numeric)
language sql security definer set search_path = public as $$
  with ranked as (
    select
      xirr,
      row_number() over (order by xirr desc) as r,
      count(*) over () as total
    from user_perf_snapshots
    where xirr is not null
      and days >= 90
      and mode = p_mode
  )
  select
    (select r from ranked where xirr = p_xirr order by r limit 1),
    (select total from ranked limit 1),
    round(
      100.0 * (select r from ranked where xirr = p_xirr order by r limit 1)
      / nullif((select total from ranked limit 1), 0),
      1
    );
$$;

-- 2) 히스토그램: 8구간
create or replace function get_xirr_histogram(p_mode holding_mode default 'challenge')
returns table(bucket text, lo numeric, hi numeric, cnt bigint)
language sql security definer set search_path = public as $$
  with bounds(lo, hi, bucket) as (
    values
      (-1e9::numeric, -0.20::numeric, '<-20%'),
      (-0.20,         -0.10,          '-20~-10%'),
      (-0.10,          0.00,          '-10~0%'),
      ( 0.00,          0.10,           '0~10%'),
      ( 0.10,          0.20,          '10~20%'),
      ( 0.20,          0.30,          '20~30%'),
      ( 0.30,          0.50,          '30~50%'),
      ( 0.50,          1e9,           '>50%')
  )
  select
    b.bucket,
    case when b.lo = -1e9 then null else b.lo end as lo,
    case when b.hi =  1e9 then null else b.hi end as hi,
    count(s.xirr) as cnt
  from bounds b
  left join user_perf_snapshots s
    on s.xirr >= b.lo and s.xirr < b.hi
    and s.days >= 90
    and s.mode = p_mode
  group by b.bucket, b.lo, b.hi
  order by b.lo;
$$;

-- 3) 리더보드: mode 기반 상위 N명
create or replace function get_xirr_leaderboard(p_mode holding_mode default 'challenge', p_limit int default 30)
returns table(rank bigint, xirr_pct numeric, cumulative_pct numeric, days int, is_me boolean)
language sql security definer set search_path = public as $$
  select
    row_number() over (order by xirr desc) as rank,
    round(xirr * 100, 1)             as xirr_pct,
    round(cumulative_return * 100, 1) as cumulative_pct,
    s.days,
    (s.user_id = auth.uid())         as is_me
  from user_perf_snapshots s
  where xirr is not null
    and days >= 90
    and mode = p_mode
  order by xirr desc
  limit p_limit;
$$;
