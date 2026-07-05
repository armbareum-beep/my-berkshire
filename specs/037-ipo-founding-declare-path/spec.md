# Feature Specification: 상장 심사 요건 "설립 확정"을 랭킹 카드에서 바로 수행

**Feature Branch**: `claude/ipo-button-founding-confirmation-r06fma`
**Created**: 2026-07-05
**Status**: Implemented
**Input**: User description: "시장에 상장하기 버튼이 비활성화 되어있어. 그리고 설립확정은 왜 있어? 어차피 모두 설립한 사람만 대시보드 들어올 수 있는데"

## 개요

036에서 랭킹 참가를 상장(IPO) 옵트인으로 전환하며 심사 요건(설립 확정 + 거래 기록)을 두었는데, 요건 중 "설립 확정"을 수행할 경로가 사실상 막혀 있었다:

- `IpoCard`의 "설립 확정 → 하러 가기" 링크가 `/company`로 갔지만 그 페이지에는 설립 확정 UI가 없다(죽은 링크).
- 유일한 확정 토글은 `/import`의 `PositionFidelity`에만 있는데, `/import`는 ledger 모드가 아니면 리다이렉트되고 종목 복원 대상(positions)이 없으면 토글이 렌더링되지 않는다.

→ 많은 계정에서 "시장에 상장하기" 버튼이 영구 비활성.

또한 "설립 확정"이라는 이름이 "회사 생성 여부"로 오해된다(모든 유저는 온보딩에서 이미 회사를 만들었으므로 요건이 무의미해 보임). 실제 의미는 **"기록된 가장 이른 거래가 실제 첫 거래"라고 선언해 연혁 복원을 완료(봉인)하는 것**이다 — 리더보드가 설립일 기준 회사 나이·연환산 수익률(XIRR)을 공개하므로, 과거 거래를 절반만 입력한 채 상장해 연혁이 왜곡되는 것을 막는 장치(036 FR-002).

**명시적 결정**:

1. **요건 유지** — 설립 확정은 연혁 신뢰성 장치이므로 상장 심사 요건에서 제거하지 않는다(036 FR-002 불변).
2. **카드 안에서 확정** — `IpoCard` 체크리스트의 "설립 확정" 항목에 인라인 확정 버튼("이게 내 첫 거래예요 · 설립 확정")을 두어, 랭킹 화면을 떠나지 않고 요건을 채울 수 있게 한다. 기존 서버 액션 `declareFounding`(`src/app/import/actions.ts`)을 그대로 재사용한다.
3. **의미 설명 문구** — 미확정 상태에서 "기록된 첫 거래(설립일 {foundedAt})가 실제 첫 거래라고 선언해 연혁을 확정해요. 더 이른 거래를 넣으면 자동 해제돼요."를 항목 아래에 노출해 '회사 생성'과의 혼동을 줄인다.
4. **죽은 링크 제거** — `/company`로 가던 "하러 가기" 링크를 제거한다. `/import`의 기존 `PositionFidelity` 토글은 그대로 유지된다(양쪽 어디서든 확정 가능).
5. **거래 없으면 확정 버튼 미노출** — 거래 기록이 없는 상태의 확정은 의미가 없으므로(봉인할 첫 거래가 없음) `hasTrades`일 때만 확정 버튼을 보여주고, 거래 기록 항목의 기존 "가져오기/기록하기" 링크로 유도한다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 랭킹 화면에서 바로 설립을 확정하고 상장한다 (Priority: P1)

거래 기록은 있지만 설립 미확정인 유저가 `/ranking`을 방문하면, 심사 요건 체크리스트의 "설립 확정" 항목 아래에 의미 설명과 확정 버튼이 보인다. 버튼을 한 번 탭하면 확정되고, 같은 화면에서 체크리스트가 채워지며 "시장에 상장하기" 버튼이 활성화된다.

**Why this priority**: 이 기능의 핵심 — 영구 비활성이던 상장 버튼을 살리는 경로 복구.

