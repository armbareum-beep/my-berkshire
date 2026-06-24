# Phase 0 Research: 레버리지 금융비용 수익률 반영

Clarifications(2026-06-24)에서 3대 결정이 확정됨 → NEEDS CLARIFICATION 없음. 본 문서는 그 결정의 근거와 구현상 파생 결정을 정리한다.

## R1. 이자 짝짓기 단위 = 대출 종류 기반

- **Decision**: `LiabilityKind`로 자산군 라우팅. MORTGAGE → 부동산 사업부 임대료에서 차감, MARGIN → 주식, CREDIT/OTHER → 특정 수익원 미차감(순자산 차원만).
- **Rationale**: 기존 `computeRealEstateDivision`이 사업부 단위 집계라 1:1 연결 없이 바로 합산 가능. 스키마 FK·입력 부담 0. 헌장 III(점진적 공개)·메모리(사업부 단위) 정합.
- **Alternatives**: ① 대출↔부동산 1:1 FK → 부동산별 ROE 가능하나 입력·스키마 부담↑(비범위). ② 하이브리드(선택적 override) → UX·구현 복잡 최고(비범위).

## R2. 추정 이자 = 저장 행 없이 조회 시 파생

- **Decision**: 이자 원장 행을 만들지 않는다. 조회 시 `Σ(잔액ᵢ×이율ᵢ×경과개월/12)`로 계산. 보정만 체크포인트로 저장.
- **Rationale**: 변동 잔액·이율에 대해 항상 최신값으로 재계산 → 스테일 없음. cron/스케줄러 불필요(이 repo는 배당도 방문 시 생성). 저장 행이 없어 011 `events` 단일원장 불변식과 충돌 여지 0.
- **Alternatives**: 배당 sync처럼 월별 행 insert → 명시적 이력은 남지만 생성 후 잔액·이율 변경 시 stale, 중복방지 키·정합 부담. 기각.
- **파생 결정**: 누적 추정 이자 = `confirmed(보정 합계) + estimatedTail(마지막 체크포인트 이후 현재 잔액으로 누적)`. 경과개월은 월 경계 기준 정수+일할 보정(아래 R5).

## R3. 누적 기점 = 대출 차입일(startedAt)

- **Decision**: 누적 시작 = `startedAt`. null이면 짝지는 부동산 취득일(`acquiredAt`), 그것도 없으면 holding 기록 시작일.
- **Rationale**: 대출이 실제 존재한 기간만 이자 발생 → 누적수익률 정직(헌장 II). 011 부동산은 XIRR 비포함·누적수익률 합산이므로 기점이 누적수익률 정확도를 좌우.
- **Alternatives**: 기능 도입 시점부터 → 과거 이자 누락, 수익률 부풀림(기각). 첫 보정부터 → 초기 보정 강제(온보딩 마찰, 기각).

## R4. 보정 모델 = division-level 체크포인트 테이블

- **Decision**: 신규 테이블 `financing_reconciliation`(holding 스코프, division 구분, kind=interest_actual|capital). interest_actual은 직전 체크포인트~해당일의 **확정 이자**(비용, 분자 차감)이며 그 시점부터 추정 tail이 재시작. capital은 **자본 투입**(분모=cost 증가), 추정 누적엔 영향 없음.
- **Rationale**: 짝짓기가 종류 기반(division-level)이라 자산 1:1인 `manual_asset_income`에 못 담음. 별도 테이블이 division 귀속·기점 리셋을 깔끔히 표현. FR-006/007 충족.
- **Alternatives**: `manual_asset_income`에 음수/0-amount 행 재사용 → division-level 귀속 불명확, amount>=0 제약 충돌(기각).
- **기본값**: 보정 kind 기본 = `interest_actual`(비용) — FR-007/헌장 보수성.

## R5. 경과개월 계산

- **Decision**: `monthsBetween(from, to)` = 완전 경과월 + 잔여일/해당월일수. 월 환산은 ÷12를 ×(개월수)로.
- **Rationale**: 단순 days/30.44보다 월배당·이자 직관과 일치, 결정적. 미래 날짜 입력 방지(today 상한).
- **Note**: `xirr.ts`의 `daysSince`가 있으나 월 단위 직관을 위해 별도 헬퍼. UTC 달력 기준(배당 모듈과 동일 안정화).

## R6. 마진↔주식(P3) 정합 — 본 플랜 구현 보류

- **Decision**: MARGIN 이자를 주식 수익률 드래그로 반영하는 것은 **설계만 남기고 구현 보류**. 이유: 주식 수익률은 `events` 기반 XIRR이고, 마진 이자를 진짜 현금유출로 넣으려면 `events`에 합성 행이 필요 → 헌장 V(단일원장·이중계상 금지)와 충돌 가능. 정합 방식(WITHDRAWAL/fee 이벤트 vs 표시 전용 드래그)을 별도 결정 후 후속 기능으로.
- **Rationale**: 대부분 사용자는 마진 미사용(P3). 부동산(P1·P2)이 가치의 핵심. 무리한 구현이 단일원장 신뢰를 흔들면 안 됨.
- **Impact**: 본 플랜 tasks는 P1·P2(부동산)만. SC-005(주식 XIRR 불변)는 마진 미구현으로 자명 보장.

## R7. 기존 자산 회귀 안전성

- **Decision**: `computeRealEstateDivision(assets, incomes, financing?)`에서 `financing` 옵셔널·기본 0. 대출 없거나 미주입 시 011과 수치 동일.
- **Rationale**: 011 테스트·화면 회귀 0. 헌장 워크플로(기능 회귀 불변 확인) 충족.
