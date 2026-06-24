# Tasks: 단일 가족 장부 전환 + 성장 허브

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)
**Tests**: `companyTier`에만 단위테스트(계산 로직). 나머지는 tsc/eslint + 수동 검증.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 Spec Kit 007 브랜치 + `specs/007-family-ledger-growth/` 생성 (완료)
- [x] T002 spec.md / plan.md / tasks.md 작성 (완료)

---

## Phase 2: Foundational (헌법 개정 — 선행)

- [ ] T003 `.specify/memory/constitution.md` 개정: "Additional Constraints" 모드 정의를 `ledger` 단일로, 21행 설명에서 챌린지/라이브 제거. Sync Impact + 버전 1.0.0→1.1.0(MINOR). (FR-012)

---

## Phase 3: User Story 2 — 챌린지/랭킹 제거 (P1) 🎯

**Goal**: 조작 가능한 경쟁 랭킹 제거. **Independent Test**: `/leaderboard` 부재, 탭에 챌린지 없음, `/returns` 벤치마크 정상.

- [ ] T004 [US2] `src/app/leaderboard/` 디렉터리 삭제
- [ ] T005 [P] [US2] `src/components/returns/PercentileCard.tsx` 삭제
- [ ] T006 [P] [US2] `src/lib/perf/snapshot.ts` 삭제
- [ ] T007 [US2] `src/app/returns/page.tsx` — alpha 계산 + `upsertPerfSnapshot(...)` 호출 제거(86-107행). MarketSection/벤치마크는 유지. import 정리.
- [ ] T008 [US2] 잔여 참조 확인(`PercentileCard`·`upsertPerfSnapshot`·`fetchAlphaPercentile`·`/leaderboard` grep 0건)

**Checkpoint**: 랭킹 표면 제거 완료(탭 교체는 US1에서).

---

## Phase 4: User Story 1 — 성장 허브 + 탭 교체 + 홈 카드 이동 (P1) 🎯 MVP

**Goal**: 성장 탭에서 등급·규율·리포트·마일스톤. **Independent Test**: `/growth` 네 카드 실데이터, 등급이 평가액 아닌 납입 원금에 반응.

- [ ] T009 [US1] `src/lib/finance/companyTier.ts` 신규 — `companyTier(investedKrw)` 순수함수(구간 상수, 등급/진행바). 평가액 아님.
- [ ] T010 [P] [US1] `src/lib/finance/companyTier.test.ts` — 구간 경계·진행바·최하/최상 등급 테스트
- [ ] T011 [US1] `src/components/dashboard/BottomTabBar.tsx` — 챌린지(Trophy,/leaderboard) → 성장(Sprout,/growth)
- [ ] T012 [US1] `src/app/growth/page.tsx` 신규 — 서버컴포넌트(dashboard 패턴 미러): ① 기업 등급 카드 ② 규율 점수(StyleCard+computeStyle) ③ 분기/연차 리포트·🔥스트릭 ④ 마일스톤 타임라인(journeyMilestones). BottomTabBar 포함.
- [ ] T013 [US1] (필요 시) `src/components/growth/*` — 기업 등급 카드 컴포넌트 분리. StyleCard·ReportLink 로직 재사용/이전.
- [ ] T014 [US1] `src/app/dashboard/page.tsx` — `CARD_ORDER`에서 `"style"`·`"report"` 제거, `StyleStreamed`·`ReportLinkStreamed`를 성장 페이지로 이전. 홈은 계기판/자산만.

**Checkpoint**: 성장 허브 동작, 홈 가벼워짐, 탭 4개.

---

## Phase 5: User Story 3 — mode를 ledger 단일로 (P2)

**Goal**: 모드 선택 제거, 모든 holding ledger. **Independent Test**: 온보딩 모드 단계 0, mode='ledger', 과거일 매수 가능.

- [ ] T015 [US3] `src/app/onboarding/OnboardingRail.tsx` — J0(모드 선택)·`ModeCard`·`mode` 상태·`type Step`의 "J0" 제거. J1부터 시작.
- [ ] T016 [US3] `src/app/onboarding/actions.ts` — `FoundInput.mode` 제거, `foundCompany`에서 `mode:"ledger"` 하드코딩, challenge 분기(63·76·93·112) 정리.
- [ ] T017 [P] [US3] `src/app/dashboard/page.tsx:292,406` — 모드 라벨/조건 제거(항상 장부). `src/app/company/page.tsx:42,97` 모드 라벨 제거.

**Checkpoint**: 신규 holding 항상 ledger.

---

## Phase 6: User Story 4 — 단일 가족 장부 (다중 회사 제거) (P2)

**Goal**: 회사 추가/전환/삭제 제거, 계좌 레이어 유지. **Independent Test**: `/company` 목록/전환/삭제/새회사 없음, 계좌 추가 정상.

- [ ] T018 [US4] `src/app/company/actions.ts` — `switchCompany`·`deleteCompany` 제거
- [ ] T019 [P] [US4] `src/components/company/DeleteCompanyButton.tsx`·`CompanyStructures.tsx` 삭제
- [ ] T020 [US4] `src/app/company/page.tsx` — 목록·전환·삭제·"새 회사 설립"·holdings 목록 쿼리 제거. 회사명 수정 + 단일 `HoldingStructureTree`만 유지.
- [ ] T021 [US4] `src/app/onboarding/page.tsx` — `additionalCompany`/`?new=1` 추가-회사 경로 제거. holding 있으면 `/dashboard`.

**Checkpoint**: holding 1개 고정, 계좌 관리 정상.

---

## Phase 7: 마이그레이션 + 검증

- [ ] T022 `supabase/migrations/<ts>_remove_challenge.sql` — `update holdings set mode='ledger' where mode<>'ledger';` + 알파/XIRR RPC 6개 drop + `drop table user_perf_snapshots`. (enum/컬럼 유지)
- [ ] T023 마이그레이션 적용(prod) + REST/SQL로 mode·테이블·RPC 부재 확인 (SC-007)
- [ ] T024 `npx tsc --noEmit`·`npx eslint` 변경 파일 클린 (SC-006)
- [ ] T025 수동 검증: 온보딩(모드 없음)·탭 4개·성장 허브 네 카드·등급 납입 기준·회사페이지 축소·거래 회귀(과거일·import). `run`/`verify` 스킬.

---

## Dependencies

- T003(헌법) 선행 권장 → 이후 워크스트림 병렬 가능.
- US2(랭킹 제거)와 US1(탭/성장)은 BottomTabBar에서 만나므로 US2 → US1 순.
- US3·US4는 독립. T022 마이그레이션은 코드 제거(US2·US3) 이후.
- 마이그레이션 순서(헌법): 제약(mode) 변경은 그 값을 쓰는 코드 정리와 함께/이후 배포.
