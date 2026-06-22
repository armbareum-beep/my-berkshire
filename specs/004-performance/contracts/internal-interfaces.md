# Internal Interfaces & Migration Contract

외부 공개 API 변경 없음. 본 기능의 "계약"은 (1) 마이그레이션의 형태와 (2) 기존 내부 함수의
**시그니처 불변**(동작만 빨라짐)이다. 회귀 0이 핵심 계약.

## C1. 마이그레이션 계약 — `supabase/migrations/2026XXXX_perf_indexes.sql`

```sql
-- 트라이그램 확장(부분검색 인덱스 전제)
create extension if not exists pg_trgm;

-- 종목 단위 필터 가속
create index if not exists events_symbol_idx on events (symbol);

-- 한글/영문 부분검색(%q%) 인덱스화
create index if not exists kis_security_master_name_ko_trgm
  on kis_security_master using gin (name_ko gin_trgm_ops);
create index if not exists kis_security_master_name_en_trgm
  on kis_security_master using gin (name_en gin_trgm_ops);

-- ETF 이름 부분검색
create index if not exists etf_ter_cache_name_trgm
  on etf_ter_cache using gin (name gin_trgm_ops);
```

계약 조건:
- 모두 `if not exists` — 재실행 안전.
- **인덱스만** 추가, 테이블/컬럼/제약 변경 없음 → 코드보다 먼저 배포 가능(후방호환, Constitution Workflow).
- 적용 후 검증: `EXPLAIN ANALYZE`에서 검색 쿼리가 GIN, symbol 쿼리가 `events_symbol_idx` 사용.

## C2. 함수 시그니처 — 불변(React.cache 래핑)

래핑 전후 **호출부 코드 변경 없음**. 동일 인자 → 동일 반환, 단 요청 내 중복 호출은 1회 실행.

```ts
// portfolio.ts — 변경 전/후 동일 시그니처
export const getPortfolio: (supabase: SupabaseClient<Database>) => Promise<Portfolio | null>
// holdings.ts
export const getActiveHolding: (supabase: SupabaseClient<Database>) => Promise<Holding | null>
// securities.ts
export const loadSecurityMeta:  (supabase: SupabaseClient<Database>, symbols: string[]) => Promise<...>
export const loadSecurityNames: (supabase: SupabaseClient<Database>, symbols: string[]) => Promise<Record<string,string>>
```

계약 조건:
- 반환 타입·널 처리·에러 처리 불변.
- 캐시는 요청 스코프 — 요청 간 상태 누수 금지(사용자별 RLS 데이터 안전).

## C3. 병렬화 — 동작 동치 계약

`dart.ts`/`prices.ts`/`stocks/[symbol]/page.tsx`의 병렬화는 **반환값이 직렬 버전과 동일**해야 한다.

- TTM(`dart.ts:524-527`): `Promise.all([current, prior])`의 결과로 `composeTtm` 입력이 직렬과 동일.
- fsDiv(`dart.ts:685-714`): 병렬 후 **CFS 우선 → 가장 이른 유효 연도** 선택 규칙을 직렬과 동일하게 보존. 캐시 히트 단락 유지.
- 거래소 폴백(`prices.ts:109-116`): `Promise.any`로 가장 먼저 성공한 가격 — 직렬 폴백과 "성공 1건" 의미 동일(우선순위 차이 있을 수 있어 **동률 시 NAS 우선** 등 기존 우선순위 보존 확인).
- 상세 페이지(`183-208`): `getYearEndCloses`는 `series` 의존 → 병렬 묶음에서 제외, 의존 순서 보존.

## C4. Suspense 계약

- 분리된 async 하위 컴포넌트는 **부모와 동일 데이터·동일 렌더 결과**를 내야 함(레이아웃 불변).
- `fallback`은 기존 스켈레톤 컴포넌트 재사용(디자인 톤 불변, Constitution IV).

## 회귀 검증 계약(필수)
- `npx tsc --noEmit` · `npx eslint` 클린.
- `FINANCE_SOURCE=yahoo`/`kis` 양쪽 결과 동일.
- 계산 단위테스트(`*.test.ts`) 통과(엔진 출력 불변).
