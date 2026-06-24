---
description: "Task list for 종목 로고 이미지 · 지수 지표 표시 · 환율 상세"
---

# Tasks: 종목 로고 이미지 · 지수 지표 표시 · 환율 상세

**Input**: Design documents from `/specs/009-asset-logos-index-fx-detail/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: 단위테스트는 **순수 함수에 한해** 포함(헌장 품질 게이트 "계산 변경엔 단위테스트"). UI/E2E는 `run`/`verify` 수동 검증.

**Organization**: 세 User Story는 서로 다른 파일군을 건드려 **완전히 독립**적이다. Foundational 차단 작업 없음 — Setup 후 어느 스토리든 바로 시작 가능.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 미완 작업 의존 없음)
- **[Story]**: US1/US2/US3
- 모든 경로는 저장소 루트 기준

## Path Conventions

- 단일 Next.js 앱: 소스 `src/`, 정적자산 `public/`, 라우트 `src/app/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 변경 전 품질 게이트 기준선 확보

- [X] T001 현재 브랜치에서 `npx tsc --noEmit`·`npx eslint` 실행해 변경 전 클린 기준선 확인(기존 경고 목록 기록)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리의 차단 선행 작업

**상태**: 세 스토리가 서로소(disjoint) 파일군을 변경하므로 **공통 차단 작업 없음**. 본 단계 비움 — Setup 완료 후 US1/US2/US3를 우선순위 또는 병렬로 진행.

**Checkpoint**: 기준선 확인 완료 → 어느 User Story든 시작 가능

---

## Phase 3: User Story 1 - 자산마다 알아볼 수 있는 이미지 (Priority: P1) 🎯 MVP

**Goal**: 모든 화면의 종목 아이콘을 4유형(기업/운용사/지수·국가/암호화폐) 이미지로 표시, 미보유는 글자 동그라미 폴백.

**Independent Test**: 보유 목록·검색에서 삼성전자(기업)·KODEX 200(운용사)·코스피(국가)·BTC(코인)가 각 유형 이미지로, 미등록 종목은 폴백으로 보임.

### Tests for User Story 1

- [X] T002 [P] [US1] `src/lib/finance/assetImage.test.ts` 작성: `005930`→company, `069500`(KODEX)→manager, `^KS11`→index(kr flag), `BTC-USD`→crypto(coin), 미등록→`src=null`, 동일입력 동일출력(결정성) — [contracts/asset-image.md](./contracts/asset-image.md)

### Implementation for User Story 1

- [X] T003 [P] [US1] 코인 아이콘 SVG 추가: `public/coins/btc.svg`, `public/coins/eth.svg`(+보유 코인 세트) — 국기 SVG와 동일 로컬 방식
- [X] T004 [US1] `src/lib/finance/assetImage.ts` 신설: `AssetKind`(crypto/index/manager/company) 분류 + 유형별 `src` 결정(기업 favicon 도메인 맵 확장, 운용사 favicon 도메인 맵, 지수→국가코드→`/flags/{cc}.svg`, 크립토→`/coins/{slug}.svg`), 불확실 시 `null`. `ETF_BRANDS`(brandColor)·`PRESET_QUOTES`(quotes)·`currencyMeta.cc` 재사용. 출력 `{ kind, src, source, alt }` — [contracts/asset-image.md](./contracts/asset-image.md), [data-model.md](./data-model.md) §1
- [X] T005 [US1] `src/components/ui/Avatar.tsx` 수정: 기존 `logoUrl()` → `assetImage()` 사용. `src` 있으면 `<img onError=폴백>`, 없으면 `brandLogoLabel` 텍스트 동그라미. props 시그니처(`name`,`symbol`,`size`,`className`) 하위호환 유지 → 8페이지+~10컴포넌트 자동 적용(FR-006)
- [X] T006 [US1] 운용사/기업 favicon 공식 도메인 1차 확인 후 `assetImage.ts` 도메인 맵 확정(KODEX→samsungfund.com 등). **불확실 도메인은 등록하지 않고 폴백 유지**(헌장 II 추측 이미지 금지)
- [X] T007 [US1] 검증: `assetImage.test.ts` 통과 + `npx tsc --noEmit`·`npx eslint` 클린 + quickstart US1(4유형·폴백·일관성) 수동 확인 — [quickstart.md](./quickstart.md)

