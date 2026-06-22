# Phase 0 Research: 사이트 성능 개선

전수조사(Explore 3축 + 핵심 파일 직접 확인)로 병목을 특정하고, 각 해소 기법을 결정한다.
모든 NEEDS CLARIFICATION 없음(spec 합의 완료). 아래는 결정·근거·대안.

## R1. kis_security_master 한글 부분검색 — 트라이그램 GIN

- **현황**: [kisMaster.ts:20-24](../../src/lib/finance/kisMaster.ts#L20-L24)가 `name_ko.ilike.%q%`(양쪽 와일드카드, 부분검색). 마이그레이션 `20260623010000_kis_security_master.sql`에는 `name_ko` **B-tree** 인덱스뿐 → 부분검색(`%q%`)은 B-tree로 못 타고 **풀스캔**. `grep`로 repo 전체에 `pg_trgm`/`gin_trgm` 부재 확인.
- **Decision**: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + `name_ko`(필요 시 `name_en`)에 `gin (… gin_trgm_ops)`. ILIKE 코드는 그대로 두면 플래너가 GIN을 사용.
- **Rationale**: 트라이그램 GIN은 `%q%` 부분검색을 인덱스로 처리(트라이그램 ≥1 매칭). 코드 변경 0, 동작 불변.
- **Alternatives**: ① Postgres FTS(`tsvector`) — 형태소·접두 위주라 한글 부분일치엔 trgm이 더 단순·적합. ② 클라이언트 전량 로드 후 JS 필터 — 데이터 증가 시 비현실적. ③ 외부 검색엔진 — 과함.
- **부수 적용**: 검색 라우트의 또 다른 부분검색 [route.ts:71](../../src/app/api/search/route.ts#L71) `etf_ter_cache.name.ilike.%q%`도 동일하게 trgm 인덱스 부여(871행 규모).

## R2. events.symbol 인덱스

- **현황**: `init_schema.sql`에 `events`는 `account_id`·`date`, 감사 컬럼에 `reverses_event_id`·`deleted_at` 인덱스만. **`symbol` 인덱스 없음**. 종목 단위 집계·룩스루·상세에서 symbol 필터 시 스캔.
- **Decision**: `create index events_symbol_idx on events (symbol);`
- **Rationale**: 단일 컬럼 B-tree, 후방호환(쓰기 영향 미미). symbol 필터·그룹 쿼리 가속.
- **Alternatives**: 복합 인덱스 `(account_id, symbol)` — 현재 쿼리 패턴(account_id로 먼저 좁힘)상 단일로 충분, 과인덱싱 회피.

## R3. DART 직렬 호출 → 병렬

- **현황 A (TTM)**: [dart.ts:524-530](../../src/lib/finance/dart.ts#L524-L530) — 분기(`Q3/H1/Q1`)마다 `current` await 후 `prior` await(직렬 2회). 첫 성공 분기에서 return.
- **현황 B (fsDiv 판별)**: [dart.ts:685-714](../../src/lib/finance/dart.ts#L685-L714) — CFS 후보 연도 순차 루프(첫 성공 break), 실패 시 OFS 순차 루프. 캐시 히트는 건너뜀. 최악 `years × 2`회 **순차**.
- **현황 C (이미 병렬)**: [dart.ts:583-593](../../src/lib/finance/dart.ts#L583-L593) `getFundamentals`는 연도×CFS/OFS를 이미 `Promise.all`. (전수조사에서 N+1로 의심했으나 실제는 병렬 — 추가 작업 불필요.)
- **Decision**:
  - A: 분기 내 `const [current, prior] = await Promise.all([...])`. 분기 간 순차(early-return)는 유지 — 보통 첫 분기에서 끝나 영향 작음.
  - B: 후보 연도들을 `Promise.all`로 던지고 결과에서 첫 유효 연도 채택. CFS/OFS도 동시 발사 후 CFS 우선.
- **Rationale**: 동일 데이터, 왕복만 겹침. fsDiv는 최악 직렬 지연이 가장 커 효과 큼.
- **Trade-off (B)**: 순차 early-break는 호출 수를 아끼지만 지연이 큼. 병렬은 **호출 수가 늘 수 있음**(캐시 미스 연도 동시 발사). DART 레이트리밋 고려해 **캐시 히트는 먼저 검사**하고 미스 연도만 병렬화(현 캐시 단락 로직 유지). 효과/호출수는 quickstart 측정으로 확인 후 채택.

## R4. 종목 상세 페이지 순차 await

- **현황**: [stocks/[symbol]/page.tsx:182-208](../../src/app/stocks/[symbol]/page.tsx#L182-L208) — `assumptions`/`magnitudes`/`tenYear` Promise를 만들어 두고도 `getFundamentalsSeries`(193)를 **즉시 await**, 이어 `getYearEndCloses`(201)도 순차 await. 상단 `Promise.all`(111-135)과 분리돼 직렬 꼬리가 김.
- **Decision**: `series`에 의존하지 않는 호출(assumptions·magnitudes·tenYear·fundamentalsSeries)을 한 `Promise.all`로 묶어 대기. `getYearEndCloses`는 `series` 의존이므로 그 뒤 2단계로. 추가로 재무/추이 렌더 블록을 `<Suspense>`로 내려 overview 선렌더.
- **Rationale**: overview 첫 콘텐츠(가격·이름)는 무거운 펀더멘털을 기다릴 이유 없음. React 19 streaming.
- **Alternatives**: 전 구간 클라이언트 페치 — SSR 이점·일관성 상실로 기각.

## R5. 요청 단위 메모이제이션 — React.cache

- **현황**: `getPortfolio`([portfolio.ts:57](../../src/lib/portfolio.ts#L57))·`getActiveHolding`·`loadSecurityMeta`/`loadSecurityNames`가 한 요청 내 여러 컴포넌트/페이지 경로에서 중복 호출되며 매번 쿼리. `corpCodeMap`은 이미 모듈 캐시.
- **Decision**: 위 함수들을 `import { cache } from "react"`로 래핑(요청 스코프 메모이즈). 인자 동일 시 1회만 실행.
- **Rationale**: React.cache는 **요청 단위**(요청 간 누수 없음) — 사용자별 데이터에 안전. 동작 불변, 쿼리 수만 감소.
- **주의**: 이 repo의 Next 변형 — 작성 전 `node_modules/next/dist/docs/`에서 `cache`/RSC 가이드 확인(AGENTS.md). Supabase 클라이언트 인자가 캐시 키에 포함되므로, 동일 요청 내 동일 클라이언트 인스턴스 전달 경로 점검.
- **Alternatives**: 수동 전역 Map — 요청 간 누수/메모리 위험으로 기각.

## R6. Suspense 스트리밍

- **현황**: 대시보드는 일부 Suspense 사용. `company/page.tsx:73-82`(계좌그룹 `Promise.all`)·`activity/page.tsx`(이벤트 로드)는 통째로 블로킹.
- **Decision**: 느린 하위 트리를 async 컴포넌트로 분리하고 `<Suspense fallback={기존 스켈레톤}>`로 감싼다. 빠른 헤더/요약 먼저.
- **Rationale**: 체감 첫 콘텐츠 시점 단축. 디자인 톤 유지(스켈레톤 재사용 — Constitution IV).

## R7. select("*") 슬림화

- **현황**: [portfolio.ts:65](../../src/lib/portfolio.ts#L65) `select("*, accounts!inner(holding_id)")`, `accounts.ts:61` 등.
- **Decision**: 실제 사용 컬럼만 명시. 조인은 유지(정합 로직 불변).
- **Rationale**: 전송 컬럼 축소. 동작 불변·낮은 위험.
- **Alternatives**: account_id 직접 `.in()`으로 조인 제거 — 효과 작고 RLS·정합 영향 검토 필요해 1단계에서는 보류(컬럼 명시만).

## R8. (2단계) 시세 TTL 캐시 / timeout

- **Decision(보류·게이트 통과 시)**: KIS 토큰의 `cached + inflight` 패턴([kis/client.ts])을 본떠 심볼키 10~30s 모듈 메모리 캐시. 외부 fetch에 `AbortController`(5~8s)+폴백.
- **Rationale**: "실시간 시세 DB 영구저장 금지"(Constitution V·메모리 원칙) 준수하며 호출 빈도만 억제. 멀티 인스턴스면 인스턴스별 캐시(수용).

## 미해결/이월
- 측정 환경(로컬 dev vs Vercel 배포본), `kis_security_master` 현재 행수, 모바일/데스크톱 타깃 — **plan에는 블로커 아님**. quickstart에서 "배포본·실데이터 기준 측정" 절차로 흡수.
