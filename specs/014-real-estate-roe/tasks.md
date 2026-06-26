---
description: "Task list for 부동산 사업부 실투자금 수익률·순자산·LTV"
---

# Tasks: 부동산 사업부 실투자금 수익률·순자산·LTV

**Input**: Design documents from `/specs/014-real-estate-roe/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ui.md](./contracts/ui.md), [quickstart.md](./quickstart.md)

**Tests**: 포함함 — 헌장(계산 변경엔 `*.test.ts` 필수) 및 quickstart 요구.

**Organization**: 사용자 스토리별 단계. US1(실투자금 수익률)이 MVP, US2(순자산·LTV)는 증분.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일·의존 없음 → 병렬 가능
- **[Story]**: US1, US2
- 모든 작업에 정확한 파일 경로 포함

## Path Conventions

Next.js 단일 프로젝트 — 계산 `src/lib/finance/`, 표시 `src/components/networth/`. 신규 DB·디렉터리 없음.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 기존 repo — 신규 설정 불필요. 테스트 컨벤션만 확인.

- [X] T001 기존 테스트 컨벤션 확인 — `src/lib/finance/realAssets.test.ts`·`financing.test.ts`·`liabilities.test.ts`를 읽어 Vitest describe/it 패턴, 픽스처 작성법 파악(신규 코드가 동일 스타일 따르도록).

**Checkpoint**: 테스트 패턴 파악 완료.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 두 스토리 모두 대출잔액 합(`debt`)을 필요로 함. 이 필드가 먼저 있어야 집계가 지표를 만든다.

**⚠️ CRITICAL**: US1·US2 시작 전 완료 필수.

- [X] T002 `src/lib/finance/financing.ts` — `DivisionFinancingCost` 인터페이스에 `debt: number`(담보대출 잔액 합) 추가하고, `divisionFinancingCost()` 반환에 `debt: totalLiabilities(liabilities)` 추가. `totalLiabilities`를 `./liabilities`에서 import(이미 `annualInterest`·`weightedAvgRate` import 중이므로 같은 줄에 추가). 주석: `liabilities`는 이미 `mortgageLiabilities` 필터 결과라 부동산 사업부 담보대출 합.
- [X] T003 [P] `src/lib/finance/financing.test.ts` — `divisionFinancingCost`가 `debt`를 담보대출 잔액 합으로 반환하는 케이스 추가(대출 2건 → 합, 대출 0건 → 0).

**Checkpoint**: `DivisionFinancingCost.debt` 사용 가능 — 스토리 구현 시작 가능.

---

## Phase 3: User Story 1 - 레버리지 반영 실투자금 수익률 보기 (Priority: P1) 🎯 MVP

**Goal**: 부동산 사업부 상세 화면에 기존 자산수익률과 **실투자금 수익률**(gain ÷ 실투자금)을 나란히 표시. 임대 0(거주용·차익형)도 정상 산출.

**Independent Test**: 대출 연결 부동산 1건 등록 → 상세 화면에 자산수익률·실투자금 수익률이 나란히 뜨고 후자가 증폭. 임대 0이어도 "—" 아님.

### Tests for User Story 1 ⚠️ (먼저 작성, FAIL 확인 후 구현)

- [X] T004 [US1] `src/lib/finance/realAssets.test.ts` — `computeRealEstateDivision` 실투자금 지표 케이스 추가:
  - (a) 취득가 10억·대출 7억·평가 11억·이자 0 → `ownCapital=3억`, `ownCapitalReturn≈+0.333`(자산수익률 +0.10보다 큼).
  - (b) 임대수익 0·대출 있음·평가차익만 → `ownCapitalReturn !== null`(평가차익−이자 기반).
  - (c) financing 미주입(대출 0) → `debt=0`, `ownCapital===cost`, `ownCapitalReturn===ret`.
  - (d) 대출 ≥ 취득원가(실투자금 ≤ 0) → `ownCapitalReturn===null`.

### Implementation for User Story 1

- [X] T005 [US1] `src/lib/finance/realAssets.ts` — `RealEstateDivision`에 `debt: number`, `ownCapital: number | null`, `ownCapitalReturn: number | null` 추가. `computeRealEstateDivision()` 반환부에서 `const debt = financing?.debt ?? 0`, `const ownCapital = cost - debt`, `ownCapitalReturn = ownCapital > 0 ? gain / ownCapital : null`. JSDoc로 "실투자금=내 돈, 임대수익 전제 아님" 명시(D5).
- [X] T006 [US1] `src/components/networth/ManualAssetsSection.tsx` — 사업부 헤더([166행 부근](../../src/components/networth/ManualAssetsSection.tsx#L166)) 아래 `d.key === "REAL_ESTATE" && d.totals.debt > 0`일 때 stat strip 추가. 우선 **자산수익률**(`signedPct(d.totals.ret)`)·**실투자금 수익률**(`signedPct(d.totals.ownCapitalReturn)`, null이면 "—")을 나란히. 색 `changeColor`, 톤은 기존 대출 추정이자 줄과 일치. 포맷은 기존 `signedPct` 재사용(import 확인).
- [X] T007 [US1] 게이트 — 변경 파일에 `npx tsc --noEmit`·`npx eslint` 클린, `npx vitest run src/lib/finance/realAssets.test.ts src/lib/finance/financing.test.ts` 통과(T004 케이스 green).

**Checkpoint**: US1 단독 동작 — 실투자금 수익률이 자산수익률과 나란히 표시·증폭. MVP 데모 가능.

---

## Phase 4: User Story 2 - 내 순자산과 레버리지 비율(LTV) 보기 (Priority: P2)

**Goal**: 같은 strip에 **순자산**(평가액−대출)과 **LTV**(대출÷평가액)를 추가.

**Independent Test**: 평가액 11억·대출 7억 → 순자산 4억·LTV≈64%. 평가액 0 → LTV "—". 과레버리지 → 순자산 음수.

### Tests for User Story 2 ⚠️

- [X] T008 [US2] `src/lib/finance/realAssets.test.ts` — `marketValue`·`netEquity`·`ltv` 케이스 추가:
  - (a) 보유 평가 11억·대출 7억 → `marketValue=11억`, `netEquity=4억`, `ltv≈0.636`.
  - (b) 취득가 없는 보유 자산도 `marketValue`에 합산(수익률 스코프 밖이어도).
  - (c) 평가액 0(전부 매도/보유 없음) → `ltv===null`, `netEquity===-debt`.

### Implementation for User Story 2

- [X] T009 [US2] `src/lib/finance/realAssets.ts` — `RealEstateDivision`에 `marketValue: number`, `netEquity: number`, `ltv: number | null` 추가. `computeRealEstateDivision()` 루프에서 `if (c == null) continue` **이전에** `if (!isSold(a)) marketValue += a.currentValue` 누적. 반환부에서 `netEquity = netWorth(marketValue, debt)`, `ltv = marketValue > 0 ? leverageRatio(marketValue, debt) : null`. `netWorth`·`leverageRatio`를 `./liabilities`에서 import(재사용, 신규 작성 금지).
- [X] T010 [US2] `src/components/networth/ManualAssetsSection.tsx` — T006의 strip에 **순자산**(`money(cv(d.totals.netEquity), currency)`)·**LTV**(`pct(d.totals.ltv)`, null이면 "—") 항목 추가. `pct`·`money` import 확인.
- [X] T011 [US2] 게이트 — `npx tsc --noEmit`·`npx eslint` 클린, `npx vitest run src/lib/finance/realAssets.test.ts` 통과(T008 green).

**Checkpoint**: US1+US2 모두 독립 동작 — 4개 지표 strip 완성.

---

## Phase 5: User Story 3 - 물건별 지표를 탭으로 펼쳐 보기 (Priority: P3)

**Goal**: 사업부 합산 strip은 유지, 물건 행을 탭하면 그 물건의 실투자금 수익률·순자산·LTV·연결 대출이 펼쳐짐(점진적 공개).

**Independent Test**: 부동산 2채(한 채만 대출) → 물건 탭 시 물건별 지표·대출 펼침, 재탭 시 접힘. 합산 strip 불변.

### Tests for User Story 3 ⚠️

- [X] T015 [US3] `src/lib/finance/realAssets.test.ts` — `computeAssetMetrics(asset, incomes, linkedLoans)` 케이스: (a) 취득 10억·평가 11억·연결 대출 7억 → `debt=7억`,`gain=1억`,`ownCapital=3억`,`ownCapitalReturn≈1/3`,`netEquity=4억`,`ltv≈0.636`; (b) 연결 대출 0 → `debt=0`,`ownCapitalReturn===ret`; (c) 연결 대출 누적이자가 gain 차감; (d) 대출 ≥ 취득원가 → `ownCapitalReturn=null`.

### Implementation for User Story 3

- [X] T016 [US3] `src/lib/finance/realAssets.ts` — `AssetMetrics` 인터페이스 + `computeAssetMetrics(a, incomes, linkedLoans: LinkedLoan[])` 추가. 물건별: `cost=effectiveCost`, `marketValue=보유?currentValue:0`, `debt=Σ linked.principal`, `interest=Σ linked.cumulative`, `gain=미실현+매도+임대−이자`, `ret/ownCapital/ownCapitalReturn/netEquity/ltv`는 사업부와 동일 공식. `netWorth`·`leverageRatio` 재사용.
- [X] T017 [US3] `src/components/networth/ManualAssetsSection.tsx` — `expanded: string|null` 상태 추가. 물건 행 헤더(이름·평가액·미실현)에 토글(chevron). 펼침 시: 물건별 4지표 strip(`computeAssetMetrics`, `metrics.debt>0`일 때만 레버리지 지표) + 평가 출처 + 연결 대출 목록(🔗·수정·삭제)을 `expanded === a.id` 안으로 이동. 합산 strip·subForm·푸터는 불변.
- [X] T018 [US3] 게이트 — `npx tsc --noEmit`·`npx eslint` 클린, `npx vitest run src/lib/finance/realAssets.test.ts` 통과.

**Checkpoint**: 물건 탭 시 물건별 지표·대출 펼침. 평소 화면 단순 유지.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 회귀·E2E 검증.

- [ ] T012 [P] 수동 E2E([quickstart.md](./quickstart.md)) — 앱 구동(`run` 스킬), 부동산+담보대출 등록 후 strip 4지표 손계산 일치, 임대 0 표시, 대출 삭제 시 strip 사라짐, 대체·사업 사업부 미표시 확인.
- [ ] T013 [P] 회귀 확인 — 홈 `src/components/networth/DivisionCard.tsx`(통합 "실물 사업부" 카드) 표시 불변(자산수익률만), 총자산 누적수익률·주식 XIRR 표시 불변. ₩/$ 토글 시 순자산만 환산·수익률/LTV 불변.
- [X] T014 변경 전체 최종 게이트 — `npx tsc --noEmit` 및 `npx eslint src/lib/finance/financing.ts src/lib/finance/realAssets.ts src/components/networth/ManualAssetsSection.tsx` 클린.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음 — 즉시 시작.
- **Foundational (Phase 2)**: Setup 후. `debt` 필드가 US1·US2를 **블록**.
- **US1 (Phase 3)**: Foundational 후.
- **US2 (Phase 4)**: Foundational 후. `realAssets.ts`·`ManualAssetsSection.tsx`를 US1과 공유하므로 US1 **다음**에 순차(같은 파일 편집).
- **Polish (Phase 5)**: US1·US2 완료 후.

### User Story Dependencies

- **US1 (P1)**: 독립 완결(자산수익률+실투자금 수익률). MVP.
- **US2 (P2)**: 동일 strip·함수를 확장 — US1 위에 증분. 단독 테스트는 가능(지표 추가).

### Within Each Story

- 테스트(T004/T008) 먼저 작성·FAIL 확인 → 구현 → 게이트.
- lib(realAssets) 변경 후 UI(ManualAssetsSection) 변경.

### Parallel Opportunities

- T003은 T002와 다른 관심사지만 같은 모듈군 — T002 완료 후 권장.
- T012·T013은 서로 [P](다른 검증 대상).
- US1·US2는 같은 파일을 편집해 **병렬 불가**(순차).

---

## Implementation Strategy

### MVP First (US1)

1. Phase 1 Setup → Phase 2 Foundational(`debt`) → Phase 3 US1.
2. **STOP & VALIDATE**: 대출 연결 부동산에서 실투자금 수익률이 자산수익률과 나란히·증폭 확인.
3. 데모/배포 가능.

### Incremental Delivery

1. Foundational 완료 → `debt` 준비.
2. US1 추가 → 단독 검증 → 데모(MVP).
3. US2 추가(순자산·LTV) → 단독 검증 → 데모.
4. Polish — 회귀·E2E.

---

## Notes

- [P] = 다른 파일·의존 없음. US1/US2는 `realAssets.ts`·`ManualAssetsSection.tsx` 공유로 순차.
- 신규 헬퍼 금지 — `totalLiabilities`·`netWorth`·`leverageRatio` 재사용(헌장 V).
- 표시 전용 — DB·스키마·마이그레이션·XIRR 변경 없음.
- 각 작업·논리 묶음 후 커밋. 체크포인트에서 스토리 단독 검증.
