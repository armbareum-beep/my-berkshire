# Feature Specification: 사이트 성능 개선 (체감 속도 단축)

**Feature Branch**: `004-performance`
**Created**: 2026-06-22
**Status**: Draft
**Input**: User description: "사이트를 어느 정도 완성했는데 속도가 느리다. 코드를 전수조사해서 빠르게 할 계획을 세워라."

## 배경 (Context)

기능이 어느 정도 완성된 단계에서 **체감 속도 저하**가 가장 큰 문제로 떠올랐다.
코드 전수조사(라우팅·데이터페칭 / Supabase·DB / 외부 API 3축 병렬 조사 + 핵심 파일 확인) 결과,
느림은 한 곳이 아니라 **세 계층**에 흩어져 있었다:

1. **DB 인덱스 부재** — 핵심 쿼리가 풀스캔. `events.symbol` 무인덱스, 검색용
   `kis_security_master`의 한글 부분검색(`%삼성%`)이 트라이그램 인덱스 없이 ILIKE → 매 검색 풀스캔.
2. **외부 API 직렬 호출** — 종목 상세에서 `getFundamentalsSeries`→`getYearEndCloses`가
   `Promise.all` *이후* 순차 await로 블로킹. DART는 연결재무(fsDiv) 판별에 최대 10~20회 **순차**
   호출(`dart.ts:693-708`), TTM 분기 합성도 분기당 2회 순차(`dart.ts:525-527`).
3. **요청 단위 캐시 부재** — `loadSecurityMeta`/`getPortfolio` 등이 한 요청·여러 페이지에서
   `React.cache()` 없이 매번 재쿼리.

해결 전략은 **측정 게이트를 둔 3단계 사다리**: 안전 최적화(1단계)를 먼저 적용하고, 그래도
목표 미달이면 외부응답 캐시(2단계) → 무거운 계산의 구조 개선(3단계)로 escalate한다.
각 단계 전후로 동일 측정을 반복하고, 느린 화면이 목표치에 들면 다음 단계를 멈춘다(과최적화 방지).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 종목 검색이 즉시 뜬다 (Priority: P1)

사용자가 검색창에 "삼성전자", "에코프로" 같은 한글 종목명을 입력하면 결과가 **즉시** 나온다.
현재는 `kis_security_master` 부분검색이 인덱스를 못 타 매 질의가 풀스캔이라 느리다.

**Why this priority**: 검색은 모든 종목 작업의 진입점이고, 부분검색 풀스캔은 데이터가 커질수록
선형으로 악화된다. 트라이그램 인덱스 하나로 가장 확실하고 큰 단일 개선이 난다.

**Independent Test**: "삼성전자" 입력 → 결과 응답시간 측정(P50 < 300ms), 기존 결과 순서·내용 회귀 없음.

**Acceptance Scenarios**:

1. **Given** 검색 모달, **When** "삼성전자" 입력, **Then** 결과가 P50 300ms 이내로 반환되고 삼성전자가 상단에 포함된다.
2. **Given** 데이터 적재량이 늘어난 `kis_security_master`, **When** 부분검색, **Then** `EXPLAIN ANALYZE`에서 트라이그램 GIN 인덱스를 사용한다(풀스캔 아님).
3. **Given** 코드("005930")·영문("Samsung") 질의, **When** 검색, **Then** 기존과 동일하게 동작한다(회귀 없음).

---

### User Story 2 - 종목 상세가 빨리 보인다 (Priority: P2)

종목 상세 overview(가격·이름·기본정보)가 펀더멘털/재무 로딩을 기다리지 않고 먼저 뜬다.
외부 API(DART·Yahoo) 호출이 병렬화되고, 느린 재무 섹션은 Suspense로 뒤이어 스트리밍된다.

**Why this priority**: 상세는 가장 자주 여는 무거운 화면이고, 직렬 await·DART 순차 루프가
체감 지연의 핵심. 병렬화+스트리밍으로 첫 콘텐츠 시점을 크게 당긴다.

