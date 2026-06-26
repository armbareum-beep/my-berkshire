---
description: "Task list for 계좌 카드 UI 개선"
---

# Tasks: 계좌 카드 UI 개선

**Input**: Design documents from `/specs/016-account-card-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 명세에서 자동화 테스트를 요청하지 않음(순수 표시 변경). 테스트 태스크 없음 — 검증은 quickstart.md 수동 절차 + 품질 게이트(tsc/eslint).

**Organization**: 태스크는 user story별로 묶여 각 스토리를 독립적으로 구현·검증·배포할 수 있다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 미완 의존 없음)
- **[Story]**: US1/US2/US3 — spec.md user story 매핑

## Path Conventions

Next.js App Router, 저장소 루트 `src/` 단일 트리.

---

## Phase 1: Setup

**Purpose**: 사전 준비. 신규 의존·DB 없음.

- [X] T001 `016-account-card-ui` 브랜치에서 `npm run dev` 구동 확인, 분류가 다른 계좌 2개 이상(하나는 평가액 큰) 준비 — [quickstart.md](./quickstart.md) 사전 조건

---

## Phase 2: Foundational

**Purpose**: 모든 스토리 공통 차단 작업.

해당 없음 — 세 user story는 서로 다른 파일을 건드리며 독립적이다. US1만 자체 데이터 배선을 포함하고, 그것은 US1 단계 안에서 처리한다.

---

## Phase 3: User Story 1 — 거래 위저드 카드식 계좌 선택 (Priority: P1) 🎯 MVP

**Goal**: 모든 거래 종류의 "어느 계좌인가요?" 단계를 알약식 → 로고+이름+분류 배지 카드(세로 리스트)로 교체. 잘못된 계좌 귀속 방지.

**Independent Test**: 매수와 비-매수(예: 배당)에서 계좌 단계 진입 → 카드식·분류 표시 확인, 선택이 거래에 정확히 귀속되고 이후 단계 정상 진행([quickstart.md](./quickstart.md) US1).

### 데이터 배선

- [X] T002 [US1] `AccountOption` 인터페이스(17–22행)에 `broker: string \| null` 필드 추가 — [src/components/transactions/TransactionFlow.tsx](../../src/components/transactions/TransactionFlow.tsx)
- [X] T003 [P] [US1] accounts select(66행)에 `broker` 컬럼 추가, 매핑(69–74행)에 `broker: a.broker ?? null` 추가 — [src/app/transactions/page.tsx](../../src/app/transactions/page.tsx). **추가**: 동일 패턴이 onboarding(`CreatedAccount`)에도 필요해 [src/app/onboarding/actions.ts](../../src/app/onboarding/actions.ts) select·매핑·타입에도 `broker` 추가(tsc가 검출).

### 공용 컴포넌트

- [X] T004 [P] [US1] 신규 `AccountPicker` 컴포넌트 생성 — props `{ accounts: AccountOption[]; selectedId: string \| null; onSelect: (id: string) => void }`. 세로 리스트 `flex flex-col gap-2`, 각 항목 `<button className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-card ...">` + 선택 시 `ring-2 ring-primary`. 좌측 `a.broker ? <BrokerChip id={a.broker}/> : <Avatar name={a.name} size="lg"/>`, 가운데 `flex min-w-0 flex-1 flex-col`(이름 `font-bold truncate` + `ACCOUNT_TYPE_LABEL[a.accountType]` 배지 `text-sm text-muted-foreground`). import: `BrokerChip`@`@/components/accounts/BrokerSelect`, `Avatar`@`@/components/ui/Avatar`, `ACCOUNT_TYPE_LABEL`@`@/lib/config/tax`, `AccountOption`@`@/components/transactions/TransactionFlow` — 신규 파일 [src/components/transactions/wizard/AccountPicker.tsx](../../src/components/transactions/wizard/AccountPicker.tsx)

### 위저드 교체 (T002·T004 의존)

- [X] T005 [US1] `stage === "account"` 블록(231–246행)의 알약 `<div>`를 `<AccountPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />`로 교체 — [src/components/transactions/wizard/BuyWizard.tsx](../../src/components/transactions/wizard/BuyWizard.tsx)
- [X] T006 [US1] `stepId === "account"` 블록(285–304행)의 알약 `<div>`를 `<AccountPicker ... onSelect={(id) => { setAccountId(id); setPicked(null); setQty(""); }} />`로 교체 — 기존 onClick 부수효과(선택 종목·수량 초기화) 콜백 안에 유지 — [src/components/transactions/wizard/TxnWizard.tsx](../../src/components/transactions/wizard/TxnWizard.tsx)

