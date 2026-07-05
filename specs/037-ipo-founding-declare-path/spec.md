# Feature Specification: 설립 확정을 상장(IPO)에 합치기 — 상장 버튼 영구 비활성 경로 복구

**Feature Branch**: `claude/ipo-button-founding-confirmation-r06fma`
**Created**: 2026-07-05
**Status**: Implemented
**Input**: User description: "시장에 상장하기 버튼이 비활성화 되어있어. 그리고 설립확정은 왜 있어? 어차피 모두 설립한 사람만 대시보드 들어올 수 있는데" → 논의 후 "확정 버튼을 없애고 상장 버튼에 합쳐줘"

## 개요

036에서 랭킹 참가를 상장(IPO) 옵트인으로 전환하며 심사 요건(설립 확정 + 거래 기록)을 두었는데, 두 가지 문제가 있었다:

1. **경로 단절(버그)** — "설립 확정"을 수행할 경로가 사실상 막혀 있었다. `IpoCard`의 "하러 가기" 링크는 확정 UI가 없는 `/company`로 가는 죽은 링크였고, 유일한 확정 토글은 `/import`의 `PositionFidelity`에만 있는데 ledger 모드가 아니면 접근 불가, 복원 대상(positions)이 없으면 렌더링되지 않았다. → 많은 계정에서 상장 버튼이 영구 비활성.
2. **개념 혼동(UX)** — "설립 확정"이 "회사 생성 여부"로 오해된다(모든 유저는 온보딩에서 이미 회사를 만들었으므로 요건이 무의미해 보임). 실제 의미는 "기록된 가장 이른 거래가 실제 첫 거래"라는 연혁 복원 완료 선언이다 — 리더보드가 설립일 기준 회사 나이·연환산 수익률(XIRR)을 공개하므로 필요한 장치.

**명시적 결정**:

1. **설립 확정을 상장에 합친다(036 FR-002 개정)** — 상장의 별도 선행 요건에서 제거하고, `listCompany`가 상장 시 `founding_declared = true`를 함께 세운다. 상장 요건은 "거래 기록 1건 이상"만 남는다.
2. **고지로 대체** — 확정이 자동화된 만큼 그 의미는 상장 버튼 위 고지로 알린다: "상장하면 기록된 첫 거래(설립일 {foundedAt})가 실제 첫 거래로 확정돼요. 더 이른 거래가 있다면 먼저 입력하세요." 확정의 본질은 시스템이 알 수 없는 본인 선언이므로, 질문하는 순간(넛지)은 유지하되 별도 탭은 없앤다. 이미 확정된 계정에는 고지를 띄우지 않는다.
3. **자동 해제는 그대로** — 상장 후에라도 더 이른 거래가 들어오면 기존 자동 해제 로직(`transactions/actions.ts`, `import/actions.ts`)이 `founding_declared`를 풀고 설립일을 당긴다. 상장 상태는 영향받지 않는다(036 결정 유지 — 요건 검사는 상장 시점 1회).
4. **`/import` 토글 유지** — `PositionFidelity`의 확정/되돌리기 토글은 연혁 복원 플로우의 일부로 그대로 둔다(상장과 무관하게 봉인 상태를 관리할 수 있음).
5. **죽은 링크 제거** — `/company`로 가던 "하러 가기 ›" 링크와 체크리스트의 "설립 확정" 항목을 제거한다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 거래 기록만 있으면 바로 상장한다 (Priority: P1)

거래 기록이 있는 유저가 `/ranking`을 방문하면 상장 버튼이 활성화되어 있고, 버튼 위에 첫 거래일이 설립일로 확정된다는 고지가 보인다. 버튼을 누르면 설립 확정과 상장이 한 번에 처리된다.

**Why this priority**: 이 기능의 핵심 — 영구 비활성이던 상장 버튼을 살리고 확정 단계를 흡수.

**Independent Test**: 거래 기록이 있고 설립 미확정인 계정으로 `/ranking` 방문 → 고지 확인 → "시장에 상장하기" 탭 → `holdings.listed_at`과 `founding_declared`가 함께 세워지고 리더보드에 본인 행이 나타나는지 확인.

**Acceptance Scenarios**:

