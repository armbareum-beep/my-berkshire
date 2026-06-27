# Feature Specification: ETF 투시재무제표

**Feature Branch**: `019-etf-lookthrough`  
**Created**: 2026-06-27  
**Status**: Draft  
**Input**: ETF lookthrough — etf_pending 실제 계산으로 교체

## 배경 & 결정 사항

### 왜 이 접근법인가

투시재무제표(`lookThrough.ts`)는 보유 자산별 "내 귀속 순이익"을 합산해 실질 PER·ROE를 보여준다.
현재 ETF는 `etf_pending`으로 막혀 있어 계산에서 제외된다.

**ETF 귀속 순이익 계산식**:
```
내 ETF 귀속 순이익 = 내 ETF 보유 시장가치 ÷ ETF PER
```

`etfStats.ts`의 `getEtfStats()`가 Yahoo Finance `summaryDetail.trailingPE`에서 ETF-level PER을 이미 가져온다.
이 값은 Yahoo가 전체 구성종목 가중평균으로 계산해 제공하므로 별도 구성종목 조회 불필요.

### 의도적 제외

- **구성종목 개별 PER 조회**: 구현하지 않음
  - 채권 ETF: 구성종목이 채권이라 PER 개념 없음
  - 소형 한국 ETF: Yahoo holdings 배열 자체가 비어 있음
  - 테마형 ETF: 상위 10개(Yahoo 한계)가 전체의 40~60%만 커버 → 추정 오차 크고 오해 유발
- **ETF 구성종목 UI 표시**: lookthrough 화면에 ETF 내부 종목 펼치기 제외 (V3 고려)

---

## User Scenarios & Testing

### User Story 1 — ETF PER 있는 경우 투시 포함 (P1)

SPY, QQQ, KODEX 200 등 지수형 ETF를 보유한 사용자가 투시재무제표를 열면 ETF 귀속 순이익이 합산에 포함된다.

**Independent Test**: SPY를 보유한 포트폴리오로 `/lookthrough` 접근 → SPY가 "포함" 상태로 투시 PER에 기여

**Acceptance Scenarios**:

1. **Given** SPY 10주 보유, **When** 투시재무제표 로드, **Then** SPY 귀속 순이익(보유 시장가치 ÷ SPY PER)이 전체 합산에 포함되고 leg 상태 `included`
2. **Given** ETF PER이 Yahoo에서 정상 반환, **When** 투시 계산, **Then** `netIncomeMine = positionValue / per`로 계산됨
3. **Given** ETF와 개별주식 혼합 보유, **When** 투시 계산, **Then** ETF 귀속분 + 개별주식 귀속분 모두 합산됨

---

### User Story 2 — ETF PER 없는 경우 명확한 안내 (P2)

채권 ETF, 소형 한국 ETF 등 PER이 없는 ETF는 투시에서 제외되지만 이유를 명시한다.

**Independent Test**: TLT(채권 ETF) 보유 시 leg가 `etf_no_per` 상태로 "ETF — PER 데이터 없음" 표시

**Acceptance Scenarios**:

1. **Given** 채권 ETF 보유, **When** 투시 로드, **Then** leg reason "ETF — PER 데이터 없음" 표시 (기존 "구성종목 펼치기 예정" 문구 교체)
2. **Given** Yahoo가 ETF PER null 반환, **When** 투시 계산, **Then** 해당 ETF만 합산 제외, 나머지 자산 정상 합산

---

### Edge Cases

- ETF PER 조회 중 Yahoo 오류: `etf_no_per`로 폴백, 다른 leg 합산 계속 진행
- ETF PER이 0 이하인 경우(적자 ETF): 귀속 순이익 계산 불가 → `etf_no_per` 처리
- 같은 ETF를 여러 계좌에 보유: 각 leg 별도 계산 후 합산 (기존 개별주식과 동일)
- proxySymbol fallback 케이스(한국 ETF → 미국 동일지수 ETF): PER 있으면 포함, 없으면 `etf_no_per`

---

## Requirements

### Functional Requirements

- **FR-001**: `lookThrough.ts` ETF 분류를 `etf_pending` 단일에서 `etf_included` / `etf_no_per`로 분리
- **FR-002**: ETF PER > 0이면 `netIncomeMine = positionValue / per`로 귀속 순이익 산출해 합산
- **FR-003**: ETF PER이 null 또는 ≤ 0이면 `etf_no_per` 상태 leg, 합산 제외
- **FR-004**: `getEtfStats()` 호출은 ETF에 한해서만, 개별주식 경로 변경 없음
- **FR-005**: 기존 `us_pending`·`no_earnings`·`no_disclosure` 동작 불변
- **FR-006**: ETF PER 조회 실패 시 투시 전체 블로킹 없이 해당 ETF만 `etf_no_per` 처리

### Key Entities

- **LegStatus 추가**: `"etf_no_per"` — PER 데이터 없어 합산 제외된 ETF. 기존 `etf_pending` 제거
- **AggItem 변경**: ETF 케이스에 `etfPer: number | null` 필드 추가

---

## Success Criteria

- **SC-001**: SPY·QQQ·KODEX 200 보유 시 투시 PER에 ETF 귀속분이 반영됨
- **SC-002**: 채권 ETF는 "ETF — PER 데이터 없음" 표시, "구성종목 펼치기 예정" 문구 제거
- **SC-003**: ETF 추가로 인한 투시 화면 TTFB 증가 < 500ms (Yahoo `revalidate: 86400` 캐시 활용)
- **SC-004**: `tsc` 클린 · 빌드 통과

## Assumptions

- Yahoo `summaryDetail.trailingPE`가 주요 지수형 ETF(SPY, QQQ, KODEX 200)에 안정적으로 PER 제공
- `getEtfStats()` `revalidate: 86400` 캐시로 반복 호출 비용 없음
- ETF는 revenue·assets·equity·OCF 등 기타 재무항목 없이 순이익(implied earnings)만 합산
- lookthrough 화면 UI 레이아웃 변경 없음 — leg 상태 추가만
