-- 성능 개선(004-performance) — 인덱스만 추가하는 후방호환 마이그레이션.
-- 스키마/제약 변경 없음. 코드 변경보다 먼저 배포 가능(읽기 가속만).
-- 검증: EXPLAIN ANALYZE 로 아래 인덱스 사용 확인(specs/004-performance/quickstart.md §1).

-- 한글/영문 부분검색(%q%)을 인덱스로 처리하기 위한 트라이그램 확장.
create extension if not exists pg_trgm;

-- events.symbol — 종목 단위 필터·집계 풀스캔 제거(룩스루·상세·종목별 조회).
create index if not exists events_symbol_idx on events (symbol);

-- kis_security_master 한글/영문 부분검색 — kisMaster.ts 의 name_ko/name_en ilike '%q%' 가속.
-- 기존 B-tree(name_ko_idx)는 접두(%q)만 타고 부분검색(%q%)은 못 탐 → GIN trgm 필요.
create index if not exists kis_security_master_name_ko_trgm
  on kis_security_master using gin (name_ko gin_trgm_ops);
create index if not exists kis_security_master_name_en_trgm
  on kis_security_master using gin (name_en gin_trgm_ops);

-- etf_ter_cache 이름 부분검색 — 검색 라우트(api/search/route.ts)의 name ilike '%q%' 가속(약 871행).
create index if not exists etf_ter_cache_name_trgm
  on etf_ter_cache using gin (name gin_trgm_ops);
