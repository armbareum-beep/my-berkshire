# Tasks: 레버리지 금융비용 수익률 반영

**Input**: Design documents from `/specs/012-leverage-financing-cost/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/finance-functions.md

**Tests**: 포함됨 — 헌장 품질게이트("계산 변경엔 단위테스트 `*.test.ts`")가 순수 계산 함수에 테스트를 요구하므로 엔진 테스트를 명시 태스크로 둔다. UI/서버액션은 수동 검증(quickstart).

**Organization**: 사용자 스토리(P1·P2·P3)별 단계. P3(마진↔주식)는 헌장 V(단일원장) 정합 미결로 **본 기능 구현 범위 밖** — 단계는 두되 전 태스크 DEFERRED 표기.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일·선행 의존 없음 → 병렬 가능
- **[Story]**: US1/US2/US3 (Setup·Foundational·Polish는 라벨 없음)

## Path Conventions

Next.js App Router 웹앱. 소스 `src/`, 마이그레이션 `supabase/migrations/`, 테스트 `src/lib/finance/*.test.ts`(vitest, `npm test`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 신규 계산 모듈 스캐폴드. 011 부동산 사업부 경로 위에 추가.

- [X] T001 [P] `src/lib/finance/financing.ts` 신설 — 타입(`FinancingReconciliation`, `FinancingInput`, `DivisionFinancingCost`)과 순수 헬퍼 `monthsBetween(from, to)`(완전월+잔여일/월일수, `to<=from`→0, UTC 달력) 스텁 정의. data-model.md §3.2 시그니처 준수.

**Checkpoint**: 공유 타입·날짜 헬퍼 준비 — 엔진 구현 가능.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: US1·US2가 공통으로 쓰는 순수 계산 엔진. UI/DB 없이 단위테스트로 완결.

**⚠️ CRITICAL**: 이 단계 완료 전 어떤 스토리도 시작 불가.

- [X] T002 [P] `src/lib/finance/liabilities.ts` — `mortgageLiabilities(items)`(kind==='MORTGAGE' 필터)·`weightedAvgRate(items)`(Σ잔액×이율/Σ잔액, 총잔액 0→null) 추가. `annualInterest` 주석을 "실현 P&L 아님, 파생 추정 발생기·표시용(월=÷12)"로 갱신.
- [X] T003 `src/lib/finance/financing.ts` — `divisionFinancingCost(input)` 구현(의존: T001, T002). 기점=`max(대출별 startedAt ?? accrualStartFallback, 최신 interest_actual.date)`, `estimatedInterest=Σ principal×rate×monthsBetween(기점,asOf)/12`, `confirmedInterest=Σ interest_actual.amount`, `totalInterest`·`capitalAdded`·`weightedAvgRate`·`monthlyEstimate` 산출. data-model.md §3.2 / contracts §A.
- [X] T004 `src/lib/finance/realAssets.ts` — `computeRealEstateDivision(assets, incomes, financing?)`·`computeDivisions(...)`에 옵셔널 `financing:{totalInterest,capitalAdded}` 추가. 주입 시 `realized -= totalInterest`, `cost += capitalAdded` 후 `gain`·`ret` 재계산. **미주입 시 011과 비트 동일**(불변식 VI-1). REAL_ESTATE 사업부에만 financing 매핑.
- [X] T005 [P] `src/lib/finance/financing.test.ts` 신설 — `monthsBetween` 경계, 1억@3% 1개월≈25만, 가중평균 1억@3%+5천@4%≈3.33%·월≈41,667, 기점=startedAt, `asOf<기점`→0, interest_actual 보정 후 보정일 이후만 추정, capital은 추정 불변. (contracts §D)
- [X] T006 [P] `src/lib/finance/liabilities.test.ts` 신설 — `mortgageLiabilities` 필터, `weightedAvgRate`(단일=그 이율, 이율0 제외, 총잔액0→null).
- [X] T007 [P] `src/lib/finance/realAssets.test.ts` 확장 — financing 미주입=기존값 동일(회귀), 이자 차감 후 realized·ret, capital→cost↑·realized 불변, 공실(임대0+이자)→realized 음수.

**Checkpoint**: `npm test -- financing liabilities realAssets` 그린. 엔진 검증 완료 — 스토리 착수 가능.

---

## Phase 3: User Story 1 - 임대료에서 대출 이자가 자동 차감 (Priority: P1) 🎯 MVP

**Goal**: 담보대출이 있으면 매달 수기 입력 없이 추정 이자가 부동산 사업부 임대료에서 차감되어 순수익이 net으로 표시된다.

**Independent Test**: 부동산(취득가 有)+`MORTGAGE` 대출 1억@3% 등록 → 사업부 카드에 추정이자(배지)·가중평균율 표시, 순수익이 이자만큼 깎임. 대출 삭제 시 011과 동일 복귀. (보정 없이 동작 — reconciliations=[].)

### Implementation for User Story 1

- [X] T008 [US1] `src/lib/finance/realAssets.ts`(또는 신규 `src/lib/finance/divisions.ts`)에 서버 조립 헬퍼 추가 — `(assets, incomes, liabilities, reconciliations, today)` → 부동산 사업부에 `divisionFinancingCost`(mortgage 대출, reconciliations) 주입한 `DivisionView[]`/집계 반환. 단일 진입점으로 호출부 중복 방지.
- [X] T009 [US1] `src/app/real-estate/page.tsx` — `loadLiabilities` 추가 호출, T008 헬퍼로 financing 주입한 사업부 집계 사용(reconciliations는 이 단계에선 빈 배열). 
- [X] T010 [US1] (실 구현 위치: `src/components/networth/ManualAssetsSection.tsx` — 디비전 렌더가 여기. 011 가 RealEstateDivisionCard 대신 ManualAssetsSection 으로 통합) `ManualAssetsSection` — 순수익을 **이자 차감 후 net**으로 표기, "추정 이자" 라인에 배지(앰버/회색 보조 톤, 헌장 IV), 가중평균율·월 추정 보조 표시. 짝짓는 대출 0이면 이자 UI 미노출.
- [X] T011 [P] [US1] 그 외 사업부 집계 호출부에 동일 헬퍼 적용 (dashboard·networth 완료. growth·report 는 사업부 수익률 미표시라 비대상) — `src/app/dashboard/page.tsx`·`src/app/networth/page.tsx`·`src/app/growth/page.tsx`·`src/app/report/ReportContent.tsx`에서 `computeDivisions`/`computeRealEstateDivision` 호출을 T008 헬퍼로 교체해 전 화면 net 일관. (각 파일 독립 → 병렬)

**Checkpoint**: 담보대출 등록만으로 부동산 수익률이 이자 차감 net으로 전 화면 일관 표시. MVP 완료·독립 검증 가능.

---

## Phase 4: User Story 2 - 추정 오차를 실제 잔액에 보정 (Priority: P2)

**Goal**: 사용자가 원할 때 실제 납부액(비용) 또는 자본 투입을 보정 한 줄로 기록해 추정을 진실에 스냅한다.

**Independent Test**: 추정 누계가 있는 상태에서 "오차 보정(비용)" 입력 → 차이가 보정 1줄로 남고 보정일 이후만 추정 재개. "자본 투입" 입력 → 분모만 증가·수익 불변.

### Implementation for User Story 2

- [X] T012 [US2] `supabase/migrations/20260626020000_financing_reconciliation.sql` 신설 — `financing_reconciliation`(holding_id, division default 'REAL_ESTATE', date, kind check('interest_actual','capital'), amount>=0, note, created_at, deleted_at) + `(holding_id,division,date)` 인덱스 + RLS 4정책(011 `manual_asset_income` 동형). **코드보다 먼저 배포**(헌장: 제약 선배포).
- [X] T013 [US2] `src/lib/supabase/database.types.ts` — 신규 테이블 타입 동기화/재생성.
- [X] T014 [P] [US2] `src/lib/financingReconciliation.ts` 신설 — `loadFinancingReconciliations(supabase, holdingId)`(소프트삭제 제외, date 오름차순) → `FinancingReconciliation[]`. data-model.md §2.
- [X] T015 [US2] `src/app/real-estate/actions.ts` — `addFinancingReconciliation`(ownership·amount>=0·date<=today·kind 화이트리스트, insert, revalidate)·`deleteFinancingReconciliation`(소프트삭제). contracts §B. 기본 kind='interest_actual'.
- [X] T016 [US2] `src/components/networth/FinancingReconcileForm.tsx` 신설 — 금액 + kind 토글("내 돈 추가(자본)"/"추정 오차(비용)", 기본=비용), 미래일 차단. RealEstateDivisionCard에서 진입.
- [X] T017 [US2] `src/app/real-estate/page.tsx`(+ T011 호출부) — 빈 배열 대신 `loadFinancingReconciliations` 결과를 T008 헬퍼에 전달. 보정 목록 표시·삭제 연결.
- [X] T018 [P] [US2] `src/lib/finance/financing.test.ts` 보강 — 다중 보정 체크포인트 연쇄(확정 구간 이중계상 0, VI-4), capital+interest_actual 혼재.

**Checkpoint**: US1+US2 독립 동작. 추정이 실제값에 스냅되고 자본/비용 구분이 수익률에 정확히 반영.

---

## Phase 5: User Story 3 - 마진 이자 ↔ 주식 차감 (Priority: P3) — ⛔ DEFERRED

**상태**: 본 기능에서 **구현하지 않음**. research.md R6 — 주식 수익률은 `events` 기반 XIRR이고 마진 이자를 현금유출로 넣으려면 합성 이벤트가 필요 → 헌장 V(단일원장·이중계상 금지)와 충돌 위험. 정합 방식 결정 후 별도 기능으로.

- [ ] T019 [US3] ⛔ DEFERRED — 마진 이자의 주식 수익 반영 경로(WITHDRAWAL/fee 이벤트 vs 표시 전용 드래그)를 헌장 V 정합 관점에서 결정하는 후속 spec 발의. **이번 구현 금지.**

**Checkpoint**: (해당 없음 — 후속 기능.)

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T020 [P] `.specify/scripts/bash/update-agent-context.sh claude` 실행 — CLAUDE.md Recent Changes 갱신. **보류**: Bash 안전성 분류기 일시 장애로 미실행. 복구 후 1회 실행.
- [X] T021 변경 파일 `npx tsc --noEmit`(src/ 에러 0)·`npx eslint`(클린) 통과. 전체 테스트 186 그린.
- [ ] T022 quickstart.md §3~4 **수동 검증 필요**(앱 구동·화면). 정적 보장: 이 기능은 events 미기록(보정은 financing_reconciliation 전용, 계산은 순수함수) → 주식 XIRR 불변(SC-005/VI-3), 회귀 테스트 통과. — `/run` 또는 `/verify`로 화면 확인 + **주식 XIRR 전후 불변(SC-005)**·`events`에 이자/보정 행 미생성(VI-3) 회귀 확인.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(P1)**: 즉시 시작.
- **Foundational(P2)**: Setup 완료 후. **모든 스토리 차단.** (T003←T001,T002 / T004 독립 / 테스트 T005~T007는 대상 함수 구현 후)
- **US1(P3)**: Foundational 완료 후. MVP.
- **US2(P4)**: Foundational 완료 후 시작 가능하나, 화면 통합(T017)은 US1 헬퍼(T008)·페이지(T009) 의존. 엔진은 이미 reconciliations 처리(T003).
- **US3(P5)**: DEFERRED — 미실행.
- **Polish(P6)**: 원하는 스토리 완료 후.

### Within Stories

- 엔진 함수(T003,T004) → 테스트(T005~T007) → 화면 조립(T008~T011).
- US2: 마이그레이션(T012) → 타입(T013) → 로더(T014) → 액션(T015) → 폼(T016) → 통합(T017).

### Parallel Opportunities

- Setup T001 단독.
- Foundational: T002 [P]와 (T005,T006,T007 [P] 테스트)는 각 대상 구현 직후 병렬. T002·T004 서로 독립.
- US1: T011의 호출부 4파일 [P] 병렬.
- US2: T014 [P], T018 [P].

---

## Parallel Example: Foundational 테스트

```bash
# 대상 함수 구현(T002~T004) 후, 테스트 3종 병렬 작성:
Task: "financing.test.ts — monthsBetween·divisionFinancingCost (src/lib/finance/financing.test.ts)"
Task: "liabilities.test.ts — weightedAvgRate·mortgage 필터 (src/lib/finance/liabilities.test.ts)"
Task: "realAssets.test.ts 확장 — 회귀·이자차감·capital·공실 (src/lib/finance/realAssets.test.ts)"
```

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → 2. Phase 2 Foundational(엔진+테스트 그린) → 3. Phase 3 US1 → **검증**: 담보대출 등록만으로 부동산 net 수익률 표시. 데모/배포 가능.

### Incremental Delivery

1. Setup+Foundational → 엔진 준비.
2. US1 → 자동 이자 차감(MVP).
3. US2 → 실제값 보정 밸브.
4. US3 → 후속 기능으로 분리(DEFERRED).

### 핵심 회귀 가드

- 대출 0 / financing 미주입 → 011과 동일(VI-1).
- 부동산 이자·보정 `events` 미접촉 → 주식 XIRR 불변(VI-3, SC-005).

---

## Notes

- [P]=다른 파일·무의존. 같은 파일(예: financing.ts T001/T003, realAssets.ts T004/T007) 동시 편집 금지.
- 마이그레이션(T012)은 그 값을 쓰는 코드(T013~)보다 먼저 배포.
- 각 태스크 또는 논리 묶음 후 커밋. 체크포인트에서 스토리 독립 검증.
- US3는 절대 이번 구현에 포함하지 말 것(헌장 V 정합 미결).
