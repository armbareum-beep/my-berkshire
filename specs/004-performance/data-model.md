# Phase 1 Data Model: 사이트 성능 개선

> 본 기능은 **스키마(테이블/컬럼) 변경이 없다.** 데이터 모델 변화는 (1) 인덱스 추가,
> (2) 요청 단위 캐시 키, (3) (2단계) 모듈 메모리 TTL 캐시 키뿐이다. 행 의미·정합 불변.

## 1. 인덱스 (신규 마이그레이션)

| 대상 | 인덱스 | 목적 | 후방호환 |
|---|---|---|---|
| `events(symbol)` | B-tree `events_symbol_idx` | 종목 단위 필터·집계 풀스캔 제거 | 예(읽기 가속만) |
| `kis_security_master(name_ko)` | GIN `gin_trgm_ops` | 한글 부분검색 `%q%` 인덱스화 | 예 |
| `kis_security_master(name_en)` | GIN `gin_trgm_ops` (선택) | 영문 부분검색 | 예 |
| `etf_ter_cache(name)` | GIN `gin_trgm_ops` | ETF 이름 부분검색([route.ts:71]) | 예 |

전제: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` (Supabase 지원 확장).

**불변식 영향 없음** — 인덱스는 쿼리 결과 집합을 바꾸지 않는다(정렬·존재성 동일). 검색 결과의
재랭킹은 기존 JS 로직([kisMaster.ts:31-43](../../src/lib/finance/kisMaster.ts#L31-L43)) 그대로.

## 2. 요청 단위 캐시 (React.cache)

스토리지가 아니라 **요청 스코프 메모이즈**. 키 = 함수 + 인자.

| 함수 | 캐시 키(인자) | 반환 | 수명 |
|---|---|---|---|
| `getActiveHolding(supabase)` | supabase 인스턴스 | `Holding \| null` | 단일 요청 |
| `getPortfolio(supabase)` | supabase 인스턴스 | `Portfolio \| null` | 단일 요청 |
| `loadSecurityMeta(supabase, symbols)` | supabase + symbols 배열 | 메타 맵 | 단일 요청 |
| `loadSecurityNames(supabase, symbols)` | supabase + symbols 배열 | 이름 맵 | 단일 요청 |

규칙:
- 동일 요청 내 **동일 인자 → 1회 실행**. 요청 종료 시 폐기(요청 간 누수 없음 → 사용자별 데이터 안전).
- `symbols` 인자는 참조가 아닌 값 동등성에 주의 — 같은 심볼 집합이 같은 키가 되도록 호출부 정렬/정규화 점검.

## 3. (2단계·게이트 통과 시) 시세 TTL 캐시

모듈 메모리, 영구저장 아님(Constitution V — 실시간 시세 DB 미저장).

| 캐시 | 키 | 값 | TTL |
|---|---|---|---|
| 시세 | `symbol` | `{ price, prevClose }` | 10~30s |
| 환율 | `currency` | rate | 10~30s |

`{ value, expiresAt }` + `inflight` 디듀프(KIS 토큰 패턴 재사용). 멀티 인스턴스 시 인스턴스별 분리.

## 4. (3단계·최후) 계산 스냅샷 확장

기존 `calculation_snapshots`(이미 `(holding_id, kind, portfolio_revision, as_of_date, parameters_hash)` 유니크)에 룩스루 결과 `kind` 추가 적재. 신규 테이블 없음.
