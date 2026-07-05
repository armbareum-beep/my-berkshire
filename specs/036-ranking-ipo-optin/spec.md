# Feature Specification: 랭킹 참가를 "상장(IPO)" 옵트인으로 전환

**Feature Branch**: `036-ranking-ipo-optin`
**Created**: 2026-07-05
**Status**: Draft
**Input**: User description: "지금은 /ranking·/dashboard를 방문하기만 하면 자동으로 ranking_scores에 등록되고 리더보드에 노출된다. 035에서 자산 구간·XIRR·구성 비중까지 공개하게 됐으니, 등록은 본인이 명시적으로 동의하는 절차여야 한다. 랭킹 참가를 '내 지주회사를 시장에 상장'하는 세계관의 옵트인으로 전환하고, 상장폐지·재상장을 지원한다."

## 개요

032에서 도입한 자동 등록 방식은 034·035를 거치며 저레버리지·저비용 지표에 이어 XIRR·자산 구간·유형별 구성 비중까지 공개 범위를 넓혔다. 공개 정보가 늘어난 만큼, 이제 리더보드 참가는 방문만으로 자동 성립해서는 안 되고 본인이 명시적으로 동의하는 절차여야 한다. 이 기능은 참가 절차를 "상장(IPO)" 세계관의 옵트인으로 전환한다 — 내 지주회사를 시장에 상장하겠다고 결정해야 리더보드에 참가하고, 언제든 상장폐지로 즉시 비노출할 수 있다.

**명시적 결정**:

1. **상장(IPO) 세계관** — 랭킹 참가 = "내 지주회사를 시장에 상장". 심사 요건 체크리스트(설립 확정 + 첫 거래) → "시장에 상장하기" 버튼 → 축하 + 연혁 영구 기록.
2. **전원 재동의** — 이 기능 적용 시점에 기존 `ranking_scores` 행 전부를 삭제한다(기존 자동 등록 참가자도 예외 없이 다시 동의해야 한다).
3. **상장폐지 제공** — `/company`에 상장 상태 섹션을 두고, 폐지하면 즉시 비노출되며 언제든 재상장할 수 있다.
4. **미상장 `/ranking`** — 본인 점수 프리뷰(ScoreCard) + 상장 CTA 카드만 보이고, 리더보드 자체는 상장 전까지 보이지 않는다("상장해야 시장이 보인다").
5. **상장명 분리** — 리더보드에 공개되는 이름을 회사명과 분리한다. 상장 시 입력(기본값=회사명), 이후 `/company`에서 변경 가능. 앱 내부 표시는 항상 기존 회사명 그대로다(프라이버시: 자산 구간이 공개되므로 익명성 있는 이름으로 상장할 수 있어야 한다).
6. **하단 탭 이름 "랭킹" 유지** — 세계관 카피는 화면 안에서만 쓰고 탭바 라벨은 바꾸지 않는다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 심사 요건을 채우고 시장에 상장한다 (Priority: P1)

지금까지는 `/ranking`을 방문하기만 하면 자동으로 리더보드에 등록됐다. 이제 방문해도 본인 점수 프리뷰와 "시장에 상장하기" 카드만 보이고, 설립 확정과 거래 기록이라는 심사 요건을 채운 뒤 버튼을 눌러야 리더보드에 참가한다. 상장 시 리더보드에 공개할 이름(상장명)을 입력할 수 있고, 비워두면 회사명을 그대로 쓴다.

**Why this priority**: 이 기능의 핵심 목적 — 참가를 자동에서 명시적 동의로 전환하는 게이트 그 자체.

**Independent Test**: 거래 기록이 없는 신규 계정으로 `/ranking`을 방문해 상장 버튼이 비활성 상태인 것을 확인 → 거래를 기록하고 설립을 확정한 뒤 다시 방문해 버튼이 활성화되는지 확인 → 상장명을 입력하고 상장 버튼을 눌러 같은 화면에서 리더보드가 즉시 나타나는지, `ranking_scores`에 해당 상장명으로 행이 생성됐는지 확인.

**Acceptance Scenarios**:

1. **Given** 설립 미확정 또는 거래 기록이 없는 계정, **When** `/ranking`을 방문하면, **Then** 리더보드는 보이지 않고 심사 요건 체크리스트(미충족 항목은 다음 행동 링크 포함)와 비활성화된 "시장에 상장하기" 버튼이 보인다.
2. **Given** 설립 확정 + 거래 기록이 있는 미상장 계정, **When** 상장명을 입력(또는 비워둠)하고 "시장에 상장하기"를 누르면, **Then** 서버가 요건을 재검증한 뒤 `holdings.listed_at`이 오늘 날짜로 세워지고, 같은 응답의 리렌더에서 리더보드와 본인 행이 즉시 나타난다.
3. **Given** 상장명을 비워두고 상장, **When** 리더보드를 확인하면, **Then** 표시 이름은 회사명 그대로다.
4. **Given** 요청 위조(클라이언트 체크리스트를 우회해 서버 액션을 직접 호출)로 요건 미충족 상태에서 상장을 시도, **When** 서버 액션이 실행되면, **Then** 서버 재검증에서 거부되고 `ranking_scores`에 행이 생성되지 않는다.

