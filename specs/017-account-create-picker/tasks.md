---
description: "Task list for 017-account-create-picker"
---

# Tasks: 토스식 계좌 만들기 — 종류 피커 + CTA 진입

**Input**: Design documents from `/specs/017-account-create-picker/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ui-contracts.md](./contracts/ui-contracts.md)

**Tests**: 본 기능은 표시 전용(계산 변경 없음)으로 TDD 비요청. 정적 검증 1건만 선택(Polish, 생략 가능).

**Organization**: 사용자 스토리(US1=종류 피커, US2=CTA 진입)별로 그룹화. 두 스토리 모두 독립 구현·테스트 가능.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일 · 의존 없음 → 병렬 가능
- 모든 작업에 정확한 파일 경로 명시

## Path Conventions

웹앱(Next.js App Router 변형): 라우트 `src/app/`, 공유 컴포넌트 `src/components/`, 설정 `src/lib/config/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 변경 전 컨벤션 확인. 신규 의존·빌드 변경 없음.

- [X] T001 이 repo의 Next 변형 클라이언트 컴포넌트 컨벤션 확인: `node_modules/next/dist/docs/`에서 `'use client'`/이벤트 핸들러 관련 가이드를 한 번 훑고, 기존 패턴 기준으로 [src/components/accounts/AccountManager.tsx](../../src/components/accounts/AccountManager.tsx)·[src/components/ui/EmojiIcon.tsx](../../src/components/ui/EmojiIcon.tsx)·[src/components/ui/StockRow.tsx](../../src/components/ui/StockRow.tsx)를 재확인(코드 변경 없음).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 두 스토리를 모두 막는 선행 작업.

**판정**: 하드 블로커 없음 — 스키마·액션·DB 변경이 없고, 표시 상수는 US1에만 필요하므로 US1 단계에 둔다. US1·US2는 Phase 1 직후 병렬 착수 가능.

**Checkpoint**: 별도 선행 없이 사용자 스토리 착수 가능.

---

## Phase 3: User Story 1 - 절세 혜택을 보고 계좌 종류를 고른다 (Priority: P1) 🎯 MVP

**Goal**: 계좌 종류 선택을 *설명 없는 알약 토글* → *아이콘 + 이름 + 한 줄 절세 설명* 카드 피커로 교체.

**Independent Test**: 계좌 추가 폼을 열어 5종이 아이콘·이름·절세설명 카드로 보이고, 탭 시 선택 강조+체크가 뜨며, 선택한 종류로 계좌가 생성되는지(quickstart US1).

### Implementation for User Story 1

- [X] T002 [P] [US1] [src/lib/config/tax.ts](../../src/lib/config/tax.ts)에 `ACCOUNT_TYPE_DESCRIPTION: Record<AccountType, string>` 추가. 값은 research R2 표(GENERAL "배당 15.4% 과세 · 자유로운 입출금", ISA "배당 비과세 · 연 2,000만원 납입한도", PENSION "세액공제 13.2% · 연 600만원 한도", IRP "세액공제 · 연금저축 합산 900만원 한도", OVERSEAS "해외주식 거래 · 배당 15.4% 과세"). 같은 파일 `TAX_CONFIG`/`TAX_CREDIT_CONFIG` 수치와 정합(FR-003).
- [X] T003 [P] [US1] [src/lib/config/tax.ts](../../src/lib/config/tax.ts)에 `ACCOUNT_TYPE_EMOJI: Record<AccountType, string>` 추가. 값은 research R3 표(GENERAL 🏦, ISA 🛡️, PENSION 💰, IRP 🏛️, OVERSEAS 🌍). 모두 [EmojiIcon.tsx](../../src/components/ui/EmojiIcon.tsx) MAP에 존재하는 키만 사용(폴백 텍스트 금지).
- [X] T004 [US1] 신규 [src/components/accounts/AccountTypePicker.tsx](../../src/components/accounts/AccountTypePicker.tsx) 작성(클라이언트). props `{ value: AccountType; onChange: (t)=>void; className? }`. `ACCOUNT_TYPES` 순회로 카드 렌더: `<EmojiIcon emoji={ACCOUNT_TYPE_EMOJI[t]} />` + `ACCOUNT_TYPE_LABEL[t]`(굵게) + `ACCOUNT_TYPE_DESCRIPTION[t]`(회색 한 줄). 선택 카드는 강조(브랜드색 1곳)+우측 체크. `role="radio"`/`aria-checked` 시맨틱, 키보드 접근. 레이아웃은 [StockRow.tsx](../../src/components/ui/StockRow.tsx) 구조 차용(직접 재사용 아님 — Avatar/href 전제 회피). 의존: T002, T003.
- [X] T005 [US1] [src/components/accounts/AccountManager.tsx](../../src/components/accounts/AccountManager.tsx)의 알약 토글 블록(현 63–79행 `<div className="mt-2 flex flex-wrap gap-2">…</div>`)을 `<AccountTypePicker value={type} onChange={setType} className="mt-2" />`로 교체. 미사용된 `ACCOUNT_TYPE_LABEL` import 정리. `type`/`setType` 상태·`createAccount(name, type, …)` 호출은 불변(FR-009). 의존: T004.

**Checkpoint**: 폼을 열면 종류 선택이 카드 피커로 동작하고 계좌 생성 결과는 기존과 동일.

---

## Phase 4: User Story 2 - 어카운트 페이지는 목록부터, 만들기는 눌러야 뜬다 (Priority: P2)

**Goal**: 어카운트 페이지 진입 시 계좌 추가 폼을 숨기고 "계좌 만들기" CTA로 펼친다. 완료·닫기 시 목록으로 복귀.

