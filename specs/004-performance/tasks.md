---
description: "Task list — 사이트 성능 개선 (체감 속도 단축)"
---

# Tasks: 사이트 성능 개선 (체감 속도 단축)

> 2026-07-03 배포 코드 대조로 체크 정합화(진실원천: docs/roadmap-status.md)

**Input**: Design documents from `/specs/004-performance/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/internal-interfaces.md, quickstart.md

**Tests**: 본 기능은 **동작·계산 결과 불변(회귀 0)** 이 목표 — 신규 TDD 테스트가 아니라
**회귀 검증**(기존 `*.test.ts` + `tsc`/`eslint` + before/after 측정)을 각 스토리 체크포인트에 둔다.

**Organization**: 3 User Story(P1 검색 · P2 종목상세 · P3 대시보드/회사/활동) + 측정 게이트.
**Scope**: 이 tasks는 **1단계(안전 최적화)** 만 다룬다. 2·3단계는 게이트 미달 시에만 착수(말미 Deferred 참조).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일·의존 없음 → 병렬 가능
- **[Story]**: US1/US2/US3 매핑 (Setup·Foundational·Polish는 라벨 없음)

## Path Conventions

Next.js 단일 앱: 소스는 `src/`, 마이그레이션은 `supabase/migrations/`.

---

## Phase 1: Setup (측정 기반 — 모든 스토리 공통)

**Purpose**: before/after 비교를 위한 임시 계측. **머지 전 제거 대상**(FR-008).

- [ ] T001 [P] `src/lib/finance/dart.ts`·`src/lib/finance/prices.ts`의 외부 fetch 래퍼에 임시 호출 카운트+소요시간 `console` 로그 추가(KIS·Yahoo·DART 구분). 머지 전 제거 표식(`// TEMP-PERF`) 주석. — N/A(코드 대조로 확인 불가, 2026-07-03 — TEMP-PERF 마커 현재 없음)
- [ ] T002 [P] `src/app/dashboard/page.tsx`·`src/app/stocks/[symbol]/page.tsx`·`src/app/company/page.tsx`·`src/app/activity/page.tsx`의 핵심 `await` 구간에 `performance.now()` 임시 타이밍 로그(`// TEMP-PERF`) 추가. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T003 Supabase에서 `pg_trgm` 확장 가용성 확인(`select * from pg_available_extensions where name='pg_trgm';`) 및 `kis_security_master` 현재 행수 기록(검증 기준). — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T004 baseline 측정: quickstart.md 절차로 검색·대시보드·상세·company·activity 의 현재 수치(P50·첫 콘텐츠·외부 호출 수)를 `specs/004-performance/` 작업 메모에 기록. — N/A(코드 대조로 확인 불가, 2026-07-03)

**Checkpoint**: 기준선 확보 — 이후 모든 개선을 이 수치와 비교.

---

## Phase 2: Foundational (Blocking — DB 인덱스)

**Purpose**: 인덱스는 US1 검증과 US3 가속을 동시에 푸는 공유 인프라. 단일 마이그레이션.

**⚠️ CRITICAL**: 이 마이그레이션이 적용돼야 US1 검색 검증이 가능.

- [x] T005 신규 마이그레이션 작성 `supabase/migrations/20260624000000_perf_indexes.sql` — contracts/internal-interfaces.md §C1 그대로: `create extension if not exists pg_trgm;`, `events_symbol_idx`, `kis_security_master`(name_ko·name_en) GIN trgm, `etf_ter_cache(name)` GIN trgm. 모두 `if not exists`.
- [ ] T006 마이그레이션 적용(Supabase) 후 `supabase/migrations/` 순서 확인. 스키마 타입 변화 없음(인덱스만)이라 `database.types.ts` 재생성 불필요 — 변화 없는지만 확인. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T007 `EXPLAIN ANALYZE`로 인덱스 사용 확인: `kis_security_master ... ilike '%삼성%'` → GIN Bitmap Scan, `events where symbol=...` → `events_symbol_idx` Index Scan (quickstart §1). — N/A(코드 대조로 확인 불가, 2026-07-03)

