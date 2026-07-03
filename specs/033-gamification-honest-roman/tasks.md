# Tasks: 게이미피케이션 강화 — 드로다운 인내·연혁 영구화·등급업 축하

**Input**: Design documents from `/specs/033-gamification-honest-roman/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md, design-notes.md(상세 시그니처·알고리즘)

**Tests**: 포함 — 헌장 품질 게이트("계산 변경엔 단위테스트")에 따라 계산이 바뀌는 스토리(US1·US2·US3)에 테스트 태스크를 둔다. 테스트를 먼저 작성해 실패를 확인한 뒤 구현으로 통과시킨다.

**Organization**: 유저 스토리 단위 — 각 스토리는 독립적으로 구현·검증·배포 가능한 증분.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일·미완 태스크 의존 없음)
- 같은 파일을 여러 스토리가 수정한다(celebration.ts: US1·US3 / dashboard·growth page: US1·US3·US4 / milestones.ts: US1·US2) — **스토리 간 병렬 금지, 페이즈 순서대로**.

---

## Phase 1: Setup

- [ ] T001 기준선 게이트 그린 확인 — `npm run typecheck && npm run lint && npm test` (시작 전 실패가 있으면 이 스펙 밖 원인이므로 먼저 보고)

## Phase 2: Foundational

해당 없음 — 기존 인프라(가치 시계열 캐시·celebration 큐·연혁·style-history)를 그대로 재사용하며, 모든 선행물은 각 스토리 내부에 있다.

---

## Phase 3: User Story 1 - 하락장을 버틴 인내를 인정받는다 (Priority: P1) 🎯 MVP

**Goal**: −10% 이상 하락→회복 구간을 매도 없이 통과하면 홈 축하(14일 창 1회) + 연혁 영구 기록. 미회복·매도 구간은 침묵.

**Independent Test**: quickstart.md US1 행 — 합성 시리즈 단위테스트 6케이스 + 해당 이력 계정으로 홈 배너·/timeline 항목 확인.

- [ ] T002 [P] [US1] 합성 시리즈 단위테스트 선작성(실패 확인) — V자 회복·도중 매도·인출 가짜하락·미회복·다중 에피소드·소액 가드 6케이스 in `src/lib/finance/drawdown.test.ts` (data-model.md §1 검증 규칙 기준)
- [ ] T003 [US1] 드로다운 순수 엔진 구현 — 흐름조정 TWR 체인(research.md R1)·러닝 피크·에피소드 판정·버킷 스냅·`passed`(창 양끝 포함 SELL 0건), `computeDrawdownEpisodes(points, events, minBalance=10_000)` in `src/lib/finance/drawdown.ts` — T002 6케이스 전부 통과시킴
- [ ] T004 [US1] 로더 구현 — `loadPortfolioValueSeries`의 캐시 `closes` 재사용, `buildValueSeries` 풀해상도(maxPoints 충분히 크게) 재구성 후 엔진 호출(신규 fetch 0, 저장 0) in `src/lib/drawdownEpisodes.ts`
- [ ] T005 [P] [US1] `drawdownMilestones(episodes)` 헬퍼 추가 — passed만, date=recoveryDate, label="−{bucket}% 하락 구간을 매도 없이 통과" in `src/lib/finance/milestones.ts`
- [ ] T006 [US1] `CelebrationOpts`에 `drawdownPassages` 추가 — key `dd-pass:{recoveryDate}:{bucket}`, 14일 창(기존 ANNIVERSARY_WINDOW_DAYS 재사용), 문구는 행동만("−{bucket}% 구간, 한 주도 팔지 않고 통과했어요"), href `/timeline` in `src/lib/celebration.ts`
- [ ] T007 [US1] 연혁 병합 — 페이지 레벨에서 `data.timeline` + `drawdownMilestones` merge·날짜 정렬 in `src/app/timeline/page.tsx`
- [ ] T008 [US1] 성장 허브 연혁 카드에도 동일 병합 in `src/app/growth/page.tsx`
- [ ] T009 [US1] 홈 축하 배선 — `HomeSignalsStreamed`(Suspense 안)에서 `loadDrawdownEpisodes` 호출 → passed만 `drawdownPassages`로 전달 in `src/app/dashboard/page.tsx` (첫 페인트 비차단 유지, SC-006)
- [ ] T010 [US1] 게이트(typecheck·lint·test) + quickstart US1 수동 검증 3행 수행·기록

**Checkpoint**: US1 단독으로 배포 가능한 MVP.

---

## Phase 4: User Story 2 - 축하가 증발하지 않고 연혁에 쌓인다 (Priority: P2)

**Goal**: 설립 N주년 전부 + 완수된 자본배분 계획이 연혁에 영구 표시.

**Independent Test**: quickstart.md US2 행 — 1년+ 계정 /timeline에 주년, 완수→새 계획 저장 후 완수 항목 표시.

- [ ] T011 [US2] 마이그레이션 작성·적용 — `holdings.archived_plans jsonb not null default '[]'` in `supabase/migrations/<적용시점>_holdings_archived_plans.sql` (Supabase MCP `apply_migration`) 후 `database.types.ts` 재생성(-o 옵션, PS 리다이렉트 금지 — 알려진 gotcha). **코드 변경보다 먼저**(헌장 마이그레이션 순서)
- [ ] T012 [P] [US2] `planCompletionDate(plan, events)` 구현 + 단위테스트(완수/미완수/부분 체결/마지막 leg 날짜) — BUY 날짜순 누적으로 leg별 도달일, 전부 도달 시 최댓값 in `src/lib/plan.ts` + 기존 테스트 관례에 따른 테스트 파일
- [ ] T013 [US2] 계획 아카이브 — `saveRebalancePlan`/`clearRebalancePlan`이 덮어쓰기/삭제 직전 `parsePlan` 성공분만 `archived_plans`에 append(FIFO 20) in `src/app/rebalance/actions.ts` (T011 이후)
- [ ] T014 [US2] `journeyMilestones(events, seed, nameOf, today, archivedPlans)` 확장 — 지난 주년 전부(celebration.ts anniversary 월-일 규칙 재사용) + 완수 계획(`planCompletionDate` ≠ null)만 "자본배분 계획 완수" in `src/lib/finance/milestones.ts`
- [ ] T015 [US2] 호출부 배선 — `journeyMilestones` 호출부(`src/lib/dashboard.ts`)에 `today`·`holding.archived_plans`(parsePlan 방어 파싱) 전달
- [ ] T016 [US2] 게이트 + quickstart US2 수동 검증 2행 수행·기록

**Checkpoint**: US1+US2 독립 동작.

---

## Phase 5: User Story 3 - 규율 등급이 오르면 축하받는다 (Priority: P2)

**Goal**: 등급 상승 시 홈 축하 분기 1회. 첫 기록·기록 없음은 침묵(콜드스타트).

**Independent Test**: quickstart.md US3 행 — /growth 방문(스냅샷) 후 홈 배너 1회, 같은 분기 중복 없음.

- [ ] T017 [P] [US3] `gradeRank(label)` export — 과매매 주의(0) < 성장하는 투자가(1) < 규율 있는 장기투자가(2) < 자본배분의 달인(3) in `src/lib/style.ts`
- [ ] T018 [US3] 스냅샷 확장 — `StyleHistorySnapshot`에 옵셔널 `score`/`gradeLabel`(**VERSION "v1" 유지**), `toStyleHistorySnapshot` 채움, `loadLatestStyleSnapshot(supabase, holdingId, before?)` 신설 + 왕복·v1 하위호환 테스트 in `src/lib/styleHistory.ts` + `src/lib/styleHistory.test.ts`
- [ ] T019 [US3] 성장 허브 방문 시 스냅샷 저장 — `/style`과 동일 `after(() => saveStyleSnapshot(...))` 배선 in `src/app/growth/page.tsx`
- [ ] T020 [US3] `CelebrationOpts`에 `gradeUp: { label }` 추가 — key `grade-up:{quarterLabel}`(분기 1회), 문구 "규율 등급이 올랐어요 — {label}", href `/growth` in `src/lib/celebration.ts`
- [ ] T021 [US3] 홈 등급업 감지 — `HomeSignalsStreamed`에서 `loadLatestStyleSnapshot` 2회(최신·그 이전) 비교, 둘 다 gradeLabel 존재 && rank 상승 시에만 `gradeUp` 전달(computeStyle 재계산 금지 — DB 읽기 2건) in `src/app/dashboard/page.tsx`
- [ ] T022 [US3] 게이트 + quickstart US3 수동 검증·콜드스타트(과거 기록 무등급 → 무신호) 확인

**Checkpoint**: US1~US3 독립 동작.

---

## Phase 6: User Story 4 - 복리 무중단 카운터를 홈에서 매일 본다 (Priority: P3)

**Goal**: 이미 계산된 `data.compoundingStreak`를 마이버크셔에 상시 카드로 노출(로직 무수정 — 보류 영역 불가침).

**Independent Test**: quickstart.md US4 행 — /growth 카드 수치 = /report 상세 수치 일치.

- [ ] T023 [P] [US4] 카드 신규 — "복리 무중단 N개월"(1개월 미만 N일), 최근 투입 시 Flame 아이콘, `/report` 링크(scroll={false}), 빈 상태 중립 카피("첫 자본을 넣으면 복리 시계가 시작돼요" 취지) in `src/components/growth/CompoundingStreakCard.tsx`
- [ ] T024 [US4] 배치 — `CompanyTierCard` 바로 아래, 기존 `data.compoundingStreak` prop 전달(새 계산 0) in `src/app/growth/page.tsx`
- [ ] T025 [US4] 게이트 + /report 수치 일치 확인(SC-005)

---

## Phase 7: User Story 5 - "회장님"으로 호명받는다 (Priority: P4)

**Goal**: 보고서 계열 4지점 카피를 "주주"→"회장님"으로. 로직(buildComment/cfoComment) 무수정.

**Independent Test**: quickstart.md US5 행 — 화면 확인 + 대상 4파일 grep "주주" 0건.

- [ ] T026 [P] [US5] 분기 결산 카피 — h1 아래 회장님 부제 1줄 in `src/app/report/ReportContent.tsx`, 히어로 인사 1줄 in `src/components/report/QuarterReportView.tsx` (design-notes 기능3 표 참조)
- [ ] T027 [P] [US5] 연차보고서 카피 — "주주에게 보내는 숫자"→"회장님께 보고드리는 숫자"·헤더 소절 in `src/components/report/AnnualReportView.tsx`, 잠금 카피 in `src/app/annual-report/page.tsx`
- [ ] T028 [US5] 검증 — 대상 4파일 `grep "주주"` 0건(SC-007) + /report·/annual-report(발행/잠김) 렌더 확인

---

## Phase 8: Polish & Cross-Cutting

- [ ] T029 전체 게이트 — `npm run typecheck && npm run lint && npm test && npm run build` + quickstart.md 수동 검증표 전체 재수행
- [ ] T030 [P] `docs/roadmap-status.md`에 033 완료 반영
- [ ] T031 배포 — 마이그레이션 선적용 확인(quickstart 배포 순서) 후 main 머지·푸시는 **사용자 승인 후** 진행

---

## Dependencies & Execution Order

- **Phase 1 → 3 → 4 → 5 → 6 → 7 → 8 순차** (Phase 2 없음). 공유 파일(celebration.ts·dashboard/page.tsx·growth/page.tsx·milestones.ts) 때문에 스토리 간 병렬 금지.
- US1 내부: T002 → T003 → T004 → {T005∥} → T006 → T007·T008 → T009 → T010. T005는 T003의 타입만 필요.
- US2 내부: T011(마이그레이션 최우선) → {T012∥, T013} → T014 → T015 → T016.
- US3 내부: {T017∥} → T018 → T019 → T020 → T021 → T022.
- US4·US5: 각 페이즈 안에서 [P] 태스크는 병렬 가능.
- 어느 체크포인트에서든 멈추고 해당 스토리만 배포 가능(스토리 독립성).

## Parallel Example: User Story 1

```text
# T003 완료 직후 동시 진행 가능:
Task A: T004 로더 (src/lib/drawdownEpisodes.ts)
Task B: T005 마일스톤 헬퍼 (src/lib/finance/milestones.ts)
```

## Implementation Strategy

- **MVP = Phase 1 + Phase 3(US1)** — 드로다운 인내 단독으로 가치 완결(기함 기능). 여기서 멈추고 배포·체감 확인 권장.
- 이후 증분: US2(연혁 영구화, 마이그레이션 포함) → US3(등급업) → US4·US5(노출·카피, 초저위험).
- 커밋 단위: 스토리당 1커밋(또는 T011 마이그레이션 별도 커밋), 각 커밋 후 게이트.
- 실행 주체: 오케스트레이션 규칙에 따라 스토리 단위로 default-worker에 위임, 엔진(T003) 설계 쟁점 발생 시에만 deep-reasoner 에스컬레이션.
