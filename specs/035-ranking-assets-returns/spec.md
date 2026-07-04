# Feature Specification: 랭킹 프로필 시트에 자산 구간·XIRR·구성 비중 표시

**Feature Branch**: `035-ranking-assets-returns`
**Created**: 2026-07-04
**Status**: Draft
**Input**: User description: "랭킹 프로필 바텀 시트에 (a) 주식 자산 구간 라벨, (b) XIRR 연환산 %, (c) 유형별(주식/ETF/원자재/코인/현금) 구성 비중 % 스택 바 그래프를 추가. 점수 공식·리더보드 행·SCORE_VERSION은 불변. 정확한 금액은 어떤 형태로도 DB에 저장 금지."

## 개요

034는 "자산 금액·절대 수익률(XIRR 절대값)은 랭킹 지표·프로필 어디에도 노출하지 않는다"를 비공개 불변식(FR-009)으로 명시했다. 035는 사용자 요청에 따라 이 결정을 **부분 완화**한다: XIRR 연환산 값, 자산 구간 라벨(정확한 금액 아님), 유형별 구성 비중(%)은 프로필 바텀시트에 공개한다. 단, 정확한 자산 금액과 보유 종목명은 여전히 어떤 형태로도 저장·노출하지 않는다 — 이 부분은 034의 결정을 그대로 계승한다.

**명시적 결정(034 FR-009 부분 개정)**: XIRR 값·자산 **구간**·유형 비중 **%**는 공개로 완화한다. 정확한 자산 금액·보유 종목명은 계속 구조적 비공개다. 랭킹 점수 산정 방식(7지표 가중합·`SCORE_VERSION`)은 이 기능으로 변경하지 않는다 — 신규 표시 항목은 점수에 어떤 영향도 주지 않는 순수 정보성 컬럼이다.

이 표시는 계기판이며 축하 대상이 아니다(033 게이미피케이션 헌법·`CELEBRATION_DENYLIST` 불변 — 자산 구간 상승·XIRR 개선을 축하 트리거로 사용하지 않는다).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 프로필 시트에서 자산 구간과 수익률을 본다 (Priority: P1)

지금까지 리더보드 프로필 시트는 지표 점수와 연혁만 보여줬다. 이제 시트를 열면 "주식 자산" 구간 라벨(예: "1억~3억")과 "수익률(연환산)" XIRR %가 추가로 표시된다. 두 값 모두 정확한 금액이 아니다.

**Why this priority**: 사용자가 명시적으로 요청한 핵심 신규 정보 표시.

**Independent Test**: 임의 유저의 프로필 시트를 열어 "주식 자산" 구간 라벨과 "수익률(연환산)" XIRR %가 표시되는지, 정확한 원화 금액이 어디에도 없는지 확인.

**Acceptance Scenarios**:

1. **Given** 시세 조회에 성공한 유저의 프로필 시트, **When** 시트를 열면, **Then** "주식 자산" 행에 구간 라벨(예: "1억~3억")이 표시된다.
2. **Given** 같은 유저, **When** 시트를 보면, **Then** "수익률(연환산)" 행에 XIRR이 부호 있는 % (`signedPct`, 소수 1자리)로 표시된다.
3. **Given** 시세 조회 실패(`currentValuation=null`) 또는 XIRR 미산출(`xirr=null`) 유저, **When** 시트를 열면, **Then** 해당 행이 생략된다(크래시·빈 값 표시 금지).

---

### User Story 2 - 유형별 구성 비중 그래프를 본다 (Priority: P2)

리더보드 프로필 시트에 주식/ETF/원자재/코인/현금 유형별 비중을 스택 바 + 점 범례로 보여준다. 대시보드 총자산 카드와 같은 시각 언어를 쓴다.

**Why this priority**: 자산 구간·수익률(P1)만으로는 "어떻게 구성되어 있는지"가 안 보인다. 시각적 정보로 서사를 보완하지만 P1보다는 부차적.

**Independent Test**: 여러 유형을 보유한 유저의 프로필 시트를 열어 스택 바 폭의 합이 100%에 근접하고, 범례에 유형명 + %만 표시되며 금액 숫자가 없는지 확인.