---

### User Story 2 - 상장폐지하거나 상장명을 바꾼다 (Priority: P2)

한 번 상장한 뒤에도 마음이 바뀌면 언제든 `/company`에서 상장을 폐지해 리더보드에서 즉시 내려갈 수 있고, 다시 상장(재상장)할 수도 있다. 상장명도 나중에 바꿀 수 있다.

**Why this priority**: 옵트인은 되돌릴 수 있어야 진짜 동의다. P1(상장 자체)이 성립해야 의미가 있는 후속 관리 기능.

**Independent Test**: 상장 중인 계정에서 `/company` 상장 섹션을 열어 상장명을 수정 → 리더보드에 새 이름이 즉시 반영되는지 확인. 이어서 상장폐지(2단계 확인)를 실행 → `ranking_scores` 행이 즉시 삭제되고 `/ranking`이 미상장 화면으로 돌아가는지 확인 → 재상장 후 `first_listed_at`이 최초 상장일 그대로인지 확인.

**Acceptance Scenarios**:

1. **Given** 상장 중인 계정, **When** `/company` 상장 섹션에서 상장명을 수정하면, **Then** `holdings.listed_name`과 `ranking_scores.holding_name`이 함께 즉시 갱신된다(다음 방문 대기 없음).
2. **Given** 상장 중인 계정, **When** 상장폐지 버튼을 누르면, **Then** "리더보드에서 즉시 내려가요. 언제든 재상장할 수 있어요" 2단계 확인 문구가 뜨고, 확인을 누르면 `listed_at`이 `null`이 되고 본인 `ranking_scores` 행이 즉시 삭제된다.
3. **Given** 상장폐지 상태(과거 상장 이력 있음), **When** `/company`를 보면, **Then** "현재 상장폐지 상태"임을 알리고 `/ranking`으로의 재상장 진입 링크가 보인다.
4. **Given** 상장폐지 후 재상장, **When** 상장을 다시 완료하면, **Then** `listed_at`은 재상장일로 갱신되지만 `first_listed_at`(최초 상장일)은 변하지 않는다.

---

### User Story 3 - 상장을 축하받고 연혁에 남는다 (Priority: P3)

상장하면 홈 화면에 한 번 축하 신호가 뜨고, 이후 본인 연혁(`/timeline`, `/growth`)과 다른 사람이 보는 공개 연혁(프로필 시트) 모두에 "시장 상장" 항목이 날짜와 함께 영구히 남는다.

**Why this priority**: 상장 절차(P1)와 관리(P2)가 구조적으로 성립해야 의미 있는 부가 가치. 없어도 옵트인 자체는 동작한다.

**Independent Test**: 상장 직후 홈을 방문해 축하 배너가 뜨는지, 확인(디스미스) 후 다시 방문했을 때 재노출되지 않는지 확인. 이어서 `/timeline`·`/growth`에서 "시장 상장" 항목을, 타 계정에서 그 유저의 리더보드 프로필 시트를 열어 같은 항목을 날짜만으로 확인.

**Acceptance Scenarios**:

1. **Given** 방금 상장을 완료한 계정, **When** 홈(`/dashboard`)을 방문하면, **Then** "{회사명}, 시장에 상장했어요" 축하 신호가 노출 창(14일) 안에서 표시된다.
2. **Given** 이미 확인(디스미스)한 축하 신호, **When** 같은 노출 창 안에서 다시 방문하면, **Then** 같은 신호는 다시 뜨지 않는다.
3. **Given** 상장 이력이 있는 계정, **When** 본인 `/timeline` 또는 `/growth`를 보면, **Then** 최초 상장일에 "시장 상장" 항목이 있다.
4. **Given** 상장 이력이 있는 계정의 리더보드 프로필 시트, **When** 타 유저가 그 시트를 열면, **Then** 연혁에 "시장 상장" 항목이 날짜만으로 표시된다(금액·상세 없음).

---

### Edge Cases

