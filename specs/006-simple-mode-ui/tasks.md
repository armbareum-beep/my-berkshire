# Tasks: 간편모드 UI 업그레이드 (브랜드 마크 + 행 진입 어포던스)

**Input**: Design documents from `/specs/006-simple-mode-ui/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: 테스트 태스크 없음 — 순수 표현 계층 변경이고 계산 로직 변경이 없어 단위테스트 비대상(헌법 품질게이트 기준). 검증은 tsc/eslint + 실제 구동(`run`/`verify`).

**Organization**: 사용자 스토리별로 그룹화. US1(헤더 워드마크)과 US2(행 화살표)는 서로 다른 파일을 만져 완전히 독립·병렬 가능.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 가능(다른 파일, 의존 없음)
- **[Story]**: US1 / US2

## Path Conventions

- 웹 앱(Next.js App Router) 단일 프론트엔드. 경로는 저장소 루트 기준 `src/...`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 별도 셋업 불필요 — 브랜치 `006-simple-mode-ui` 생성됨, 신규 의존성·설정 없음.

- [X] T001 변경 전 기준선 확인: `npx tsc --noEmit`이 현재 클린한지 한 번 실행해 회귀 판단 기준을 잡는다(코드 변경 없음).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 차단성 선행 작업 없음. 두 스토리 모두 기존 데이터·라우팅·시트(@sheet)를 그대로 쓰므로 공통 기반 작업이 필요 없다.

*(이 기능엔 Foundational 태스크가 없음 — US1/US2를 곧바로 시작 가능)*

---

## Phase 3: User Story 1 - 헤더 브랜드 마크(ENUF 워드마크) (Priority: P1) 🎯 MVP

**Goal**: 대시보드 홈 헤더 좌상단에 ENUF 워드마크(글자, 심볼 없음)를 표시해 앱 정체성을 세운다.

**Independent Test**: `/dashboard`를 열어 좌상단에 ENUF 워드마크가 보이고, 그 아래 회사명·설립일이 하위 위계로 읽히며, 360~480px 폭에서 우측 액션과 겹치지 않는지 확인.

### Implementation for User Story 1

- [X] T002 [US1] `src/app/dashboard/page.tsx` 헤더(약 278-305행)의 좌측 `<div>` 최상단에 ENUF 워드마크 추가: `<span className="text-lg font-extrabold tracking-tight text-foreground">ENUF</span>`. 기존 회사명 Link(`{holding.name} ›`, /company)와 설립일·모드 단락은 워드마크 아래에 그대로 유지해 "브랜드 > 회사정보" 위계가 되도록 정렬.
- [X] T003 [US1] 동일 파일에서 좁은 폭(360px) 대응 확인: 좌측 텍스트 블록과 우측 액션(`flex items-center gap-2`, 검색·로그아웃)이 겹치지 않도록 좌측 블록에 `min-w-0` 필요 여부를 점검하고, 회사명이 길 때 잘림 처리(필요 시 `truncate`) 적용. 헌법 IV 준수: 워드마크는 색면/배경칩/그라데이션 없이 잉크 타이포만(추가 브랜드 색면 금지).

**Checkpoint**: ENUF 워드마크가 단독으로 표시·검증 가능. US2와 무관하게 배포 가능한 MVP.

---

## Phase 4: User Story 2 - 보유종목 행 상세 진입 화살표(›) (Priority: P2)

**Goal**: 보유 행 우측 끝에 `›`를 추가해 시트 진입 어포던스를 명확히 한다. 계좌별·전체 종목 두 렌더 경로 모두 적용.

**Independent Test**: 보유 카드의 각 행 우측에 `›`가 보이고, 평가금액과 겹치지 않으며, 행 탭 시 상세 시트(@sheet)가 스크롤 점프 없이 열리는지 계좌별/전체 모드 양쪽에서 확인.

### Implementation for User Story 2

- [X] T004 [P] [US2] `src/components/dashboard/AccountGroups.tsx` 잎(종목) 행(약 88-118행)에서 값 컬럼을 값+화살표 묶음으로 감싼다: `<span className="ml-auto flex items-center gap-2">` 안에 기존 `flex flex-col items-end` 값 블록 + `<span className="text-muted-foreground">›</span>`. 기존 `ml-auto`는 바깥 묶음으로 이동. 이름 셀(`flex flex-col`)에 `min-w-0` 추가하고 이름 span에 `truncate` 적용(긴 종목명이 화살표 영역 침범 방지). 계좌 summary의 회전 `›`(72-74행)는 건드리지 않는다.
- [X] T005 [P] [US2] `src/components/holdings/HoldingsBrowser.tsx` 전체 종목(flat) 행(약 138-167행)에서 동일 패턴으로 값 컬럼 뒤 `<span className="text-muted-foreground">›</span>` 추가(이름 셀은 이미 `min-w-0`/`truncate` 보유). 추가로 flat Link(141행)에 `scroll={false}`를 더해 계좌별 모드와 시트 진입 동작(스크롤 점프 없음)을 통일.

**Checkpoint**: 양쪽 모드 행에 화살표 표시·시트 진입 일관. US1과 독립적으로 동작.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 타입·린트·시각 회귀 검증.

- [X] T006 변경 3파일 타입·린트 클린: `npx tsc --noEmit` + `npx eslint src/app/dashboard/page.tsx src/components/dashboard/AccountGroups.tsx src/components/holdings/HoldingsBrowser.tsx`.
- [ ] T007 `quickstart.md` 수동 체크리스트 실행(`run`/`verify`): 워드마크 표시·위계, 양쪽 모드 화살표, 행 탭→시트 오픈, 정렬·접이식 회귀 없음, 360px 헤더 겹침 없음, 평가금액 가독성 유지.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup(T001)**: 즉시 시작.
- **Foundational**: 없음 — US1/US2 차단 요소 없음.
- **User Stories**: US1, US2 모두 곧바로 시작 가능. **서로 다른 파일이라 완전 병렬·독립.**
- **Polish(T006-T007)**: US1·US2 완료 후.

### User Story Dependencies

- **US1(P1)**: 독립. `dashboard/page.tsx`만 수정.
- **US2(P2)**: 독립. `AccountGroups.tsx`·`HoldingsBrowser.tsx`만 수정. US1과 파일 교차 없음.

### Within Each User Story

- US1: T002 → T003(같은 파일, 순차).
- US2: T004 ∥ T005(다른 파일, 병렬 가능).

### Parallel Opportunities

- US1 전체와 US2 전체를 동시에 진행 가능(파일 분리).
- US2 내부 T004, T005는 [P] — 병렬 가능.

---

## Parallel Example

```text
# US2의 두 파일 동시 작업:
Task: "AccountGroups.tsx 잎 행에 › 추가 (T004)"
Task: "HoldingsBrowser.tsx flat 행에 › + scroll=false 추가 (T005)"

# 스토리 단위 병렬:
Dev A → US1 (T002, T003)   # dashboard/page.tsx
Dev B → US2 (T004, T005)   # AccountGroups + HoldingsBrowser
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. T001 기준선 확인 → T002~T003(워드마크) → T006 타입·린트 → T007 시각 확인.
2. **STOP & VALIDATE**: 워드마크만으로 데모/배포 가능(사용자가 가장 신경 쓴 정체성).

### Incremental Delivery

1. US1(워드마크) → 검증 → 배포(MVP).
2. US2(행 화살표) → 검증 → 배포.
3. 두 스토리는 서로 깨뜨리지 않음.

---

## Notes

- [P] = 다른 파일·의존 없음.
- 테스트 태스크 없음(표현 계층·계산 불변) — 헌법 품질게이트는 tsc/eslint + 구동 검증으로 충족.
- 헌법 IV(토스급 절제) 핵심: 워드마크는 잉크 타이포(색면 금지), 화살표는 muted 글리프. 추가 브랜드 색면 도입 금지.
- 각 태스크 후 커밋 권장. 체크포인트에서 스토리 독립 검증.
