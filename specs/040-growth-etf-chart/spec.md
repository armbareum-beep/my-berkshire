# Feature Specification: 마이버크셔 ETF 배분 차트

**Feature Branch**: `claude/berkshire-etf-portfolio-ui-8ts6rg`
**Created**: 2026-07-12
**Status**: Implemented
**Input**: User description: "마이 버크셔에 etf포트폴리오에 있는 그래프 기능과 UI 내지분실적(look through) 내지분 소식 위쪽에 넣어줘"

## Background

ETF 포트폴리오 페이지(`/etf-portfolio`)에는 보유 ETF의 배분을 ETF/섹터/지역/자산 4개 탭으로 보여주는 인터랙티브 도넛 차트가 있다. 반면 마이버크셔 탭(`/growth`)의 ETF 정보는 텍스트 요약 카드(`EtfSnapshotCard`)뿐이라, 배분을 시각적으로 보려면 ETF 포트폴리오 페이지까지 이동해야 한다.

해결 방향: ETF 포트폴리오 페이지의 도넛 차트(기능·UI 동일)를 마이버크셔 탭의 **"내 지분 실적" 카드 내부 하단 섹션**으로 합쳐 배치한다("ETF 배분" 레이블 + 구분선). 카드 상단(투시 지표 영역)은 기존처럼 `/lookthrough`(내 지분 실적·내 지분 소식 상세) 링크를 유지하고, 차트 영역은 링크 밖이라 탭 전환·세그먼트 하이라이트 인터랙션이 그대로 동작한다.

> 이력: 최초 구현은 카드 "위쪽"에 별도 카드로 배치했으나, 사용자 피드백("내 지분 실적 카드랑 합치는 건 어떻냐")에 따라 카드 내부로 합침.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - ETF 보유자가 마이버크셔에서 배분 차트 확인 (Priority: P1)

ETF를 보유한 사용자가 마이버크셔 탭을 열면, "내 지분 실적" 카드 하단에 "ETF 배분" 섹션으로 도넛 차트가 표시된다. 차트는 ETF 포트폴리오 페이지와 동일하게 ETF/섹터/지역/자산 탭 전환, 세그먼트 하이라이트, 3% 미만 "기타" 묶음을 지원한다. 카드 상단(투시 지표)을 탭하면 기존처럼 `/lookthrough`로 이동하고, 차트 영역 탭은 차트 인터랙션으로 동작한다(내비게이션 아님).

**Independent Test**: ETF+개별주 보유 계좌로 마이버크셔 탭 진입 시 "내 지분 실적" 카드 안에 투시 지표와 ETF 배분 도넛이 한 카드로 렌더링되어야 한다.

**Acceptance Scenarios**:

1. **Given** ETF를 1개 이상 보유한 사용자가, **When** 마이버크셔 탭에 진입하면, **Then** "내 지분 실적" 카드 하단에 ETF 배분 도넛 차트가 표시된다.
2. **Given** 차트가 표시된 상태에서, **When** 탭(ETF/섹터/지역/자산)을 전환하거나 세그먼트를 탭하면, **Then** `/etf-portfolio` 페이지의 차트와 동일하게 동작한다.
3. **Given** 섹터 데이터(Yahoo) 조회가 진행 중일 때, **When** 페이지가 렌더링되면, **Then** 차트 자리에 스켈레톤이 먼저 보이고 완료 시 차트로 교체된다(Suspense 스트리밍 — 페이지 초기 렌더를 막지 않음).

### User Story 2 - ETF 미보유자 / 개별주 미보유자 (Priority: P2)

ETF가 없는 사용자에게는 차트 섹션을 표시하지 않는다(내 지분 실적 카드는 지표만, ETF 잠금 카드는 그대로). 반대로 개별주가 없어 "내 지분 실적"이 잠금인 ETF-only 사용자에게는 차트를 잠금 카드 위에 독립 카드로 표시한다(차트가 사라지지 않도록).

**Acceptance Scenarios**:

1. **Given** ETF를 보유하지 않은 사용자가, **When** 마이버크셔 탭에 진입하면, **Then** 내 지분 실적 카드에 차트 섹션 없이 기존 레이아웃이 유지된다.
2. **Given** 개별주 없이 ETF만 보유한 사용자가, **When** 마이버크셔 탭에 진입하면, **Then** ETF 배분 차트(독립 카드)와 내 지분 실적 잠금 카드가 순서대로 표시된다.

