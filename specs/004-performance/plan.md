# Implementation Plan: 사이트 성능 개선 (체감 속도 단축)

**Branch**: `004-performance` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-performance/spec.md`

## Summary

전수조사로 확인된 3계층 병목(DB 인덱스 부재 · 외부 API 직렬 호출 · 요청 단위 캐시 부재)을
**측정 게이트를 둔 3단계 사다리**로 해소한다. 1단계(동작·결과 불변의 안전 최적화)를 먼저 적용하고,
SC 목표 미달일 때만 2단계(외부응답 TTL 캐시·timeout)·3단계(무거운 계산 사전계산)로 escalate한다.
모든 변경은 렌더·계산 결과 불변(회귀 0)을 보장한다.

기술 접근:
- **DB**: `events.symbol` 일반 인덱스 + `kis_security_master`/`etf_ter_cache` 한글 부분검색용 `pg_trgm` GIN 인덱스. 신규 마이그레이션 1개.
- **직렬→병렬**: `dart.ts`의 TTM(분기 current/prior)·fsDiv 판별 순차 루프와 종목 상세 페이지의 순차 await를 의존성에 맞춰 `Promise.all`/`Promise.any`로.
- **요청 캐시**: `React.cache()`로 `getPortfolio`·`getActiveHolding`·`loadSecurityMeta`/`loadSecurityNames` 요청 단위 메모이즈.
- **스트리밍**: 느린 섹션(상세 재무·company 계좌그룹·activity 이벤트)을 `<Suspense>`로 분리.

## Technical Context

**Language/Version**: TypeScript 5.x, Next.js(App Router, 이 repo 변형 — `node_modules/next/dist/docs/` 우선)
**Primary Dependencies**: Supabase(Postgres + RLS), React 19(`cache`/`Suspense`), Tailwind. 신규 외부 의존 없음.
**Storage**: Supabase Postgres. 신규 스키마 없음 — **인덱스만** 추가(`pg_trgm` 확장). 시세는 DB 영구저장 안 함(2단계는 모듈 메모리 TTL).
**Testing**: 계산 불변 회귀는 기존 `*.test.ts` + `npx tsc --noEmit`/`eslint`. 성능은 임시 타이밍 로그로 before/after 측정.
**Target Platform**: 모바일 단일·라이트 단일 웹앱(Vercel 배포 가정).
**Project Type**: Web application (Next.js single app, `src/`).
**Performance Goals**: 검색 P50 < 300ms · 대시보드/상세 overview 첫 콘텐츠 < 1.5s · DART fsDiv 호출 순차 10~20회 → 병렬 1라운드.
**Constraints**: 동작·표시·저장 데이터 불변(회귀 0). UI/디자인 불변. 실시간 시세 DB 영구저장 금지. 외부 fetch에 timeout+폴백.
**Scale/Scope**: 개인 사용자 단위 포트폴리오. `kis_security_master`는 국내+미국 마스터(수천~수만 행) → 부분검색 인덱스가 핵심.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 스타일 중립** — 해당 없음(점수·보상 미변경). ✅
- **II. 정직한 게이미피케이션** — 해당 없음(수치 의미 미변경). ✅
- **III. 엔진 정확·화면 단순** — 최적화는 **엔진 결과를 바꾸지 않음**(병렬화·캐시·인덱스는 동일 입력→동일 출력). 화면도 불변. ✅
- **IV. 토스급 디자인 절제** — UI/디자인 변경 없음. Suspense fallback은 기존 스켈레톤 톤 재사용. ✅
- **V. 단일 진실원천·데이터 정합** — `events` 원장·정합 로직 미변경. `select("*")`→컬럼 명시는 **읽는 컬럼만 축소**(쓰기·정합 불변). ✅
- **Stack/Workflow 게이트** — 마이그레이션은 `supabase/migrations/`로, 코드보다 먼저 배포(인덱스는 후방호환). 변경 파일 `tsc`/`eslint` 클린. `React.cache`/`Suspense` 작성 전 `node_modules/next/dist/docs/` 확인. ✅

**판정: 위반 없음.** Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/004-performance/
├── plan.md              # 이 파일
├── research.md          # Phase 0 — 병목 근거·기법 결정
├── data-model.md        # Phase 1 — 인덱스/캐시 키 모델(스키마 변경 아님)
├── quickstart.md        # Phase 1 — 측정·검증 절차
├── contracts/
│   └── internal-interfaces.md   # 내부 함수 시그니처(불변) + 마이그레이션 계약
└── checklists/
    └── requirements.md  # specify 단계 산출
```