**Independent Test**: 보유 종목 상세를 열어 첫 콘텐츠(가격·이름) < 1.5s, 펀더멘털은 후속 스트리밍 확인.

**Acceptance Scenarios**:

1. **Given** 보유 국내·미국 종목, **When** 상세 overview를 연다, **Then** 가격·이름이 1.5s 이내 렌더되고 재무 섹션은 Suspense fallback 후 채워진다.
2. **Given** 한국 종목의 fsDiv 판별, **When** 펀더멘털 로드, **Then** DART 호출이 순차 10~20회가 아니라 1 라운드 병렬로 끝난다(호출 로그로 확인).
3. **Given** 미국 종목 KIS 거래소 폴백, **When** 시세 조회, **Then** NAS/NYS/AMS를 순차가 아닌 병렬(race)로 시도한다.

---

### User Story 3 - 대시보드·회사·활동 화면이 막힘 없이 뜬다 (Priority: P3)

대시보드/회사/활동 화면에서 빠른 부분이 느린 부분(룩스루·계좌그룹·이벤트 로드) 때문에
통째로 막히지 않는다. 요청 단위 중복 쿼리가 메모이제이션으로 1회로 준다.

**Why this priority**: 메인 동선이지만 이미 일부 Suspense·스냅샷 캐시가 있어 1·2순위보다 여유.
중복 `loadSecurityMeta`/`getPortfolio` 제거와 Suspense 분리로 체감을 마저 끌어올린다.

**Independent Test**: 보유 데이터로 `/dashboard`·`/company`·`/activity` 로드, 첫 콘텐츠 < 1.5s, 중복 쿼리 수 감소 확인.

**Acceptance Scenarios**:

1. **Given** 다수 회사·계좌, **When** `/company`를 연다, **Then** 헤더·회사목록이 먼저 뜨고 계좌그룹은 Suspense로 이어 채워진다.
2. **Given** 한 요청 내 여러 컴포넌트가 보유메타를 필요로 함, **When** 페이지 렌더, **Then** `loadSecurityMeta`/`getPortfolio`가 요청당 1회만 실제 쿼리한다(React.cache 메모이즈).
3. **Given** 이벤트가 많은 holding, **When** `/activity`를 연다, **Then** 화면이 이벤트 로드 완료까지 블로킹되지 않는다.

### Edge Cases

- 외부 API(KIS/Yahoo/DART)가 느리거나 무응답: timeout(AbortController 5~8s) 초과 시 빈값/폴백으로 처리, 페이지 무한 블로킹 금지.
- TTL 시세 캐시가 stale(10~30s): 실시간성 허용 범위 내. 영구 DB 저장은 하지 않음(기존 원칙 유지).
- `FINANCE_SOURCE=yahoo|kis` 양쪽: 최적화 후에도 동작·결과 동일(회귀 없음).
- 멀티 인스턴스 배포 시 모듈 메모리 캐시는 인스턴스별로 분리됨(수용 가능).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 `kis_security_master` 한글 부분검색에 트라이그램(GIN) 인덱스를 사용해야 한다(풀스캔 금지).
- **FR-002**: 시스템은 `events.symbol` 필터 쿼리에 인덱스를 사용해야 한다.
- **FR-003**: 종목 상세의 독립적 외부 조회는 직렬 await가 아니라 의존성 그래프에 맞게 병렬 실행해야 한다.
- **FR-004**: DART의 fsDiv 판별·TTM 분기 합성의 순차 루프를 병렬 라운드로 대체해야 한다.
- **FR-005**: `loadSecurityMeta`/`loadSecurityNames`/`getPortfolio`/`getActiveHolding`는 요청 단위로 메모이즈(`React.cache`)되어야 한다.
- **FR-006**: 느린 섹션(펀더멘털·계좌그룹·이벤트)은 Suspense 경계로 분리해 빠른 콘텐츠를 먼저 렌더해야 한다.
- **FR-007**: 모든 최적화는 **동작·표시 결과·저장 데이터를 바꾸지 않아야** 한다(회귀 없음).
- **FR-008**: 임시 측정 로그는 머지 전 제거해야 한다.
- **FR-009** *(2단계, 게이트 통과 시)*: 시세·환율 응답에 10~30s 모듈 메모리 TTL 캐시를 두되, 실시간 시세를 DB에 영구 저장하지 않아야 한다.
- **FR-010** *(2단계)*: 외부 fetch에 timeout+폴백을 적용해야 한다.
- **FR-011** *(3단계, 게이트 통과 시)*: 룩스루 등 무거운 계산은 `calculation_snapshots` 스냅샷 패턴으로 사전계산/캐시되어야 한다.

