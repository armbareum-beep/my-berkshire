-- alpha(초과수익) + benchmark_symbol 컬럼 추가
alter table user_perf_snapshots
  add column if not exists alpha numeric,
  add column if not exists benchmark_symbol text;

-- ── 알파 기반 RPC 3개 (기존 get_xirr_* 대체) ────────────────────────

-- 1) 백분위: 같은 모드의 alpha 기준
create or replace function get_alpha_percentile(p_alpha numeric, p_mode holding_mode default 'challenge')
returns table(rank bigint, total bigint, top_pct numeric)
language sql security definer set search_path = public as $$
  with ranked as (
    select
      alpha,
      row_number() over (order by alpha desc) as r,
      count(*) over () as total
    from user_perf_snapshots
    where alpha is not null
      and mode = p_mode
  )
  select
    (select r from ranked where alpha = p_alpha order by r limit 1),
    (select total from ranked limit 1),
    round(
      100.0 * (select r from ranked where alpha = p_alpha order by r limit 1)
      / nullif((select total from ranked limit 1), 0),
      1
    );
$$;

-- 2) 히스토그램: 8구간, 초과수익 중심
create or replace function get_alpha_histogram(p_mode holding_mode default 'challenge')
returns table(bucket text, lo numeric, hi numeric, cnt bigint)
language sql security definer set search_path = public as $$
  with bounds(lo, hi, bucket) as (
    values
      (-1e9::numeric, -0.20::numeric, '<-20%p'),
      (-0.20,         -0.10,          '-20~-10%p'),
      (-0.10,          0.00,          '-10~0%p'),
      ( 0.00,          0.05,           '0~5%p'),
      ( 0.05,          0.10,           '5~10%p'),
      ( 0.10,          0.20,          '10~20%p'),
      ( 0.20,          0.30,          '20~30%p'),
      ( 0.30,          1e9,           '>30%p')
  )
  select
    b.bucket,
    case when b.lo = -1e9 then null else b.lo end as lo,
    case when b.hi =  1e9 then null else b.hi end as hi,
    count(s.alpha) as cnt
  from bounds b
  left join user_perf_snapshots s
    on s.alpha >= b.lo and s.alpha < b.hi
    and s.mode = p_mode
  group by b.bucket, b.lo, b.hi
  order by b.lo;
$$;

-- 3) 리더보드: alpha 기준 상위 N명
create or replace function get_alpha_leaderboard(p_mode holding_mode default 'challenge', p_limit int default 30)
returns table(rank bigint, alpha_pct numeric, cumulative_pct numeric, benchmark_symbol text, days int, is_me boolean)
language sql security definer set search_path = public as $$
  select
    row_number() over (order by alpha desc) as rank,
    round(alpha * 100, 1)                   as alpha_pct,
    round(cumulative_return * 100, 1)        as cumulative_pct,
    s.benchmark_symbol,
    s.days,
    (s.user_id = auth.uid())                as is_me
  from user_perf_snapshots s
  where alpha is not null
    and mode = p_mode
  order by alpha desc
  limit p_limit;
$$;
