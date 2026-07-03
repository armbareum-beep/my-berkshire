# Tasks: 거래내역 정밀도 복원 (연혁 복원 게이미피케이션)

> 2026-07-03 배포 코드 대조로 체크 정합화(진실원천: docs/roadmap-status.md)

**Input**: Design documents from `specs/001-import-fidelity/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/server-actions.md

**Tests**: 실현손익 계산만 단위테스트 포함(SC-006). 그 외 UI/액션은 quickstart 수동 검증.

**Organization**: 사용자 스토리(P1→P3)별 단계. 각 스토리는 독립 테스트 가능.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 다른 파일·의존 없음 → 병렬 가능
- 같은 파일을 만지는 작업은 [P] 미표기(순차)

---

## Phase 1: Setup
프로젝트는 이미 존재 → 별도 초기화 없음. (Spec Kit·constitution 설정 완료)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: 모든 사용자 스토리 전에 완료. 마이그레이션 순서 엄수(T001→T002).

- [x] T001 `source` CHECK 완화 마이그레이션 작성 `supabase/migrations/<ts>_events_source_snapshot.sql` — `events_source_valid`를 `('manual','auto','snapshot')`로 교체(기존 `20260615150000_events_source.sql` 제약 대체). **T004보다 먼저 배포.**
- [x] T002 [P] `founding_declared` 컬럼 마이그레이션 작성 `supabase/migrations/<ts>_holdings_founding_declared.sql` — `alter table holdings add column founding_declared boolean not null default false`.
- [x] T003 마이그레이션 적용 후 타입 동기화 `src/lib/supabase/database.types.ts` — holdings Row/Insert/Update에 `founding_declared: boolean` 추가(또는 `supabase gen types` 재생성).
- [x] T004 온보딩 합성 이벤트 스냅샷 마킹 `src/app/onboarding/actions.ts` — `rows`의 DEPOSIT+BUY 두 객체에 `source: "snapshot"` 추가(T001 이후).
- [x] T005 `founded_at` 백스톱 + 설립확정 자동해제 `src/app/transactions/actions.ts` — `Ctx.holding`에 `foundedAt`·`foundingDeclared` 노출; `recordEvent`/`recordBuys` insert 성공 직후 `mode==="ledger" && date < foundedAt`면 `founded_at=date`(뒤로만), `founding_declared`면 해제 + note. (T003 의존)

**Checkpoint**: 데이터 계층(마커·컬럼·백스톱) 준비 완료 → 스토리 시작 가능.

---

## Phase 3: User Story 1 - 종목별 기록 복원과 정합 (P1) 🎯 MVP

**Goal**: 종목별 실제 매매 입력 → "입력↔보유" 정합 시 스냅샷을 실제 내역으로 교체(이중계상 0).
**Independent Test**: 스냅샷 50주 종목에 실제 순50주 입력→교체→보유 불변·스냅샷 삭제 확인; 30주면 거부.

- [x] T006 [US1] `reconcilePosition(holdingId, symbol)` 서버 액션 추가 `src/app/import/actions.ts` — auth+ownership, 활성 이벤트 로드, `held`/`realNet` 계산, 보유 `realNet===held`(또는 매도완료 `0===0`)만 통과해 스냅샷 BUY+짝 DEPOSIT 소프트 삭제(현금 중립), 불일치 시 `{ok:false,held,realNet}` 반환, revalidate `/import`·`/dashboard`·`/activity`. (contracts/server-actions.md) — 배포명은 `reconstructPosition`(actions.ts:84), 로직 동치 확인.
- [x] T007 [US1] import 페이지 포지션 계산 `src/app/import/page.tsx` — 활성 이벤트 select에 `source,account_id` 추가; `portfolio.positions`(H)·`realNet`·스냅샷유무로 `positions[]`(symbol,name,held,realNet,tier,reconciled) 구성해 직렬화 전달. (data-model.md 티어 규칙)
- [x] T008 [US1] `PositionFidelity` 컴포넌트 신규 `src/components/import/PositionFidelity.tsx` — 종목 행(티어 뱃지·"입력 N ↔ 보유 M"·✓), T0 행에서 `QuickEntryForm` 재사용으로 그 symbol 입력, 정합 시 "교체" → `reconcilePosition` → `SuccessOverlay`+`router.refresh()`, 불일치 인라인 중립 메시지.
- [x] T009 [US1] `PositionFidelity`를 `YearProgress` 위에 렌더 `src/app/import/page.tsx` — props 연결(positions).

**Checkpoint**: US1 독립 동작 — 정합 교체·중복 방지(이중계상 0).

---

## Phase 4: User Story 2 - 연혁 복원 동기(나이·정밀도·설립 확정) (P2)

**Goal**: 회사 나이↑, 정밀도 미터, 지표 잠금해제, "설립 확정".
**Independent Test**: 5종목 중 2복원→미터 40%; 2019 매수→설립일 후퇴; 설립 확정→100%+오버레이; 더 이른 거래→자동 해제.

- [x] T010 [US2] `declareFounding(holdingId, declared)` 서버 액션 추가 `src/app/import/actions.ts` — `founding_declared` 갱신, `founded_at` 불변, revalidate `/import`·`/dashboard`.
- [x] T011 [US2] import 페이지 동기 수치 계산 `src/app/import/page.tsx` — `companyAgeDays=daysSince(founded_at,todayKST())`, `trust=복원종목/스냅샷종목`(레거시 fallback), `foundingDeclared`, `metricsUnlocked.cumulative`, `preview{status,xirr,cumulativeReturn}`(기존 `portfolio.result`) 추가 전달.
- [x] T012 [US2] `PositionFidelity` 동기 UI `src/components/import/PositionFidelity.tsx` — 나이 헤더, `WeightBar` 정밀도 미터(중립 카피), 잠금 누적/XIRR 프리뷰(`blur-sm`+가림, 가짜숫자 금지, `signedPct`·`/returns` 링크), 설립 확정 CTA→confirm→`declareFounding`→`SuccessOverlay`, 선언됨=봉인+되돌리기.

**Checkpoint**: US1+US2 독립 동작 — 동기 레이어 정직 표시.

---

## Phase 5: User Story 3 - 매도완료(왕복) 선택 입력 → 실현손익 (P3)

**Goal**: 미보유 종목 왕복 입력(선택) → 실현손익 잠금 해제.
**Independent Test**: 미보유 종목 BUY→SELL 동수 입력→실현손익 카드 해제, 값이 `realizedGainKRW`와 일치.

- [x] T013 [P] [US3] 평균원가 실현손익 함수 `src/lib/finance/realized.ts` — `realizedGainKRW(events, symbol)` 순수 함수(contracts 알고리즘).
- [x] T014 [P] [US3] 단위테스트 `src/lib/finance/realized.test.ts` — 매수·분할매도·수수료 케이스로 평균원가 실현손익 검증(SC-006, `xirr.test.ts` 스타일).
- [x] T015 [US3] import 페이지 실현손익 게이트 `src/app/import/page.tsx` — 매도완료(T2) 종목 포함, `metricsUnlocked.realized`·`preview.realizedKrw` 계산·전달.
- [x] T016 [US3] `PositionFidelity` 매도완료 UI `src/components/import/PositionFidelity.tsx` — "더 정밀하게(선택)" 미보유 종목 왕복 입력, 순0이면 `reconcilePosition`(매도완료 분기), 실현손익 카드 잠금/해제(가짜숫자 금지).

**Checkpoint**: 전 스토리 독립 동작.

---

## Phase 6: Polish & Cross-Cutting

- [x] T017 레거시 graceful 처리 확인 `src/app/import/page.tsx` + `src/components/import/PositionFidelity.tsx` — 스냅샷 0건이면 교체 affordance 숨김·중립 카피·연도 카드 유지(크래시 없음).
- [ ] T018 품질 게이트 — `npx tsc --noEmit` + `npx eslint`(변경 파일) + `npx next build` 클린, `realized.test.ts` 통과. — N/A(코드 대조로 확인 불가, 2026-07-03)
- [ ] T019 quickstart 검증 `specs/001-import-fidelity/quickstart.md` 시나리오 1~10 수동 실행(`run`/`verify` 스킬, DB 확인 쿼리 포함). — N/A(코드 대조로 확인 불가, 2026-07-03)

---

## Dependencies & Execution Order
- **Phase 2(T001–T005)**: 모든 스토리 차단. T001→T004, T002→T003→T005 순서.
- **US1(T006–T009)**: Phase 2 후. T006→T008, T007→T009.
- **US2(T010–T012)**: Phase 2 후. US1과 같은 파일(page.tsx, PositionFidelity.tsx) 공유 → US1 뒤 순차 권장.
- **US3(T013–T016)**: T013→T014 병렬 가능. T015/T016은 page.tsx·PositionFidelity.tsx 공유 → US1/US2 뒤.
- **Polish(T017–T019)**: 전 스토리 후.

## Parallel Opportunities
- T002는 T001과 병렬(다른 파일).
- T013·T014(realized.ts/test)는 다른 파일이라 병렬.
- page.tsx·PositionFidelity.tsx는 여러 스토리가 공유 → 동시 편집 금지(순차).

## Implementation Strategy
- **MVP**: Phase 2 → US1(T006–T009)에서 멈춰 정합 교체 검증(이중계상 0). 이게 핵심 가치.
- **증분**: US2(동기) → US3(실현손익) 순서로 독립 추가.