### Key Entities

- **kis_security_master**: 종목 검색 인덱스 테이블. 트라이그램 인덱스 추가 대상(`name_ko`, 필요 시 `name_en`).
- **events**: 거래·자본 이벤트. `symbol` 인덱스 추가 대상.
- **calculation_snapshots**: 기존 스냅샷 캐시 테이블. 3단계에서 룩스루 등으로 확장.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 종목 검색 응답 P50 < 300ms.
- **SC-002**: 보유종목 대시보드 첫 콘텐츠 < 1.5s.
- **SC-003**: 종목 상세 overview 첫 콘텐츠 < 1.5s(펀더멘털은 후속 스트리밍 허용).
- **SC-004**: DART fsDiv 판별 외부 호출이 순차 10~20회 → 병렬 1 라운드로 감소.
- **SC-005**: 요청당 중복 `loadSecurityMeta`/`getPortfolio` 실제 쿼리 수 = 1.
- **SC-006**: `FINANCE_SOURCE` yahoo/kis 양쪽에서 결과 동일(회귀 0).
- **SC-007**: `npm run build`/타입체크 통과.

## Assumptions

- 측정 우선: 각 단계 전후 동일 측정을 반복하고 목표 달성 시 다음 단계를 멈춘다(과최적화 방지).
- 1단계만으로 목표 달성이 가능하면 2·3단계는 착수하지 않는다.
- 실시간 시세 DB 영구저장 금지 원칙은 유지하며, 짧은 TTL 캐시로 호출 빈도만 억제한다.
- UI/디자인 변경 없음(mockup 기준 불변), 클라이언트 번들 다이어트는 별도 범위.
- Next.js 변형 repo이므로 `React.cache`/Suspense 작성 전 `node_modules/next/dist/docs/` 가이드를 우선 확인한다(AGENTS.md).

## 단계별 실행 요약 (구현 시 참조)

자세한 파일·라인은 `plan.md`(후속 `/speckit.plan`)로 분해. 핵심:

- **1단계(안전)**: ① DB 인덱스(`events.symbol`, `kis_security_master` 트라이그램) ② 직렬 await 병렬화
  (`stocks/[symbol]/page.tsx:183-208`, `dart.ts:525-527`·`693-708`, `prices.ts:109-116`)
  ③ `React.cache` 요청 메모이즈(`securities.ts`/`portfolio.ts`/`holdings.ts`) ④ Suspense 분리
  (`company/page.tsx:73-82`, `activity/page.tsx`, 상세 재무 섹션) ⑤ `select("*")` 컬럼 슬림화(`portfolio.ts:65` 외).
- **2단계(외부응답 캐시)**: 시세/환율 TTL 모듈 캐시(KIS 토큰 패턴 재사용), 외부 fetch timeout+폴백,
  DART TTM/연말종가 캐시 키 확장.
- **3단계(구조)**: 룩스루 DART N+1(`lookThrough.ts:286-293`) 스냅샷화, `buyAgg` 중복 집계
  (`accounts.ts:81`↔`dashboard.ts:101`) 공용 유틸화, `positions` 뷰 머터리얼라이즈드 검토.