**Checkpoint**: 인덱스 활성 — 코드보다 먼저 배포된 후방호환 변경(Constitution Workflow).

---

## Phase 3: User Story 1 — 종목 검색이 즉시 뜬다 (Priority: P1) 🎯 MVP

**Goal**: 한글 부분검색이 트라이그램 인덱스로 즉시 응답(P50 < 300ms).

**Independent Test**: 검색창 "삼성전자"/"에코프로" → P50<300ms, 결과 순서·내용 회귀 없음.

> 코드 변경 거의 없음 — 검색은 기존 ILIKE([kisMaster.ts:23](../../src/lib/finance/kisMaster.ts#L23)) 유지, 인덱스가 받쳐줌. 작업은 검증·측정·회귀 중심.

- [ ] T008 [US1] 검색 경로 회귀 확인: `FINANCE_SOURCE` 비-yahoo에서 `searchKisMaster`([src/lib/finance/kisMaster.ts](../../src/lib/finance/kisMaster.ts)) 결과가 인덱스 전과 동일(재랭킹 31-43行 불변)인지 "삼성전자"·"에코프로"·코드"005930"·영문"Samsung"으로 확인. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T009 [US1] yahoo 모드 ETF 검색([src/app/api/search/route.ts:68-72](../../src/app/api/search/route.ts#L68-L72)) `etf_ter_cache.name.ilike` 가 trgm 인덱스로 가속되는지 + 결과 동일 확인. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T010 [US1] 검색 응답 P50 측정(목표 < 300ms, SC-001). baseline(T004) 대비 기록. — N/A(코드 대조로 확인 불가, 2026-07-03)

**Checkpoint**: US1 단독 완료 — 검색 즉시성 확보(MVP).

---

## Phase 4: User Story 2 — 종목 상세가 빨리 보인다 (Priority: P2)

**Goal**: overview 첫 콘텐츠 < 1.5s, 외부 API 직렬→병렬, 재무 섹션 Suspense 스트리밍.

**Independent Test**: 보유 국내·미국 종목 상세 → 첫 콘텐츠<1.5s, DART fsDiv 호출 순차→1라운드.

- [x] T011 [P] [US2] `src/lib/finance/dart.ts` TTM 합성(524-527行): 분기 내 `current`/`prior`를 `const [current, prior] = await Promise.all([...])`로. 분기 간 early-return·`composeTtm` 입력 동일성 보존(contracts §C3).
- [x] T012 [P] [US2] `src/lib/finance/dart.ts` fsDiv 판별(685-714行): **캐시 히트 먼저 검사 유지**, 미스 연도만 `Promise.all` 병렬 발사 후 "CFS 우선·가장 이른 유효 연도" 규칙으로 채택(직렬과 동치, research R3 trade-off 준수).
- [x] T013 [P] [US2] `src/lib/finance/prices.ts` 미국주 KIS 거래소 폴백(109-116行): NAS→NYS→AMS 순차를 `Promise.any`로. **동률 시 기존 우선순위(NAS)** 보존 확인(contracts §C3). — 배포는 `Promise.all`+try/catch(NAS 우선 for 루프)로 동치 구현.
- [x] T014 [US2] `src/app/stocks/[symbol]/page.tsx`(182-208行): `series` 비의존 호출(assumptions·magnitudes·tenYear·`getFundamentalsSeries`)을 한 `Promise.all`로 묶기. `getYearEndCloses`(series 의존)는 그 뒤 2단계 유지. — 배포는 assumptions·magnitudes를 `Promise.all`로 묶고 tenYear는 지연평가(사용 시점 await)로 분리.
- [x] T015 [US2] `src/app/stocks/[symbol]/page.tsx`: 재무/추이 렌더 블록(FundamentalsTrend·FinancialHealth·DnaYearPanel 등)을 async 하위 컴포넌트로 분리해 `<Suspense fallback={기존 스켈레톤}>`로 감싸 overview 선렌더.
- [ ] T016 [US2] 회귀: `?view=overview/analysis/financials/records` 전 탭에서 표시값이 이전과 동일. 임시 로그로 DART fsDiv 호출이 순차 10~20→병렬 1라운드 확인(SC-004), 첫 콘텐츠<1.5s(SC-003). — N/A(코드 대조로 확인 불가, 2026-07-03)

**Checkpoint**: US2 완료 — 상세 체감 단축. US1과 독립.

---

## Phase 5: User Story 3 — 대시보드·회사·활동이 막힘 없이 뜬다 (Priority: P3)

**Goal**: 요청 단위 중복 쿼리 1회화(React.cache) + 느린 섹션 Suspense + 쿼리 슬림화.

**Independent Test**: `/dashboard`·`/company`·`/activity` 첫 콘텐츠<1.5s, 중복 쿼리 1회.

- [x] T017 [P] [US3] `src/lib/holdings.ts`: `getActiveHolding`을 `import { cache } from "react"`로 래핑(시그니처 불변, contracts §C2). 작성 전 `node_modules/next/dist/docs/`에서 `cache`/RSC 가이드 확인(AGENTS.md).
- [x] T018 [US3] `src/lib/portfolio.ts`: `getPortfolio`를 `React.cache`로 래핑(T017 패턴). 동일 요청 1회 실행 확인.
- [x] T019 [P] [US3] `src/lib/securities.ts`: `loadSecurityMeta`·`loadSecurityNames`를 `React.cache`로 래핑. `symbols` 인자 값 동등성(정렬/정규화) 점검(data-model §2).
- [x] T020 [P] [US3] `src/lib/portfolio.ts:65`: `select("*, accounts!inner(holding_id)")` → 실제 사용 컬럼 명시(조인 유지, 정합 불변).
- [x] T021 [P] [US3] `src/lib/accounts.ts:61`: events `select("*")` → 사용 컬럼 명시.
- [x] T022 [P] [US3] `src/app/company/page.tsx`(73-82行): 계좌그룹 `Promise.all` 로드를 async 하위 컴포넌트 + `<Suspense>`로 분리, 헤더·회사목록 선렌더.
- [x] T023 [P] [US3] `src/app/activity/page.tsx`: 이벤트 로드 블록을 `<Suspense>`로 분리.
- [ ] T024 [US3] 회귀·측정: 요청당 `loadSecurityMeta`/`getPortfolio` 실제 쿼리 1회(SC-005), 세 화면 첫 콘텐츠<1.5s(SC-002), 표시 수치 불변. — N/A(코드 대조로 확인 불가, 2026-07-03)

**Checkpoint**: US3 완료 — 메인 동선 체감 마무리. US1·US2와 독립.

---

## Phase 6: Polish & 게이트 판정

**Purpose**: 임시 계측 제거·전체 회귀·게이트 결정.

- [ ] T025 [P] 임시 계측 전량 제거: `// TEMP-PERF` 로그(T001·T002) 모두 삭제. — N/A(코드 대조로 확인 불가, 2026-07-03 — 현재 TEMP-PERF 마커 없음, 제거된 것인지 애초 미도입인지 코드만으로 구분 불가)
- [ ] T026 전체 회귀: `npx tsc --noEmit` 클린, 변경 파일 `npx eslint` 클린, `npm test`(`*.test.ts` 엔진 출력 불변) 통과. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T027 `FINANCE_SOURCE=yahoo` ↔ `kis` 양쪽에서 화면·수치 동일(SC-006) 확인. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T028 quickstart.md §5 게이트 판정: SC-001~003 달성 시 **종료**. 미달 항목이 외부 API(상세)면 2단계, 무거운 계산(룩스루)이면 3단계로 별도 진행 결정 기록. — N/A(코드 대조로 확인 불가, 2026-07-03)

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup(P1)**: 즉시 시작.
- **Foundational(P2)**: Setup 후. **US1 검증 차단 해제**(인덱스 필요). events.symbol은 US3도 가속.
- **User Stories(P3~5)**: Foundational 후. 서로 **독립** — 병렬 가능.
  - US1: 거의 검증만(코드 변경 최소).
  - US2: `dart.ts`/`prices.ts`/상세 page — US1·US3와 다른 파일.
  - US3: `lib`(holdings/portfolio/securities/accounts) + company/activity page — US2와 파일 충돌 없음.
- **Polish(P6)**: 착수한 모든 스토리 완료 후.

### Within Stories
- US3 내부: T018(`getPortfolio`)는 동일 파일이라 T020과 순차(같은 `portfolio.ts`). T017→T018은 패턴 선행 권장(병렬 아님).
- 나머지 `[P]`는 서로 다른 파일 → 병렬.

### Parallel Opportunities
- T001·T002 (Setup 계측).
- US2의 T011·T012(같은 `dart.ts`지만 다른 함수 — 충돌 시 순차)·T013(다른 파일) — 안전히 하려면 `dart.ts` 두 작업은 순차, T013 병렬.
- US3의 T017·T019·T020·T021·T022·T023 — 단, `portfolio.ts`를 건드리는 T018·T020은 서로 순차.
- 스토리 간(US1/US2/US3)은 인력만 되면 동시 진행.

---

## Parallel Example: User Story 2

```bash
# dart.ts 두 함수는 같은 파일 → 순차 권장. 다른 파일은 병렬:
Task T013: "prices.ts 거래소 폴백 Promise.any"
Task T014: "stocks/[symbol]/page.tsx await 묶기"   # dart.ts 완료 후 의미 측정
```

---

## Implementation Strategy

### MVP First (US1)
1. Phase 1 Setup → 2. Phase 2 Foundational(인덱스) → 3. Phase 3 US1 검증 → **STOP & 측정**(검색 P50<300ms면 즉시 체감 가치).

### Incremental Delivery
1. Setup+Foundational → 인덱스 배포(후방호환, 단독 배포 가능).
2. US1 → 검색 검증 → 배포(MVP).
3. US2 → 상세 병렬화·Suspense → 측정 → 배포.
4. US3 → 캐시·Suspense → 측정 → 배포.
5. 각 단계 후 게이트 판정 — 목표 달성 시 2·3단계 미착수.

---

## Deferred (게이트 미달 시에만 — 별도 진행)

> 1단계(위 전부)로 SC 목표 달성 시 **착수하지 않음**(과최적화 방지, spec Assumptions).

- **2단계** — 시세/환율 모듈 메모리 TTL 캐시(10~30s, KIS 토큰 `inflight` 패턴), 외부 fetch `AbortController` timeout(5~8s)+폴백, DART TTM/연말종가 캐시 키 확장. (`src/lib/finance/prices.ts`·`fx.ts`·`dart.ts`)
- **3단계** — 룩스루 결과 `calculation_snapshots` 적재([lookThrough.ts:286-293](../../src/lib/finance/lookThrough.ts#L286-L293)), `buyAgg` 공용 유틸화([accounts.ts:81](../../src/lib/accounts.ts#L81)↔[dashboard.ts:101](../../src/lib/dashboard.ts#L101)), `positions` 뷰 머터리얼라이즈드 검토.

---

## Notes
- `[P]` = 다른 파일·무의존. 같은 파일(특히 `dart.ts`·`portfolio.ts`) 동시 편집 금지 → 순차.
- 모든 변경의 합격 기준 = **회귀 0**(엔진 출력·화면·`events` 원장 불변, Constitution III·V).
- 각 task 또는 논리 그룹 후 커밋. 체크포인트마다 스토리 단독 검증.