### Source Code (repository root)

```text
supabase/migrations/
└── 2026XXXX_perf_indexes.sql        # 신규: events.symbol + pg_trgm GIN(kis_security_master, etf_ter_cache)

src/lib/
├── portfolio.ts                      # getPortfolio → React.cache, select 컬럼 슬림화(65行)
├── holdings.ts                       # getActiveHolding → React.cache
├── securities.ts                     # loadSecurityMeta/loadSecurityNames → React.cache
├── accounts.ts                       # events select 컬럼 슬림화(61行)
└── finance/
    ├── dart.ts                       # TTM current/prior 병렬(524-527), fsDiv 판별 병렬(685-714)
    └── prices.ts                     # 미국주 KIS 거래소 폴백 병렬(109-116) / (2단계)시세 TTL 캐시

src/app/
├── stocks/[symbol]/page.tsx          # 직렬 await 병렬화(183-208) + 재무 섹션 Suspense
├── company/page.tsx                  # 계좌그룹 로드 Suspense(73-82)
└── activity/page.tsx                 # 이벤트 로드 Suspense
```

**Structure Decision**: 기존 Next.js 단일 앱 구조(`src/`) 유지. 신규 디렉터리·모듈 없음.
변경은 (1) 마이그레이션 1개 추가, (2) 기존 `lib`/`app` 파일의 국소 수정뿐. 2·3단계는 게이트 통과 시에만.

## 단계별 작업(측정 게이트)

> 각 단계 전후로 quickstart.md의 측정을 반복. SC-001~003 달성 시 다음 단계 **중단**.

### 1단계 — 안전 최적화 (먼저, 동작 불변)
1A. **인덱스 마이그레이션** — `events.symbol`; `create extension pg_trgm`; `kis_security_master.name_ko`(+`name_en`)·`etf_ter_cache.name` GIN trgm.
1B. **직렬→병렬** — `dart.ts:524-527`(current/prior `Promise.all`), `dart.ts:685-714`(fsDiv 후보 연도 병렬 후 첫 성공 채택, **호출 수 증가 trade-off는 research 참조**), `prices.ts:109-116`(거래소 폴백 `Promise.any`), `stocks/[symbol]/page.tsx:183-208`(series 비의존 Promise 상단 묶음으로).
1C. **React.cache** — `getPortfolio`·`getActiveHolding`·`loadSecurityMeta`·`loadSecurityNames` 래핑.
1D. **Suspense** — 상세 재무 섹션·`company/page.tsx:73-82`·`activity/page.tsx`.
1E. **쿼리 슬림화** — `portfolio.ts:65`·`accounts.ts:61` `select("*")`→컬럼 명시.

### 2단계 — 외부응답 캐시 (게이트 통과 시)
- 시세/환율 모듈 메모리 TTL 캐시(10~30s, KIS 토큰 `inflight` 패턴 재사용), 외부 fetch `AbortController` timeout(5~8s)+폴백, DART TTM/연말종가 캐시 키 확장.

### 3단계 — 구조 개선 (최후)
- 룩스루 DART 묶음 `calculation_snapshots` 적재, `buyAgg` 공용 유틸화, `positions` 뷰 머터리얼라이즈드 검토.

## Complexity Tracking

> Constitution Check 위반 없음 — 작성 불필요.