- 재상장 시 연혁이 초기화되는가? → 아니다. `first_listed_at`은 최초 상장일에서 불변이며, 재상장은 `listed_at`(현재 상태)만 갱신한다. 연혁(`/timeline`·`/growth`·공개 마일스톤)의 "시장 상장" 항목은 항상 `first_listed_at` 기준이라 재상장해도 그대로다.
- 상장 후 `founding_declared`가 어떤 사유로 자동 해제되면 상장 상태도 함께 풀리는가? → 아니다. 요건 검사는 상장(옵트인) 시점 1회만 수행하고, 이후 `founding_declared`가 바뀌어도 이미 세워진 `listed_at`에는 영향을 주지 않는다.
- 상장 후 거래가 전부 삭제되면? → `ranking_scores` 행이 스테일(과거 값 그대로)한 채로 남을 수 있다. 자동 정리는 하지 않으며, 본인이 명시적으로 상장폐지해야 비노출된다(설계상 허용된 상태).
- 멀티 디바이스에서 한쪽이 폐지 직후 다른 기기의 낡은 백그라운드 upsert가 들어오면? → `ranking_scores`의 `own_score_upsert` RLS `WITH CHECK`가 `listed_at is not null` 조건으로 해당 쓰기를 DB 레벨에서 거부한다(콘솔 에러 로그만 남고 무해).
- 배포 스큐(구버전 인스턴스가 아직 떠 있는 동안)에도 위와 동일하게 RLS가 최종 방어선이 된다 — 앱 게이트(`rankingSync.ts`)는 1차 방어일 뿐 구조적 보장은 RLS다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: **옵트인 불변식** — 미상장(`holdings.listed_at is null`) 상태인 holding은 어떤 경로로도(방문 시 자동 upsert, 배포 스큐, 멀티 디바이스 race 포함) `ranking_scores`에 저장되지 않아야 한다. 이는 앱 게이트(`rankingSync.ts`의 `upsertRankingScore`)와 DB `ranking_scores.own_score_upsert` RLS `WITH CHECK`의 이중 방어로 구조적으로 보장해야 한다.
- **FR-002**: 시스템은 상장(`listCompany`) 요청 시 서버에서 심사 요건을 재검증해야 한다 — `holdings.founding_declared = true`이고, 해당 holding 소속 계좌에 삭제되지 않은(`deleted_at is null`) 거래(`events`)가 1건 이상 있어야 한다. 요건 미충족이면 상장을 거부하고 에러를 반환해야 한다.
- **FR-003**: 상장명(`listed_name`)은 1~20자여야 하며, trim 후 빈 문자열이면 `null`로 저장하고 리더보드에는 회사명(`holdings.name`)을 대신 표시해야 한다. 상장명이 있으면 리더보드·프로필 시트 표시 이름은 상장명을 우선해야 한다.
- **FR-004**: 상장폐지(`delistCompany`)는 ① `holdings.listed_at`을 `null`로 세우고 ② 본인 `ranking_scores` 행을 삭제하는 순서로 수행해야 한다. `first_listed_at`과 `listed_name`은 상장폐지로 변경되지 않아야 한다(연혁·다음 상장을 위한 불변 보존).
- **FR-005**: 재상장 시 `holdings.first_listed_at`은 기존 값이 있으면 그대로 유지하고, 없으면(최초 상장) 상장일로 채워야 한다. `listed_at`은 매 상장(재상장 포함)마다 그 시점 날짜로 갱신되어야 한다.
- **FR-006**: `/company`는 상장 상태를 관리하는 섹션을 제공해야 한다 — 상장 중이면 상태·상장일(+최초 상장일이 다르면 보조 표기)·상장명 인라인 수정(`updateListedName`)·상장폐지(2단계 확인, "리더보드에서 즉시 내려가요. 언제든 재상장할 수 있어요")를, 미상장이면 상태 안내(+과거 상장 이력이 있으면 "현재 상장폐지 상태")와 `/ranking`으로의 진입 링크를 보여야 한다.
- **FR-007**: `/ranking`은 미상장 상태에서 리더보드(전체 유저 조회·SELECT)를 렌더하지 않아야 하며, 대신 본인 점수 프리뷰(거래가 있을 때만 `ScoreCard`)와 상장 CTA 카드(`IpoCard` — 심사 요건 체크리스트, 상장명 입력, 공개 항목 고지, 상장 버튼)를 보여야 한다. 상장 후에는 기존(032~035) 리더보드·프로필 시트 동작을 그대로 유지해야 한다.
- **FR-008**: 상장 완료는 홈 화면 축하 신호를 1건 발생시켜야 한다 — 아이콘 🔔, 문구 "{상장명 아님, 회사명} 시장에 상장했어요", 목적지 `/ranking`, 노출 창은 기존 설립기념일과 동일한 `ANNIVERSARY_WINDOW_DAYS`(14일)를 재사용해야 한다. 디스미스 인프라(`home_signal_dismissals`)를 그대로 사용해야 하며, 재상장은 새 `listed_at`(새 key)이라 다시 축하되어야 한다.
- **FR-009**: 시스템은 최초 상장일(`first_listed_at`)을 두 연혁 표면에 반영해야 한다 — 본인 연혁(`/timeline`, `/growth`, `dashboard.ts`의 timeline 시드)에 "시장 상장" 항목을, 공개 마일스톤(`PublicMilestonesV1.listed_at`, 리더보드 프로필 시트)에도 같은 라벨의 항목을 날짜만으로 추가해야 한다. `PublicMilestonesV1`에 이 필드를 추가하는 것은 additive 변경이어야 하며(`v`는 1 유지), 필드가 없는 036 이전 jsonb 파싱 시 `null`로 채워 하위호환을 유지해야 한다.
- **FR-010**: 하단 탭바의 "랭킹" 탭 명칭은 이 기능으로 변경하지 않는다 — 상장 세계관 카피는 `/ranking`·`/company` 화면 내부에서만 쓴다.
- **FR-011**: 이 기능 적용 시점에 기존 `ranking_scores` 테이블의 모든 행을 삭제해야 한다(전원 재동의 — 자동 등록 기간에 쌓인 행은 새 옵트인 절차를 거치지 않았으므로 예외 없이 제거).