### Edge Cases

- 섹터 조회(Yahoo)가 일부/전부 실패한 경우: 섹터 탭만 비활성화되고 나머지 탭은 정상 동작(기존 `EtfDonutChart` 동작 그대로).
- ETF 1개만 보유: ETF 탭은 단일 세그먼트 100%로 표시.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 마이버크셔 탭은 ETF 보유 시 "내 지분 실적" 카드 하단에 "ETF 배분" 섹션으로 도넛 차트를 표시해야 한다. 개별주 미보유로 카드가 잠금이면 차트는 독립 카드로 표시한다.
- **FR-002**: 차트의 기능과 UI는 `/etf-portfolio` 페이지의 차트와 동일해야 한다(동일 컴포넌트 재사용, 별도 구현 금지).
- **FR-003**: ETF 미보유 시 차트를 렌더링하지 않는다.
- **FR-006**: 카드 상단(투시 지표)의 `/lookthrough` 링크와 차트 인터랙션(탭 전환·세그먼트 선택)은 서로 간섭하지 않아야 한다.
- **FR-004**: 차트 데이터 로딩은 페이지 초기 렌더를 차단하지 않아야 한다(Suspense 스트리밍 + 스켈레톤).
- **FR-005**: `/etf-portfolio` 페이지의 기존 차트 동작은 변경되지 않아야 한다.

### Key Entities

- **ETF 슬라이스**: 보유 ETF별 `{symbol, name, value(평가금액), etfWeight(ETF 내 비중), weight(포트폴리오 비중), ter}`. 기존 마이버크셔의 ETF 분류·TER 계산 결과를 확장해 사용.

---

## Success Criteria *(mandatory)*

- **SC-001**: ETF 보유자가 마이버크셔 탭에서 페이지 이동 없이 ETF 배분(4개 탭)을 확인할 수 있다.
- **SC-002**: 마이버크셔 탭 진입 시 차트 로딩이 다른 카드 표시를 지연시키지 않는다.

---

## Implementation Notes

- `src/app/growth/page.tsx`: 기존 `etfSlices` 계산에 `value`·`etfWeight` 필드와 `totalEtfValue`를 추가. `hasEtf`일 때 `<Suspense fallback={<ChartSkeleton embedded />}><EtfChartStreamed … embedded /></Suspense>` 노드를 만들어 `BusinessSnapshotStreamed`의 `chart` prop으로 전달(데이터 있는 카드·정적 링크 fallback 카드 모두 하단에 차트 섹션 렌더). 개별주 미보유(`!hasStock`) 시에는 잠금 카드 위에 독립 카드(embedded 아님)로 차트 표시.
- `src/components/dashboard/LookThroughCard.tsx`: 카드 전체 `<Link>` 구조를 "카드 div > 상단 Link(지표) + 하단 chart 섹션"으로 재구성하고 `chart?: ReactNode` prop 추가 — 차트의 버튼/탭이 링크 내비게이션과 충돌하지 않도록.
- `src/components/etf/EtfDonutChart.tsx` / `EtfChartStreamed.tsx` / `ChartSkeleton.tsx`: `embedded?: boolean` prop 추가 — 카드 래퍼 없이 다른 카드 내부에 삽입 가능(기본값 false, `/etf-portfolio` 는 기존 그대로).
- `src/app/etf-portfolio/page.tsx`: 로컬 스켈레톤 제거, 공용 `ChartSkeleton` import로 교체. 그 외 변경 없음.
- 재사용: `EtfChartStreamed`(지역/자산 휴리스틱 + Yahoo 섹터 집계), `EtfDonutChart`(탭형 SVG 도넛). 신규 외부 의존·신규 fetch 없음(섹터는 기존 24h 캐시).

## Assumptions

- "내 지분 소식"은 `/lookthrough` 페이지에 있으며 마이버크셔 탭에는 없음. 마이버크셔의 "내 지분 실적" 카드가 해당 페이지로의 진입점이므로, 그 카드 위에 배치하는 것으로 "내 지분 실적·내 지분 소식 위쪽" 요구를 충족한다고 해석.
- 차트 데이터 범위는 ETF 포트폴리오 페이지와 동일하게 **ETF 보유분만** 대상(전체 포트폴리오 아님) — "ETF 포트폴리오에 있는 그래프 기능"을 그대로 가져오는 것이 요구이므로.