**Checkpoint**: 모든 화면 로고가 유형별 이미지/폴백으로 표시 — US1 독립 동작·검증 가능 (SC-001, SC-002)

---

## Phase 4: User Story 2 - 지수 상세에서 보이는 지표 채우기 (Priority: P2)

**Goal**: 출처 있는 지표(PER·PBR·배당)는 값으로, Forward PER은 제거, 그 외 결측은 "정보 없음"/"데이터 준비 중"으로 구분.

**Independent Test**: 코스피 상세에서 PER/PBR/배당이 값(캐시 충전 시)으로, Forward PER 셀이 사라지고, 미충전 시 "데이터 준비 중"으로 보임.

### Tests for User Story 2

- [X] T008 [P] [US2] `src/lib/finance/indexMetrics.test.ts` 작성: (한국지수+krx null)→`pending`, (값 존재)→`value`, (미국지수+프록시 null)→`unavailable`; Forward PER 비포함 단언 — [contracts/index-metrics.md](./contracts/index-metrics.md)

### Implementation for User Story 2

- [X] T009 [US2] `src/lib/finance/indexStats.ts` 수정: `IndexSummary.forwardPE` 제거, `fetchQuoteSummary`의 forwardPE 페치/반환 제거(`:109`,`:162`), 한국 지수 KRX 캐시 부재 신호 노출(예: `krxAvailable: boolean`) — [contracts/index-metrics.md](./contracts/index-metrics.md)
- [X] T010 [US2] `src/lib/finance/indexMetrics.ts` 신설: 셀 상태 산출(value|unavailable|pending) — `IndexSummary` + 한국지수 여부 + `krxAvailable` 입력 → `IndexMetricCell[]` — [data-model.md](./data-model.md) §2
- [X] T011 [US2] `src/components/index/IndexValuation.tsx` 수정: **Forward PER `<Cell>` 제거**, 각 셀 `"—"` 대신 status 기반("정보 없음"/"데이터 준비 중"/값) 렌더(FR-008·FR-009·FR-010)
- [X] T012 [US2] `src/app/index/[symbol]/page.tsx` 수정: 한국지수 여부·`krxAvailable`를 `IndexValuation`에 전달(필요 시 `indexMetrics` 사용)
- [~] T013 [US2] 운영 검증: 최초 싱크가 **당일(장중·미발표) 행을 채택해 PER=null** 저장 → 코스피 "정보 없음" 원인. `scripts/syncKrxIndexStats.ts` 수정(PER 있는 최신 행만 채택·직전 영업일 폴백·필드키 헤지·키 덤프) + `indexStats.ts` `krxAvailable`를 값 유무 기준으로. **재실행 필요**: `npm run sync:krx-index`(세션 저장됐으면 재로그인 불필요) → 코스피 PER/PBR/배당 값 표시 확인(SC-003)
- [X] T014 [US2] 검증: `indexMetrics.test.ts` 통과 + tsc/eslint 클린 + quickstart US2(코스피·S&P500) 수동 확인

**Checkpoint**: 지수 지표가 정직하게(값/정보없음/준비중) 채워지고 Forward PER 미노출 — US2 독립 동작 (SC-003, SC-004)

---

## Phase 5: User Story 3 - 환율 상세 페이지 (Priority: P3)

**Goal**: 현금 환율 목록에서 통화 행 → `/fx/[code]` 상세(현재 환율·변동·추이·고저), 종목·지수 상세와 동일 패턴.

**Independent Test**: `/cash?tab=fx`에서 USD 행 탭 → `/fx/USD` 진입, 현재환율·차트 표시, 뒤로가기로 복귀.

### Implementation for User Story 3