1. **Given** 거래 기록 있음 + 설립 미확정 계정, **When** `/ranking`을 방문하면, **Then** 상장 버튼이 활성 상태이고 버튼 위에 설립일 확정 고지가 보인다.
2. **Given** 위 상태, **When** 상장 버튼을 누르면, **Then** 서버가 거래 존재를 재검증한 뒤 `listed_at`(+최초면 `first_listed_at`)과 `founding_declared = true`를 함께 세우고, 리렌더에서 리더보드가 나타난다.
3. **Given** 이미 설립 확정된 계정, **When** `/ranking`을 방문하면, **Then** 설립일 확정 고지는 보이지 않는다(이미 선언됨).
4. **Given** 거래 기록이 없는 계정, **When** `/ranking`을 방문하면, **Then** 체크리스트의 "거래 기록" 항목(가져오기/기록하기 링크 포함)이 미충족으로 보이고 상장 버튼은 비활성이다.
5. **Given** 요청 위조(거래 없이 서버 액션 직접 호출), **When** `listCompany`가 실행되면, **Then** 거래 존재 재검증에서 거부된다.

### Edge Cases

- 상장 후 더 이른 거래를 입력하면? → 기존 자동 해제 로직이 `founding_declared`를 풀고 설립일을 당긴다. 상장 상태는 유지되며(036 결정), 점수·연혁은 다음 방문 때 새 설립일 기준으로 재계산된다.
- 상장이 `founding_declared`를 세우므로 `/import`의 토글도 "설립 확정됨"으로 보인다 → 의도된 동작(`listCompany`가 `/import`도 revalidate). "되돌리기"로 풀 수 있고, 풀어도 상장 상태는 영향 없다.
- 확정을 읽지 않고 상장해 연혁이 부정확한 채 공개되면? → 수용된 트레이드오프. 리더보드 신뢰성은 원래 참가자의 정직한 입력에 의존하며, 과거 거래를 입력하는 순간 자동으로 바로잡힌다(고지 문구가 이를 안내).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `listCompany`는 심사 요건으로 거래 존재(삭제되지 않은 `events` 1건 이상)만 서버에서 재검증해야 한다. `founding_declared`는 선행 요건이 아니며(036 FR-002 개정), 상장 update에서 `true`로 함께 세워야 한다.
- **FR-002**: `IpoCard`의 상장 버튼은 `hasTrades`만으로 활성화되어야 한다. 체크리스트에서 "설립 확정" 항목과 `/company`로 가는 링크는 제거해야 한다.
- **FR-003**: `IpoCard`는 `foundingDeclared = false && hasTrades = true`일 때 상장 버튼 위에 설립일 확정 고지(설립일 포함, 자동 해제 안내 포함)를 노출해야 한다.
- **FR-004**: `listCompany`는 `/import`도 revalidate해야 하고(확정 토글 상태 반영), `declareFounding`은 `/ranking`도 revalidate해야 한다(고지 노출 여부 갱신).
- **FR-005**: `/import`의 `PositionFidelity` 확정/되돌리기 토글과 더 이른 거래 입력 시 자동 해제 로직은 변경 없이 유지되어야 한다.

### Key Entities

- 스키마 변경 없음. `holdings.founding_declared`(기존 컬럼)의 쓰기 경로에 `listCompany`가 추가될 뿐이다.
- `IpoCard` props: `holdingId` 불필요(서버 액션 직접 호출 제거), `foundedAt: string` 추가(고지 문구용).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 거래 기록이 있는 계정은 모드(ledger/snapshot)와 무관하게 `/ranking` 화면에서 탭 한 번으로 상장까지 완료할 수 있다.
- **SC-002**: 상장 직후 `holdings`를 조회하면 `listed_at`과 `founding_declared = true`가 함께 세워져 있다.
- **SC-003**: `/company`로 가는 죽은 "하러 가기" 링크가 더 이상 존재하지 않는다.
- **SC-004**: 이미 설립 확정된 계정의 카드에는 확정 고지가 노출되지 않는다.

## Assumptions

- 036의 나머지 결정(옵트인 불변식, 상장폐지·재상장, `first_listed_at` 불변, 공개 범위)은 이 기능으로 변경되지 않는다.
- "설립 확정" 용어와 `/import`의 토글 UI는 연혁 복원 플로우 안에서 그대로 유지한다 — 이 스펙은 상장 심사에서의 역할만 바꾼다.