**Checkpoint**: 매수·비매수 양쪽에서 카드식 계좌 선택 동작 → US1 독립 배포 가능(MVP).

---

## Phase 4: User Story 2 — accounts 페이지 금액 오버플로 수정 (Priority: P2)

**Goal**: accounts 페이지 카드 금액이 카드 안에 한 줄로 보이고, 긴 이름은 줄임표 처리.

**Independent Test**: 평가액 큰 계좌로 accounts 페이지를 모바일 폭에서 열어 금액 비오버플로 확인([quickstart.md](./quickstart.md) US2).

- [X] T007 [P] [US2] 보기 모드(88–116행) flexbox 제약 수정 — 가운데 컨테이너(99행)에 `flex-1`, 이름 span(100행)에 `truncate`, 금액 wrapper(108행)에 `shrink-0 whitespace-nowrap` 추가 — [src/components/accounts/AccountRow.tsx](../../src/components/accounts/AccountRow.tsx)

**Checkpoint**: accounts 페이지 어떤 평가액에서도 금액이 카드 안.

---

## Phase 5: User Story 3 — 홈 보유 계좌 분류 표시 + 오버플로 방지 (Priority: P3)

**Goal**: 홈 보유 계좌에 분류 라벨 추가 + 금액 오버플로 방지. accounts 페이지와 표기 통일.

**Independent Test**: 홈 보유 계좌 섹션에서 분류 라벨 표시·큰 평가액 비오버플로 확인([quickstart.md](./quickstart.md) US3).

- [X] T008 [P] [US3] summary 수정 — 가운데 컨테이너에 `min-w-0 flex-1`, 이름에 `truncate`(멤버칩 구조에 맞춰 `{g.name}`을 `<span truncate>`로 감싸고 칩은 `shrink-0`), 금액 wrapper에 `shrink-0` 추가; 분류줄을 `{ACCOUNT_TYPE_LABEL[g.accountType]} · 자회사 {g.holdings.length}개`로 변경하고 `ACCOUNT_TYPE_LABEL`@`@/lib/config/tax` import 추가 (`g.accountType`은 이미 존재) — [src/components/dashboard/AccountGroups.tsx](../../src/components/dashboard/AccountGroups.tsx). 주: 015(멤버칩) 반영으로 실제 구조가 plan 기준 행번호와 다름.

**Checkpoint**: 홈·accounts·거래 선택 세 화면 분류 표기 일관.

---

## Phase 6: Polish & 품질 게이트

**Purpose**: 검증·회귀 확인.

- [X] T009 변경 파일 `npx tsc --noEmit` 클린 확인 — `AccountOption.broker`/`CreatedAccount.broker` 추가가 모든 사용처(BuyWizard·TxnWizard·transactions/page·onboarding)와 호환. (남은 tsc 오류는 scripts/findKrxPerBld.ts·syncKrxIndexStats.ts 사전 존재 Playwright 이슈로 이 기능과 무관)
- [X] T010 [P] 변경 파일 `npx eslint` 클린 확인 (EXIT=0)
- [ ] T011 [quickstart.md](./quickstart.md) 수동 검증 — US1/US2/US3 화면 확인은 **사용자 앱 구동 필요**(아래 참고)

---

## Dependencies & 실행 순서

- **Phase 1(Setup)** → 이후 전부.
- **Phase 2(Foundational)**: 없음.
- **User Story 간**: US1·US2·US3 서로 **독립**(다른 파일). 우선순위 순(US1 → US2 → US3) 권장이나 병렬·임의 순서 가능.
- **US1 내부**: T002·T003·T004 병렬 가능. T005·T006은 T002(broker 타입)·T004(컴포넌트)에 의존.
- **Phase 6**: 구현 태스크(T002–T008) 완료 후.

## 병렬 실행 예시

- US1 시작 시 동시: T002(타입), T003(페이지 쿼리), T004(AccountPicker 신규) — 세 파일 독립.
- 스토리 병렬: T007(US2, AccountRow)·T008(US3, AccountGroups)은 US1과 무관하게 언제든 [P].

## Implementation Strategy

- **MVP = User Story 1**(P1): 카드식 계좌 선택만으로 가장 큰 가치(데이터 정합) 전달, 단독 배포 가능.
- 이후 US2(오버플로)·US3(홈 분류)를 점진 추가. 각 스토리는 독립 검증·배포 가능.

## 요약

- **총 11 태스크**: Setup 1, Foundational 0, US1 5, US2 1, US3 1, Polish 3.
- **스토리별**: US1=5(T002–T006), US2=1(T007), US3=1(T008).
- **병렬 기회**: T002/T003/T004; T007/T008; T010.
- **MVP 범위**: US1(T001–T006 + 게이트).