- [X] T015 [P] [US3] `src/components/fx/FxDetailContent.tsx` 신설: 헤더(`Flag`+pairLabel+code) → 현재 환율 카드+일간 변동(등락색 시세에만) → `PriceChart`(daily/monthly) → 52주 고저. 데이터: `getFxToKrw([code])` + `getDailyKrwCloses(["{code}KRW=X"], …)`, 변동·고저는 일봉 파생. 차트 실패해도 현재 환율 유지(FR-015) — [contracts/fx-detail.md](./contracts/fx-detail.md), [data-model.md](./data-model.md) §3
- [X] T016 [US3] `src/app/fx/[code]/page.tsx` 신설: `<main> + BottomTabBar + BackButton + FxDetailContent`(/index/[symbol] 동일 크롬, FR-014). 알 수 없는 code(`CURRENCIES`−KRW 외) → `notFound()`
- [X] T017 [US3] `src/app/cash/page.tsx` 수정: 환율 탭 통화 행(`:122-142`)을 `<Link href="/fx/{c.code}">`로 감싸기(KRW 제외, FR-012)
- [X] T018 [P] [US3] (선택) `src/app/@sheet/(.)fx/[code]/page.tsx` 바텀시트 변형: `FxDetailContent` 공유(기존 index/cash @sheet 패턴 정합 시)
- [X] T019 [US3] 검증: tsc/eslint 클린 + quickstart US3(USD 진입·차트·뒤로가기·차트 실패 폴백·레이아웃 일관) 수동 확인 (SC-005, SC-006)

**Checkpoint**: 환율 상세가 기존 상세와 동일 패턴으로 동작 — US3 독립 동작

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T020 [P] 전체 회귀: 아바타 사용처 8페이지+컴포넌트 렌더 정상(빈화면·콘솔에러 0), 지수 상세의 차트·섹터·구성종목·버핏지표 기존대로, 원장·보유 수량 불변 확인 — [quickstart.md](./quickstart.md) 회귀 절
- [X] T021 변경 파일 전체 `npx tsc --noEmit`·`npx eslint` 최종 클린 확인

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(Phase 1)**: 의존 없음
- **Foundational(Phase 2)**: 공통 차단 작업 없음(스토리 독립)
- **User Stories(Phase 3~5)**: Setup 후 시작. US1·US2·US3는 **서로 독립**(파일군 분리) — 순차(P1→P2→P3) 또는 병렬 모두 가능
- **Polish(Phase 6)**: 진행한 스토리 완료 후

### User Story Dependencies

- **US1(P1)**: 독립. 다른 스토리 의존 없음
- **US2(P2)**: 독립(`indexStats`/`IndexValuation`/`indexMetrics`만 변경)
- **US3(P3)**: 독립(`fx/`·`cash` 링크만 변경). 다만 환율 행 아이콘은 US1 적용 시 자연히 개선(필수 의존 아님)

### Within Each User Story

- 단위테스트(있으면) → 구현 → 검증
- US1: T002(test)·T003(assets) 병렬 → T004(resolver) → T005(Avatar) → T006(도메인 확정) → T007(검증)
- US2: T008(test)·T009(stats) → T010(helper) → T011(UI) → T012(page) → T013(캐시 충전) → T014(검증)
- US3: T015(component) → T016(route) → T017(링크) → T018(시트·선택) → T019(검증)

### Parallel Opportunities

- US1 내부: T002, T003 병렬
- 스토리 간: 인력 있으면 US1/US2/US3 동시 진행 가능
- Polish: T020 [P]

---

## Parallel Example: User Story 1

```bash
# US1 시작 시 병렬 실행 가능:
Task: "src/lib/finance/assetImage.test.ts 작성(분류·폴백·결정성)"   # T002
Task: "public/coins/*.svg 코인 아이콘 추가"                          # T003
# 이후 T004(resolver) → T005(Avatar) 순차
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. (Foundational 비움) → 3. Phase 3 US1 완료 → **STOP & VALIDATE**(quickstart US1) → 데모.

### Incremental Delivery

1. Setup → US1(로고, MVP) 검증·데모 → US2(지수 지표) 검증·데모 → US3(환율 상세) 검증·데모.
2. 각 스토리는 이전을 깨지 않고 가치 추가(파일군 분리).

### Parallel Team Strategy

- Setup 후 개발자 A=US1, B=US2, C=US3 동시 진행 → 독립 통합.

---

## Notes

- [P]=다른 파일·미완 의존 없음. [Story]=추적용.
- 헌장: 없는 값 생성 금지(Forward PE 제거·"정보 없음"/"준비 중" 표기), 신규 외부/유료 의존 없음, 원장 read-only, 라이트·모바일 단일.
- 각 작업 또는 논리 그룹 후 커밋. 체크포인트에서 스토리 독립 검증.
- 운용사/기업 favicon 도메인은 **확실한 것만** 등록(불확실=폴백).