**Independent Test**: `/accounts` 진입 시 폼 비노출 + "계좌 만들기" 버튼만, 클릭 시 폼 등장, 추가/닫기 시 접힘(quickstart US2).

### Implementation for User Story 2

- [X] T006 [US2] [src/components/accounts/AccountManager.tsx](../../src/components/accounts/AccountManager.tsx)에 `onAdded?: () => void` prop 추가. `add()`의 성공 분기에서 기존 동작(상태 초기화 + `router.refresh()`) 후 `onAdded?.()` 호출. prop 없으면 기존처럼 폼 유지(하위호환). ⚠️ T005와 같은 파일 — T005 후 순차 진행.
- [X] T007 [US2] 신규 [src/components/accounts/CreateAccountSection.tsx](../../src/components/accounts/CreateAccountSection.tsx) 작성(클라이언트). props `{ members?: MemberOption[] }`. `open` 상태(기본 false): false면 전체폭 "계좌 만들기" CTA만(FR-005·FR-008), true면 `<AccountManager members={members} onAdded={() => setOpen(false)} />` + 닫기 어포던스(닫기 시 `open=false`, 입력 폐기) 렌더(FR-006·FR-007). 의존: T006.
- [X] T008 [US2] [src/app/accounts/page.tsx](../../src/app/accounts/page.tsx) 153행 `<AccountManager members={members} />`를 `<CreateAccountSection members={members} />`로 교체. import도 교체. 목록·수수료 카드·데이터 조회는 불변. 의존: T007.

**Checkpoint**: US1·US2 모두 독립 동작 — 폼은 CTA 뒤에 숨고, 열면 카드 피커가 보인다.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 게이트·검증.

- [X] T009 [P] (선택) 정적 검증 테스트 `src/lib/config/tax.test.ts`: 모든 `AccountType`이 `ACCOUNT_TYPE_DESCRIPTION`·`ACCOUNT_TYPE_EMOJI` 키를 가지며, 각 이모지가 [EmojiIcon.tsx](../../src/components/ui/EmojiIcon.tsx) MAP에 존재함을 단언. 생략 가능.
- [X] T010 변경 파일 품질 게이트: `npx tsc --noEmit` + `npx eslint`(tax.ts, AccountTypePicker.tsx, CreateAccountSection.tsx, AccountManager.tsx, accounts/page.tsx) 클린.
- [ ] T011 [quickstart.md](./quickstart.md) 수동 검증: US2(목록부터→CTA→폼→복귀) → US1(카드 피커·아이콘·선택·생성) → 회귀(저장값·목록·수수료 카드 불변). `run`/`verify` 스킬로 실제 앱 구동·스크린샷.

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup(Phase 1)**: 즉시 시작.
- **Foundational(Phase 2)**: 하드 블로커 없음.
- **US1(Phase 3)·US2(Phase 4)**: Phase 1 직후 착수. 논리적으로 독립이나 **둘 다 AccountManager.tsx를 수정**(T005=피커 교체, T006=onAdded 추가) → 같은 파일 충돌 회피 위해 T005→T006 순서 권장.
- **Polish(Phase 5)**: 원하는 스토리 완료 후.

### User Story Dependencies
- **US1(P1)**: 독립. tax 상수(T002/T003)→피커(T004)→폼 교체(T005).
- **US2(P2)**: 독립. onAdded(T006)→섹션(T007)→페이지 교체(T008). US1과 파일만 공유(AccountManager).

### Within Each User Story
- 상수/컴포넌트(모델 격) → 통합(폼·페이지) 순.
- T002·T003 병렬, T004는 둘에 의존, T005는 T004에 의존.

### Parallel Opportunities
- **T002 [P] · T003 [P]**: tax.ts 같은 파일이지만 서로 다른 상수 추가 — 충돌 없으면 병렬(주의: 같은 파일이라 순차 편집이 안전. 동시 편집 시 머지 주의).
- **T009 [P]**: 다른 파일, 독립.
- 팀 분담 시: 개발자 A=US1(T002–T005), 개발자 B=US2(T007–T008) 동시 — 단 AccountManager 수정(T005/T006)은 조율.

---

## Parallel Example: User Story 1

```bash
# tax.ts 상수 두 개(서로 다른 export) — 동일 파일이므로 순차 편집 권장:
Task: "ACCOUNT_TYPE_DESCRIPTION 추가 in src/lib/config/tax.ts"   # T002
Task: "ACCOUNT_TYPE_EMOJI 추가 in src/lib/config/tax.ts"          # T003
# 이후 피커 → 폼 교체:
Task: "AccountTypePicker.tsx 작성"                                # T004
Task: "AccountManager 알약 토글 → 피커 교체"                      # T005
```

---

## Implementation Strategy

### MVP First (User Story 1)
1. Phase 1 Setup.
2. US1(T002–T005) 완료 → 폼을 열면 카드 피커 동작.
3. **STOP & VALIDATE**: quickstart US1로 독립 검증.
4. 데모 가능(절세 설명 노출 = 핵심 가치).

### Incremental Delivery
1. Setup → US1(피커, MVP) → 검증/데모.
2. US2(CTA 진입) 추가 → 검증/데모.
3. Polish(게이트·전체 검증).

---

## Notes
- [P] = 다른 파일·무의존. AccountManager.tsx는 US1·US2 공유 → T005→T006 순서 유지.
- 표시 전용: `events`/`accounts` 스키마·`createAccount` 시그니처·계산 불변(원칙 V, FR-009).
- 디자인: 선택 강조는 브랜드색 1곳, 아이콘은 lucide 라인(EmojiIcon) — 원칙 IV 준수.
- 각 작업·논리 그룹 후 커밋. 체크포인트에서 스토리 독립 검증.
