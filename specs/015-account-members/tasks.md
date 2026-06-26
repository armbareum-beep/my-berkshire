---
description: "Task list for 015-account-members"
---

# Tasks: 컴퍼니(CEO별) 레이어 — 가족 계좌를 CEO별로 분리

**Input**: Design documents from `/specs/015-account-members/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: 헌장 품질게이트(계산 변경 시 단위테스트)에 따라 컴퍼니별 수익률 집계에만 단위
테스트를 둔다. 그 외 UI/액션은 수동·quickstart 검증.

**Organization**: User Story별 페이즈. US1만으로도 MVP(계좌를 CEO별로 묶어 보기).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일·선행 의존 없음 → 병렬 가능
- **[Story]**: US1/US2/US3
- 모든 경로는 repo 루트 기준

## Path Conventions

Next.js App Router 단일 웹앱: `src/`, `supabase/migrations/`. plan.md 구조 준수.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 신규 의존 없음. 마이그레이션 파일 골격만 준비.

- [x] T001 `supabase/migrations/<timestamp>_account_members.sql` 파일 생성(기존 `20260...` 네이밍 규칙). 헤더 주석에 목적·롤백 메모(quickstart 롤백 절) 기재.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 스키마·타입·공유 타입 — 모든 US의 선행. **완료 전 US 착수 불가.**

**⚠️ CRITICAL**: 헌장 워크플로우 — 마이그레이션을 그 값을 쓰는 코드보다 먼저 적용.

- [x] T002 T001 파일에 작성: `members` 테이블(id·holding_id FK CASCADE·name·emoji·included default true·sort_order·created_at) + `members_holding_id_idx` + RLS 4종(`accounts` 정책과 동일 패턴, `holding_id in (select id from holdings where user_id = auth.uid())`). data-model.md 표 그대로.
- [x] T003 같은 마이그레이션에 `alter table accounts add column member_id uuid references members(id) on delete set null` + `accounts_member_id_idx`.
- [x] T004 같은 마이그레이션에 백필: holding마다 '본인' 컴퍼니 insert → 그 holding 계좌 `member_id` 일괄 연결(data-model R3 §백필 SQL).
- [x] T005 같은 마이그레이션에 `create or replace function create_default_account()` 교체: holding insert 후 '본인' 컴퍼니 생성 → 그 id로 'main' 계좌 생성(member_id 연결). 기존 트리거 `holdings_create_default_account` 재사용.
- [ ] T006 마이그레이션 적용(로컬 stack 또는 Supabase MCP `apply_migration`) 후 `execute_sql`로 검증: 기존 holding마다 '본인' 1개 + 전 계좌 `member_id` 연결, RLS 동작.
- [x] T007 `src/lib/supabase/database.types.ts` 동기화: `members` Row/Insert/Update + `accounts.Row.member_id: string | null`(MCP `generate_typescript_types` 또는 수동).
- [x] T008 [P] `src/lib/accounts.ts`: accounts select에 `member_id` 추가, `AccountGroup`에 `memberId: string | null` 필드 추가(기존 계산 불변).
- [x] T009 [P] `src/lib/members.ts`(신규): `Member`·`MemberGroup` 인터페이스 정의(data-model 앱 레벨 타입). 함수 본문은 US1에서.

**Checkpoint**: 스키마·타입 준비 완료 — US 착수 가능.

---

## Phase 3: User Story 1 - 계좌를 컴퍼니(CEO)별로 묶어 본다 (Priority: P1) 🎯 MVP

**Goal**: 컴퍼니 생성/배정 후 `지주회사 → 컴퍼니 → 계좌 → 자회사` 4단으로 묶여 보임.

**Independent Test**: 컴퍼니 2개(아빠/엄마) 생성·계좌 배정 → 지배구조도 4단 표시(quickstart V3). 컴퍼니 1개면 기존과 동일(V4, SC-002).

### Implementation for User Story 1

- [x] T010 [US1] `src/lib/members.ts`: `loadMemberGroups` 핵심 구현(그룹핑+평가액). `members` 로드 → `loadAccountGroups` 결과를 `memberId`로 묶어 `MemberGroup{ member, accounts, value }` 산출(`result`는 US2). `sort_order`→생성순 정렬. 새 가격 쿼리 없이 portfolio 데이터 재사용.
- [x] T011 [P] [US1] `src/app/company/actions.ts`: `createMember(name, emoji?)`·`updateMember(id, name, emoji?)`·`deleteMember(id)` 서버 액션(contracts/server-actions.md). 로그인·ownership·빈 이름 검증, 마지막 컴퍼니 삭제 가드, revalidate `/company`·`/accounts`·`/dashboard`·`/networth`.
- [x] T012 [P] [US1] `src/app/accounts/actions.ts`: `createAccount`·`updateAccount`에 `memberId?: string | null` 인자 추가해 insert/update에 `member_id` 반영(하위호환: 생략 시 기존 동작).
- [x] T013 [P] [US1] `src/components/company/MemberManager.tsx`(신규): 컴퍼니 추가 폼(이름·이모지). `AccountManager.tsx` 패턴 차용.
- [x] T014 [US1] `src/components/company/MemberRow.tsx`(신규, 기본형): 컴퍼니명·CEO·아바타(이모지/글자 폴백), 이름·이모지 수정, 삭제 버튼. 수익률·토글은 US2/US3에서 확장. `AccountRow.tsx` 패턴 차용.
- [x] T015 [P] [US1] `src/components/accounts/AccountManager.tsx`·`AccountRow.tsx`: 컴퍼니 선택 드롭다운 추가(컴퍼니 ≥2개일 때만 노출). T012 액션의 `memberId` 전달.
- [x] T016 [US1] `src/components/structure/HoldingStructureTree.tsx`: 입력을 `MemberGroup[]`로 바꿔 컴퍼니 층 삽입 → `지주회사 → 컴퍼니 → 계좌 → 자회사` 4단. **컴퍼니 1개면 컴퍼니 노드 생략**(계좌부터, 기존과 동일). 헤더 문구 "지주회사 → 컴퍼니 → 계좌 → 자회사"로 갱신.
- [x] T017 [US1] `src/components/company/CompanyStructure.tsx`: `loadMemberGroups` 호출해 `MemberGroup[]`를 `HoldingStructureTree`에 전달(기존 `loadAccountGroups` 경로 교체/확장). `src/app/company/page.tsx` 설명 문구도 "지주회사 → 컴퍼니 → 계좌 → 자회사"로.
- [x] T018 [US1] `src/app/company/page.tsx`: 지배구조 위에 컴퍼니 관리 섹션 추가(`MemberManager` + `MemberRow` 목록, `loadMemberGroups` 사용).
- [x] T019 [P] [US1] `src/components/dashboard/AccountGroups.tsx`: 계좌 summary에 컴퍼니 칩 1줄(컴퍼니 1개면 생략). 최소 변경.

**Checkpoint**: 컴퍼니 생성·계좌 배정·4단 트리·계좌별 컴퍼니 표시 동작(MVP). 토글·수익률 없이도 독립 검증 가능.

---

## Phase 4: User Story 2 - 컴퍼니(CEO)별 수익률을 본다 (Priority: P2)

**Goal**: 회사 페이지에 아빠/엄마 등 컴퍼니별 평가액·수익률 개별 표기.

**Independent Test**: 컴퍼니별 보유·거래 입력 후 회사 페이지에 각자 수익률 표시, 보유 없는 컴퍼니는 "보유 없음", Σ평가액=그룹 합(quickstart V5·V6, SC-004).

### Tests for User Story 2

- [x] T020 [P] [US2] `src/lib/members.test.ts`(신규): `loadMemberGroups` 집계 단위테스트 — (a) 전원 포함 시 Σ MemberGroup.value = 그룹 합산, (b) 보유/이벤트 없는 컴퍼니 `result === null`, (c) 컴퍼니별 `computeReturn` 입력 범위가 그 계좌 이벤트로 한정. 기존 `src/lib/finance/*.test.ts` 패턴.

### Implementation for User Story 2

- [x] T021 [US2] `src/lib/members.ts`: `loadMemberGroups`에 컴퍼니별 `result` 추가 — 그 계좌 이벤트만으로 기존 `computeReturn(snapshot, events, prices, today, available)` 호출(스냅샷 `founded_at`·`initialValuation`은 그룹값 통일, research R2). 이벤트/보유 없으면 `null`.
- [x] T022 [US2] `src/components/company/MemberRow.tsx`: 컴퍼니별 평가액 + 수익률(설립 이후) 표시. `result === null`이면 "보유 없음" 중립 표기. **순위·뱃지·점수 없이 병렬 표기**(헌장 I·II — 가족 간 경쟁 랭킹 금지).

**Checkpoint**: US1 + 컴퍼니별 CEO 실적 표기 동작.

---

## Phase 5: User Story 3 - 컴퍼니를 합산에서 빼고 본다 (토글) (Priority: P2)

**Goal**: 회사 페이지 토글로 컴퍼니 제외 시 홈·순자산·연결 수익률이 그 계좌 빼고 재계산.

**Independent Test**: '아이 컴퍼니' 토글 해제 → 합산 지표 재계산, 재포함 시 복원(quickstart V7·V8, SC-003). 전원 포함=기존과 동일(V9, SC-005).

### Implementation for User Story 3

- [x] T023 [US3] `src/app/company/actions.ts`: `setMemberIncluded(id, included)` 서버 액션 — `members.included` 갱신, revalidate `/company`·`/dashboard`·`/networth`·`/allocation`.
- [x] T024 [US3] `src/lib/portfolio.ts`: `getPortfolio` 이벤트 select에 `accounts.member_id` 추가, `included=true` 컴퍼니 id 집합으로 이벤트 필터(`member_id == null`은 포함) 후 `computeReturn`. **계약: 전원 포함 시 기존과 100% 동일 결과**(회귀 0). manual_assets·liabilities는 미적용(FR-011).
- [x] T025 [US3] `src/components/company/MemberRow.tsx`: 포함/제외 토글 스위치 추가(컴퍼니 1개면 숨김), `setMemberIncluded` 호출.
- [x] T026 [P] [US3] `src/app/networth/page.tsx`(또는 `src/components/networth/NetWorthSummary.tsx`): 컴퍼니 제외 시 수기자산·부채는 그대로임을 알리는 "주식 기준" 문구(혼동 방지, Edge Case).

**Checkpoint**: 세 스토리 모두 독립 동작. 토글이 연결 재무 전반에 반영.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T027 품질 게이트: `npx tsc --noEmit`·`npx eslint` 변경 파일 클린.
- [ ] T028 회귀 검증(V9/SC-005): 컴퍼니 1개·전원 포함 상태에서 대시보드·수익률 수치가 기능 도입 전과 동일한지 확인.
- [ ] T029 단순함 QA(SC-002): 컴퍼니 1개일 때 트리·자산·계좌폼에서 컴퍼니 층/드롭다운이 숨겨지는지 화면별 점검.
- [ ] T030 실제 구동(run/verify 스킬): 모바일 480px에서 컴퍼니 트리·CEO 실적·토글 렌더 스크린샷, 디자인 절제(칩·등락색만) 확인. quickstart.md V1~V10 수행.
- [x] T031 헌장 §Additional Constraints "계좌 레이어" MINOR 개정: "지주회사 → 컴퍼니(CEO) → 계좌 → 자회사 4층(컴퍼니 1개면 생략)". 버전 범프·Sync Impact 기록(plan.md Complexity Tracking 조치).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(P1)**: 즉시 시작.
- **Foundational(P2)**: Setup 후. 모든 US 차단. T002→T005는 같은 파일(마이그레이션) 순차, T006(적용)→T007(타입)→{T008, T009 병렬}.
- **US1(P3)**: Foundational 후. MVP.
- **US2(P4)**: US1의 `loadMemberGroups`(T010)·`MemberRow`(T014) 위에 확장.
- **US3(P5)**: Foundational(`included` 컬럼) 후 독립 가능. `MemberRow`(T014)·`company/actions.ts`(T011) 위에 확장.
- **Polish(P6)**: 원하는 US 완료 후.

### User Story Dependencies

- **US1**: 타 스토리 의존 없음(MVP).
- **US2**: T010(loadMemberGroups)·T014(MemberRow) 확장 — US1 선행.
- **US3**: 독립 테스트 가능하나 T011·T014 파일 공유 — US1 후 권장.

### Within Each Story

- 같은 파일 작업은 순차(예: MemberRow는 T014→T022→T025로 누적; company/actions.ts는 T011→T023).
- 모델/타입(Foundational) → 집계(lib) → 액션 → UI 순.

### Parallel Opportunities

- Foundational: T008, T009 병렬(다른 파일).
- US1: T011·T012·T013 병렬, T015·T019 병렬(서로 다른 파일).
- US2: T020(테스트) 병렬 작성.
- US3: T026 병렬.

---

## Parallel Example: User Story 1

```bash
# 액션·신규 컴포넌트 동시 진행(다른 파일):
Task: "company/actions.ts 컴퍼니 CRUD (T011)"
Task: "accounts/actions.ts memberId 인자 (T012)"
Task: "MemberManager.tsx 추가 폼 (T013)"
# 그 후 트리/페이지 결선:
Task: "AccountManager/AccountRow 드롭다운 (T015)"
Task: "AccountGroups 컴퍼니 칩 (T019)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → Phase 2 Foundational(마이그레이션 먼저!) → Phase 3 US1.
2. **STOP & VALIDATE**: 컴퍼니 생성·배정·4단 트리·컴퍼니 1개 단순함(V3·V4).
3. 데모 가능.

### Incremental Delivery

1. Foundational 완료 → 기반 준비.
2. US1 → 독립 검증 → 데모(MVP).
3. US2(컴퍼니별 수익률) → 검증 → 데모.
4. US3(토글) → 검증 → 데모.
5. Polish + 헌장 개정.

---

## Notes

- [P] = 다른 파일·무의존. 같은 파일(members.ts, MemberRow.tsx, company/actions.ts, 마이그레이션)은 순차.
- 헌장 V 정합: 전원 포함 시 Σ컴퍼니 = 그룹 합(T020 테스트로 못박음).
- 헌장 I·II: 컴퍼니별 수익률은 **중립 병렬 표기**, 순위/뱃지/점수 금지(T022).
- 회귀 0: 전원 포함 = 기존 결과 동일(T024 계약, T028 검증).
- 커밋은 태스크/논리 단위로.