**Independent Test**: 거래 기록이 있고 설립 미확정인 계정으로 `/ranking` 방문 → "이게 내 첫 거래예요 · 설립 확정" 버튼 탭 → 체크리스트 ✓ 전환 + 상장 버튼 활성 → 상장 완료까지 한 화면에서 수행.

**Acceptance Scenarios**:

1. **Given** 거래 기록 있음 + 설립 미확정 계정, **When** `/ranking`을 방문하면, **Then** "설립 확정" 항목 아래에 의미 설명 문구와 확정 버튼이 보이고 상장 버튼은 비활성이다.
2. **Given** 위 상태, **When** 확정 버튼을 탭하면, **Then** `holdings.founding_declared = true`가 되고 리렌더에서 체크리스트가 ✓로 바뀌며 상장 버튼이 활성화된다.
3. **Given** 거래 기록이 없는 계정, **When** `/ranking`을 방문하면, **Then** 확정 버튼은 보이지 않고 의미 설명 문구와 "거래 기록" 항목의 가져오기/기록하기 링크만 보인다.
4. **Given** `/import`에서 이미 확정한 계정, **When** `/ranking`을 방문하면, **Then** "설립 확정" 항목은 ✓ 상태이고 설명·버튼은 노출되지 않는다(기존 동작 회귀 없음).

### Edge Cases

- 확정 직후 더 이른 거래를 입력하면? → 기존 자동 해제 로직(`transactions/actions.ts`, `import/actions.ts`)이 그대로 동작해 `founding_declared`가 풀리고, 카드 체크리스트도 미확정으로 돌아간다(`declareFounding`이 `/ranking`도 revalidate).
- 이미 상장한 뒤 확정이 자동 해제되면? → 036 결정 그대로 상장 상태에는 영향 없다(요건 검사는 상장 시점 1회).
- 확정 서버 액션 실패(네트워크·권한)? → toast 에러로 알리고 상태는 변하지 않는다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `IpoCard`는 `foundingDeclared = false`일 때 "설립 확정" 항목 아래에 의미 설명 문구(설립일 포함)를 노출해야 한다.
- **FR-002**: `IpoCard`는 `foundingDeclared = false`이고 `hasTrades = true`일 때 인라인 확정 버튼을 노출해야 하며, 탭 시 기존 `declareFounding(holdingId, true)` 서버 액션을 호출하고 성공 시 화면을 갱신해야 한다. `hasTrades = false`이면 확정 버튼을 노출하지 않아야 한다.
- **FR-003**: `/company`로 가던 "하러 가기 ›" 링크는 제거해야 한다(해당 페이지에 확정 UI가 없음).
- **FR-004**: `declareFounding`은 `/ranking`도 revalidate해야 한다(카드 체크리스트 즉시 갱신).
- **FR-005**: 상장(`listCompany`)의 서버 재검증(036 FR-002)과 `/import`의 기존 `PositionFidelity` 확정 토글(확정/되돌리기)은 변경 없이 유지되어야 한다.

### Key Entities

- 스키마 변경 없음. `holdings.founding_declared`(기존 컬럼)를 기존 서버 액션으로만 갱신한다.
- `IpoCard` props 추가: `holdingId: string`, `foundedAt: string`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 거래 기록이 있는 미확정 계정이 `/ranking` 화면만으로(다른 페이지 이동 없이) 설립 확정 → 상장까지 완료할 수 있다.
- **SC-002**: 어떤 모드(ledger/snapshot)의 계정이든 설립 확정을 수행할 수 있는 경로가 최소 1개 존재한다.
- **SC-003**: `/company`로 가는 죽은 "하러 가기" 링크가 더 이상 존재하지 않는다.

## Assumptions

- "설립 확정"이라는 용어 자체는 유지한다(033~036 세계관 카피와 일관). 오해는 항목 아래 설명 문구로 완화한다.
- 거래 기록이 없는 계정의 확정은 봉인 대상(첫 거래)이 없어 의미가 없으므로 UI에서 유도하지 않지만, 서버 액션 자체는 거래 유무를 검사하지 않는 기존 동작을 유지한다(상장 시점에 어차피 거래 존재를 재검증).
