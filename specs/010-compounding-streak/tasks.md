# Tasks: 복리 무중단 지표 (Compounding Streak)

**Input**: Design documents from `/specs/010-compounding-streak/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 포함됨 — quickstart.md가 Vitest 단위테스트 9종을 명시적으로 요구(순수 계산 함수, 헌장 III 품질 게이트).

**Organization**: User Story별 단위로 독립 구현·테스트 가능하게 그룹화.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 미완 의존 없음)
- **[Story]**: US1/US2/US3 (spec.md 매핑)

## Path Conventions

이 repo: 단일 Next.js 웹앱. 계산은 `src/lib/finance/`, 조립은 `src/lib/`, 표시는 `src/components/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 신규 파일 스캐폴드. 새 의존성·DB 변경 없음(plan.md).

- [x] T001 [P] `src/lib/finance/compoundingStreak.ts` 생성 — data-model.md의 `CompoundingStreak` 타입 정의 + 빈 `computeCompoundingStreak(events, today)` 시그니처(JSDoc 포함)
- [x] T002 [P] `src/lib/finance/compoundingStreak.test.ts` 생성 — Vitest 스캐폴드(`import { describe, it, expect } from "vitest"`), 테스트용 `InvestmentEvent` 픽스처 헬퍼

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 User Story가 의존하는 공통 코어. 완료 전 US1~US3 착수 불가.

- [x] T003 `src/lib/finance/compoundingStreak.ts` — 자본 흐름 추출 구현: `events`에서 DEPOSIT(+)/WITHDRAWAL(−)만 필터·날짜 오름차순 정렬, DIVIDEND/BUY/SELL/EXCHANGE 제외 (data-model.md 입력 표). `EventType`은 `src/lib/finance/valuation.ts`에서 재사용
- [x] T004 `src/lib/finance/compoundingStreak.ts` — 공통 헬퍼: `todayKST()`(`src/lib/date.ts`) 기반 일수 차 계산(음수 클램프), days→`unit`('day'/'month')·`months` 환산, 빈 장부 `isEmpty` 처리

**Checkpoint**: 코어 함수가 입력을 받아 빈/기본 상태를 반환 — 스토리 착수 가능.

---

## Phase 3: User Story 1 - 매일 "복리 무중단 기간"을 본다 (Priority: P1) 🎯 MVP

**Goal**: 소비성 인출 없는 장부에서 히어로에 "복리 무중단 N개월/N일"이 매일 보인다. 현금 비중·시세에 불변.

**Independent Test**: 인출 없는 장부 → 첫 투입일부터 오늘까지 기간이 히어로에 정확 표시. 현금 비중을 올려도 불변(SC-002, SC-004).

- [x] T005 [P] [US1] `compoundingStreak.test.ts` — 무중단 기본(23개월), 첫날(N일), 현금 90%여도 불변, 빈 장부 테스트 (quickstart 1·2·3·7)
- [x] T006 [US1] `src/lib/finance/compoundingStreak.ts` — 끊김 없는 경로 구현: `startDate`=최초 DEPOSIT일, `days`/`months`/`unit` 채움. 시세·`cashWeight` 입력에서 배제(FR-010)
- [x] T007 [US1] `src/lib/dashboard.ts` — `DashboardData` 인터페이스(43-61)에 `compoundingStreak: CompoundingStreak` 추가, `computeDashboard()`에서 `computeCompoundingStreak()` 호출해 채움
- [x] T008 [US1] `src/components/dashboard/cards.tsx` — `HeroValuationCard`(104-219)에 "복리 무중단 N개월/N일" 한 줄 추가, 빈 장부는 중립 빈 상태(임의 시작일 금지, FR-007). 토스 절제(무채색 텍스트)

**Checkpoint**: US1 단독으로 배포 가능한 MVP — 첫날부터 복리 신호 노출.

---

## Phase 4: User Story 2 - 소비성 인출하면 끊기고, 추가로 넣으면 칭찬받는다 (Priority: P2)

**Goal**: 소비성 WITHDRAWAL에 무중단 기간이 끊겨 재시작되고, 최근 추가 투입 시 🔥 보너스 표시.

**Independent Test**: 인출 이벤트 장부 → 인출 시점 기준 재계산. 배당 인출은 무시. 최근 DEPOSIT → 🔥 (SC-005).

