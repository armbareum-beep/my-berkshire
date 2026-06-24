-- 007-family-ledger-growth — 챌린지/랭킹 제거 · 단일 가족 장부(ledger) 수렴.
-- 배경: 수기 장부 위 경쟁 랭킹은 조작 가능 → 폐지(헌법 v1.1.0, 원칙 II).
-- 이 마이그레이션은 랭킹을 읽던 코드가 모두 제거된 뒤 배포한다.

-- 1) 기존 비-ledger holding을 ledger로 이관(ledger가 더 permissive → 데이터 손실 없음).
update public.holdings set mode = 'ledger' where mode <> 'ledger';

-- 2) 랭킹/스냅샷 RPC 제거 — alpha(050000) + xirr(030000 mode-less / 040000 mode) 전 오버로드.
drop function if exists public.get_alpha_leaderboard(holding_mode, int);
drop function if exists public.get_alpha_percentile(numeric, holding_mode);
drop function if exists public.get_alpha_histogram(holding_mode);
drop function if exists public.get_xirr_leaderboard(holding_mode, int);
drop function if exists public.get_xirr_leaderboard(int);
drop function if exists public.get_xirr_percentile(numeric, holding_mode);
drop function if exists public.get_xirr_percentile(numeric);
drop function if exists public.get_xirr_histogram(holding_mode);
drop function if exists public.get_xirr_histogram();

-- 3) 스냅샷 테이블 제거(읽고 쓰던 코드 전부 삭제됨). 자체 인덱스/정책도 함께 사라진다.
drop table if exists public.user_perf_snapshots;

-- 주의: holding_mode enum 과 holdings.mode 컬럼은 유지(컬럼 의존이라 enum drop은 리스크).
--       앞으로 모든 holding 은 항상 'ledger'.