### Key Entities

- **`holdings` 테이블 신규 컬럼**: `listed_at`(date, nullable — 현재 상장 상태, null=미상장/폐지), `first_listed_at`(date, nullable — 최초 상장일, 불변, 연혁 원천), `listed_name`(text, nullable — 리더보드 공개 이름, null=회사명 사용).
- **`ranking_scores.own_score_upsert` RLS 정책**: `USING`은 소유권만 검사(폐지 후에도 본인 행 DELETE 가능), `WITH CHECK`에만 `listed_at is not null` 조건을 추가해 옵트인 불변식을 DB 레벨에서 강제한다.
- **공개 마일스톤(`PublicMilestonesV1` jsonb)**: 035까지의 필드(`v`, `plans_completed`, `plan_completed_dates`, `drawdowns_passed`, `first_buy_at`, `first_overseas_at`, `first_dividend_at`)에 `listed_at: string | null`을 additive 추가(`holding.first_listed_at`을 그대로 담음).
- **상장명 규칙**: 1~20자, trim 후 빈 값이면 `null`(회사명 폴백). 정확한 자산 금액·보유 종목명 비공개 불변식(034·035)은 이 기능으로 변경되지 않는다.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 미상장 계정이 `/ranking`·`/dashboard`를 임의 횟수 방문해도 `ranking_scores`에 해당 holding의 행이 생성되지 않는다(0건).
- **SC-002**: 심사 요건을 채운 계정이 상장 절차를 완료하면 같은 응답의 리렌더 안에서 리더보드에 본인 행이 즉시 나타난다(추가 방문 불필요).
- **SC-003**: 상장폐지 직후 SQL로 `ranking_scores`를 조회하면 해당 holding 행이 존재하지 않는다.
- **SC-004**: 상장폐지 후 재상장한 계정의 `first_listed_at`은 최초 상장일 그대로이고, `listed_at`만 재상장일로 바뀐다.
- **SC-005**: 상장 축하 신호는 노출 창(14일) 안에서 1회 노출되며, 디스미스 후 같은 창 안에서 재노출되지 않는다.
- **SC-006**: 본인 연혁(`/timeline`,`/growth`)과 타인이 보는 프로필 시트 연혁 양쪽에서 "시장 상장" 항목이 동일한 날짜(`first_listed_at`)로 나타난다.

## Assumptions

- `holdings.listed_at`/`first_listed_at`/`listed_name` 컬럼과 `ranking_scores` 전체 삭제, RLS `WITH CHECK` 개정은 이 스펙 이전 단계(마이그레이션)에서 이미 적용됐다고 가정한다.
- 상장(`listCompany`)·상장폐지(`delistCompany`)·상장명 변경(`updateListedName`) 서버 액션은 `rebalance/actions.ts`의 `Result` 패턴(`{ok:true} | {ok:false; error: string}`)을 따른다.
- 033 게이미피케이션 헌법(시장 결과 비노출·`CELEBRATION_DENYLIST`)은 이 기능에도 상위 규범으로 적용된다 — 상장 축하는 시장 결과가 아니라 "리더보드 참가라는 결정"을 축하하는 것이라 헌법과 충돌하지 않는다.
- 034·035에서 확립한 비공개 불변식(정확한 자산 금액·보유 종목명은 어떤 형태로도 노출하지 않음)은 이 기능으로 완화되지 않는다.