**Acceptance Scenarios**:

1. **Given** 주식·ETF·현금을 보유한 유저, **When** 프로필 시트를 열면, **Then** 스택 바(각 유형 폭 비율) + 범례(`{유형} {pct}%`)가 표시된다.
2. **Given** 같은 유저, **When** 범례를 확인하면, **Then** 원화 금액·수량은 어디에도 없다.
3. **Given** 시세 조회 실패 또는 구성 비중 미산출 유저, **When** 시트를 열면, **Then** 구성 비중 섹션 전체가 생략된다.
4. **Given** 반올림 후 비중 합이 100이 아닐 수 있는 경우, **When** 저장 시점에 계산하면, **Then** 가장 큰 비중 슬라이스에 오차를 몰아 합이 항상 100이 되도록 보정하고, 0%로 반올림되는 슬라이스는 제외한다.

---

### Edge Cases

- 자산 평가액이 정확히 구간 경계값(1천만/1억/30억 등)이면? → 하한 포함 규칙으로 상위 구간에 배정(예: 정확히 1억은 "1억~3억").
- 구버전(035 이전) 행이라 `xirr`/`asset_bucket`/`composition`이 모두 `null`이면? → 세 섹션 모두 생략, 기존 지표·연혁 표시에는 영향 없음(크래시 금지).
- 구성 비중 계산 중 특정 종목의 시세만 개별적으로 없으면? → 시세 확보 종목만 합산에 반영(전체 `priceAvailable`이 false일 때만 섹션 자체를 생략).
- 보유 유형이 하나(예: 전량 현금)뿐이면? → 스택 바가 한 가지 색으로 100% 채워지고 범례도 한 줄만 표시.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 시스템은 `ranking_scores`에 `xirr`(DOUBLE PRECISION, nullable), `asset_bucket`(TEXT, nullable), `composition`(JSONB, nullable) 컬럼을 추가해야 한다. 세 컬럼 모두 점수 산정(`computeRankingScore`, `SCORE_VERSION`)에는 관여하지 않는 순수 표시용이다.
- **FR-002**: `xirr`은 `result.xirr`(연환산 XIRR, 소수 단위, 예 0.12=12%)을 그대로 저장해야 한다. 시세 실패 등으로 XIRR을 산출할 수 없으면 `null`이어야 한다.
- **FR-003**: `asset_bucket`은 정확한 금액이 아닌 구간 라벨만 저장해야 한다. 구간표:

  | 구간 | 라벨 |
  |------|------|
  | 0 ≤ v < 1천만 | 1천만 미만 |
  | 1천만 ≤ v < 5천만 | 1천만~5천만 |
  | 5천만 ≤ v < 1억 | 5천만~1억 |
  | 1억 ≤ v < 3억 | 1억~3억 |
  | 3억 ≤ v < 5억 | 3억~5억 |
  | 5억 ≤ v < 10억 | 5억~10억 |
  | 10억 ≤ v < 30억 | 10억~30억 |
  | v ≥ 30억 | 30억 이상 |

  각 구간은 하한을 포함한다. `currentValuation`이 `null`(시세 실패)이면 `asset_bucket`도 `null`이어야 한다.