- [x] T009 [P] [US2] `compoundingStreak.test.ts` — 소비성 인출 끊김(6개월), 배당 인출 무시, 같은 날 순흐름 음수만 끊김, 매매/계좌이동 불변, 최근 투입 보너스 테스트 (quickstart 4·5·9·8·6)
- [x] T010 [US2] `src/lib/finance/compoundingStreak.ts` — 끊김 로직: `startDate`=마지막 *자본 순유출일*(같은 날 DEPOSIT−WITHDRAWAL<0일 때만), `breaks[]` 수집. 배당·매매 제외 확인
- [x] T011 [US2] `src/lib/finance/compoundingStreak.ts` — `bonusRecentDeposit`(최근 30일 내 DEPOSIT) + `deposits[]` 이력 수집
- [x] T012 [US2] `src/components/dashboard/cards.tsx` — `HeroValuationCard`에 `bonusRecentDeposit` 시 🔥 표시(기존 `reportStreak` 배지 어휘와 일관)

**Checkpoint**: US1+US2 — 끊김 교훈과 적립 보상이 동작.

---

## Phase 5: User Story 3 - 분기 결산에서 복리 무중단 상세를 본다 (Priority: P3)

**Goal**: 분기 결산에 현재 기간·시작일·추가 투입 이력·끊김 이력 표시.

**Independent Test**: 결산 화면에서 시작일·투입/끊김 이력이 사실과 일치.

- [x] T013 [P] [US3] `compoundingStreak.test.ts` — `breaks[]`/`deposits[]` 시간순 정렬·내용 정확성 테스트
- [x] T014 [US3] `src/lib/finance/quarterClose.ts` — 분기 결산 페이로드에 `compoundingStreak` 상세(또는 결산 페이지에서 호출) 연결. 기존 `reportStreak`(110-124)과 동일 데이터 경로로 합류
- [x] T015 [US3] `src/components/report/QuarterReportView.tsx` — `reportStreak` 배지 옆/아래에 복리 무중단 상세 블록(시작일·투입 이력·끊김 이력) 렌더. 화면 단순 유지

**Checkpoint**: 3개 스토리 모두 동작 — 히어로 요약 + 결산 상세.

---

## Phase 6: Polish & Cross-Cutting (CAGR 제거 · 비율 단일화 · 검증)

**Purpose**: FR-009(비율 단일화) 및 품질 게이트. 스토리와 독립.

- [x] T016 [P] `src/components/returns/PeriodReturns.tsx` — 사용자 노출 CAGR 행(~:59) 제거. 한 화면에 백분율 2개 동시 노출 없도록(SC-003)
- [x] T017 [P] `src/app/returns/page.tsx` — `cagr`는 내부 잔존(research 결정), 화면 비노출이라 plumbing 유지. 사용자 노출 제거는 T016에서 완료
- [ ] T018 [P] `src/components/dashboard/cards.tsx` — XIRR 라벨 평이화(FR-009). **보류**: 현재 "연복리/연환산 수익률 (XIRR)"는 이미 비교적 평이. "(XIRR)" 제거 여부는 사용자 결정 대기(핵심 혼동원 CAGR은 제거 완료)
- [x] T019 변경 파일 `npx tsc --noEmit`(내 파일 클린, scripts/ 기존 오류 무관) · `npx eslint`(0) · `npx vitest run`(143 pass) 확인
- [ ] T020 `run`/`verify` 스킬로 quickstart.md 수동 시나리오 검증(히어로·현금 불변·인출 끊김·🔥·CAGR 제거·결산 상세) 및 회귀 확인. **대기**: 실제 앱 구동 단계

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: Setup 후 Foundational.
- **Phase 2 → 모든 스토리**: T003·T004 완료가 US1~US3 착수 전제.
- **User Story 순서**: US1(P1) → US2(P2) → US3(P3). 각 스토리는 Foundational 위에서 독립 슬라이스.
  - US2/US3는 같은 `compoundingStreak.ts`를 확장하므로 US1의 T006 이후 진행 권장(파일 충돌 회피).
- **Phase 6**: T016~T018은 스토리와 무관(병렬 가능). T019·T020은 전체 구현 후 마지막.

### Story Independence

- **US1**: 끊김/보너스 없이도 "무중단 N개월" 표시로 단독 MVP 성립.
- **US2**: US1의 표시 위에 끊김·🔥 규칙 추가.
- **US3**: US1/US2 계산 결과를 결산에 재노출(표시 전용).

## Parallel Opportunities

- Phase 1: T001·T002 병렬.
- 각 스토리 첫 태스크(테스트 T005·T009·T013) [P] — 구현 전 작성 가능(TDD).
- Phase 6: T016·T017·T018 서로 다른 파일이라 병렬.

## Implementation Strategy

1. **MVP = US1**(Phase 1→2→3): 첫날부터 "복리 무중단" 노출. 여기서 멈춰도 가치 전달.
2. **증분**: US2(끊김·보너스) → US3(결산 상세).
3. **마무리**: CAGR 제거(Phase 6)는 독립적이라 언제든, 단 배포 전 T019·T020로 품질·회귀 확인.

**총 20개 태스크** — Setup 2 / Foundational 2 / US1 4 / US2 4 / US3 3 / Polish 5.