- **FR-004**: `composition`은 유형별(주식/ETF/원자재/코인/현금) 비중만 담는 jsonb(v1 스키마, 아래 Key Entities)여야 하며, 정확한 금액·수량·종목명을 포함해서는 안 된다. 각 슬라이스의 `pct`는 반올림 정수(0~100)이고, 전체 슬라이스 `pct`의 합은 항상 100이어야 한다(오차는 최대 비중 슬라이스에 배정). `pct`가 0으로 반올림되는 유형은 슬라이스에서 제외한다. 전체 평가액을 산출할 수 없으면(시세 실패) `composition`은 `null`이어야 한다.
- **FR-005**: 리더보드 프로필 바텀시트는 "설립 N년차" 아래에 다음을 표시해야 한다(각각 값이 없으면 해당 행/섹션을 생략) — "주식 자산" 구간 라벨, "수익률(연환산)" XIRR(`signedPct`, 손익 색상 적용), 유형별 구성 비중 스택 바 + 점 범례(`{유형} {pct}%`).
- **FR-006**: 리더보드 행(`Leaderboard.tsx`의 `LeaderboardRow`)과 `/ranking` 리더보드 카드 자체는 변경하지 않는다 — 신규 표시는 프로필 바텀시트에서만 노출한다.
- **FR-007**: 정확한 자산 금액과 보유 종목명은 034에서 확립된 비공개 불변식을 그대로 유지한다 — `ranking_scores` 테이블 어떤 컬럼에도, 프로필 바텀시트 어떤 텍스트에도 정확한 원화 금액이나 종목코드/종목명이 등장해서는 안 된다.
- **FR-008**: 신규 표시 항목(자산 구간 상승, XIRR 개선, 구성 비중 변화)은 033 게이미피케이션 헌법의 축하 트리거(`CELEBRATION_DENYLIST`)에 추가되지 않는다 — 계기판 정보로만 남고 축하·평가 신호로 전환되지 않는다.

### Key Entities

- **랭킹 점수 행(`ranking_scores`)**: 034의 7지표 컬럼에 더해 `xirr`(double precision, nullable), `asset_bucket`(text, nullable), `composition`(jsonb, nullable)가 추가된다. 셋 다 점수 산정과 무관한 표시 전용 컬럼.
- **구성 비중(`composition` jsonb, v1 스키마)**:
  ```jsonc
  {
    "v": 1,
    "slices": [
      { "label": "주식", "pct": 62 },
      { "label": "ETF", "pct": 20 },
      { "label": "현금", "pct": 18 }
    ]
  }
  ```
  `label`은 `주식`/`ETF`/`원자재`/`코인`/`현금` 중 보유한 유형만, 고정 순서(주식→ETF→원자재→코인→현금)로 나열한다. 금액·수량 필드는 스키마에 존재하지 않는다.
- **비공개 불변식(개정)**: 정확한 자산 금액과 보유 종목명은 여전히 어떤 형태로도 저장·노출되지 않는다. XIRR 값·자산 구간 라벨·유형별 비중 %는 035로 공개 범위에 포함됐다.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 자산 구간 경계값(1천만/1억/30억 및 그 직전 값) 전수 테스트에서 하한 포함 규칙대로 정확히 분류된다.
- **SC-002**: 임의 표본에서 `composition`의 `pct` 합이 항상 100이고, 0%로 반올림되는 슬라이스가 결과에 없다.
- **SC-003**: `ranking_scores`의 어떤 신규 컬럼(`xirr`, `asset_bucket`, `composition`)에도 정확한 원화 금액이나 종목코드가 담기지 않는다(스키마 검사 + 코드 리뷰로 확인).
- **SC-004**: `xirr`/`asset_bucket`/`composition` 중 하나라도 `null`인 유저의 프로필 시트에서 해당 섹션이 생략되고 크래시가 없다.
- **SC-005**: 랭킹 점수 산정 로직(`computeRankingScore`, `SCORE_VERSION`, 7지표 가중치)은 이 기능 적용 전후로 동일한 값을 산출한다(회귀 0).

## Assumptions

- `result.xirr`, `result.currentValuation`(둘 다 `src/lib/finance/returns.ts`에서 이미 계산됨)을 그대로 재사용하며 새로운 수익률 계산 로직을 도입하지 않는다.
- 구성 비중 집계는 `src/lib/allocation.ts`의 `groupByTag`/`ASSET_TYPE_ORDER` 관례를 따르되, `/ranking` 경로는 `computeDashboard`의 `AllocationSlice` 산출물을 갖고 있지 않아 `positions × prices × securityMeta`에서 직접 집계하는 축약 헬퍼(`computeCompositionPct`)를 쓴다.
- 종목 메타(`loadSecurityMeta`)는 기존 대시보드 경로(`/dashboard`)에서 이미 로드하던 것을 재사용하고, `/ranking` 경로는 신규로 배선한다.
- 033 게이미피케이션 헌법(시장 결과 비노출·스타일 중립·축하 트리거 제한)은 이 기능에도 상위 규범으로 적용된다.
