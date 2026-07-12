# Feature Specification: 마이버크셔 ETF 배분 차트

**Feature Branch**: `claude/berkshire-etf-portfolio-ui-8ts6rg`
**Created**: 2026-07-12
**Status**: Implemented
**Input**: User description: "마이 버크셔에 etf포트폴리오에 있는 그래프 기능과 UI 내지분실적(look through) 내지분 소식 위쪽에 넣어줘"

## Background

ETF 포트폴리오 페이지(`/etf-portfolio`)에는 보유 ETF의 배분을 ETF/섹터/지역/자산 4개 탭으로 보여주는 인터랙티브 도넛 차트가 있다. 반면 마이버크셔 탭(`/growth`)의 ETF 정보는 텍스트 요약 카드(`EtfSnapshotCard`)뿐이라, 배분을 시각적으로 보려면 ETF 포트폴리오 페이지까지 이동해야 한다.

해결 방향: ETF 포트폴리오 페이지의 도넛 차트 **UI**(탭·세그먼트 하이라이트·기타 묶음)를 재사용하되, 데이터는 **개별주(비ETF: 주식·코인·원자재) 배분**으로 바꿔 마이버크셔 탭의 "내 지분 실적" 카드 하단 "종목 배분" 섹션에 넣는다. 탭 구성: 종목(슬리브 내 비중)/섹터(`securities.sector`, DART·EDGAR backfill)/지역(국가 태그)/자산(주식·코인·원자재). 카드 상단(투시 지표)은 기존처럼 `/lookthrough` 링크, 차트 영역은 링크 밖이라 인터랙션이 그대로 동작한다. ETF 카드·ETF 포트폴리오 페이지는 변경하지 않는다.

> 이력: ① 최초 구현은 ETF 데이터 차트를 내 지분 실적 카드 "위쪽"에 별도 카드로 배치 → ② 피드백으로 내 지분 실적 카드 내부로 합침 → ③ "내 지분 실적은 개별주 영역" 피드백으로 ETF 카드로 이동 → ④ "그래프를 주식 그래프로 바꾸라고(ETF 말고)" 피드백으로 **내 지분 실적 카드 + 개별주 데이터**로 확정(최종).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 개별주 보유자가 마이버크셔에서 종목 배분 차트 확인 (Priority: P1)

개별주를 보유한 사용자가 마이버크셔 탭을 열면, "내 지분 실적" 카드 하단 "종목 배분" 섹션에 도넛 차트가 표시된다. 차트는 ETF 포트폴리오 페이지와 동일한 UI로 종목/섹터/지역/자산 탭 전환, 세그먼트 하이라이트, 3% 미만 "기타" 묶음을 지원하며, 데이터는 개별주(비ETF) 기준이다. 카드 상단(투시 지표)을 탭하면 기존처럼 `/lookthrough`로 이동하고, 차트 영역 탭은 차트 인터랙션으로 동작한다(내비게이션 아님).

**Independent Test**: 개별주 보유 계좌로 마이버크셔 탭 진입 시 "내 지분 실적" 카드 안에 투시 지표 + 종목 배분 도넛이 렌더링되어야 한다.

**Acceptance Scenarios**:

1. **Given** 개별주를 1개 이상 보유한 사용자가, **When** 마이버크셔 탭에 진입하면, **Then** "내 지분 실적" 카드 하단에 종목 배분 도넛 차트가 표시된다.
2. **Given** 차트의 섹터 탭에서, **When** 섹터가 아직 조회되지 않은 종목이 있으면, **Then** 공시 API(DART/EDGAR)로 채워 표시하고 실패분은 "미분류"로 묶는다. 코인·원자재는 자산유형으로 분류한다.
2. **Given** 차트가 표시된 상태에서, **When** 탭(ETF/섹터/지역/자산)을 전환하거나 세그먼트를 탭하면, **Then** `/etf-portfolio` 페이지의 차트와 동일하게 동작한다.
3. **Given** 섹터 데이터(Yahoo) 조회가 진행 중일 때, **When** 페이지가 렌더링되면, **Then** 차트 자리에 스켈레톤이 먼저 보이고 완료 시 차트로 교체된다(Suspense 스트리밍 — 페이지 초기 렌더를 막지 않음).

### User Story 2 - 개별주 미보유자 (Priority: P2)

개별주가 없는 사용자에게는 차트를 표시하지 않는다. "내 지분 실적" 잠금 카드("개별주를 보유하면 열립니다")가 기존대로 안내 역할을 유지한다. ETF 카드는 이 기능과 무관하게 원래 모습(텍스트 목록 + TER)이다.

**Acceptance Scenarios**:

1. **Given** 개별주 없이 ETF만 보유한 사용자가, **When** 마이버크셔 탭에 진입하면, **Then** 차트 없이 기존 레이아웃(내 지분 실적 잠금 카드 → ETF 카드)이 유지된다.

### Edge Cases

- 섹터 조회(Yahoo)가 일부/전부 실패한 경우: 섹터 탭만 비활성화되고 나머지 탭은 정상 동작(기존 `EtfDonutChart` 동작 그대로).
- ETF 1개만 보유: ETF 탭은 단일 세그먼트 100%로 표시.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 마이버크셔 탭은 개별주 보유 시 "내 지분 실적" 카드 하단에 개별주(비ETF) 배분 도넛 차트를 표시해야 한다. 데이터는 종목/섹터/지역/자산 4개 차원.
- **FR-002**: 차트의 UI는 `/etf-portfolio` 페이지의 차트와 동일해야 한다(동일 컴포넌트 `EtfDonutChart` 재사용, 별도 구현 금지). 첫 탭 라벨만 "ETF" 대신 "종목".
- **FR-003**: 개별주 미보유 시 차트를 렌더링하지 않는다.
- **FR-004**: 차트 데이터 로딩(섹터 backfill 포함)은 페이지 초기 렌더를 차단하지 않아야 한다(Suspense 스트리밍 + 스켈레톤).
- **FR-005**: `/etf-portfolio` 페이지의 기존 차트와 마이버크셔 ETF 카드의 기존 동작은 변경되지 않아야 한다.
- **FR-006**: 카드 상단의 `/lookthrough` 링크와 차트 인터랙션(탭 전환·세그먼트 선택)은 서로 간섭하지 않아야 한다.

### Key Entities

- **종목 슬라이스**: 보유 개별주(비ETF)별 `{symbol, name, stockWeight(개별주 슬리브 내 비중), countryTag}`. 섹터·자산유형은 `securities` 메타(`loadSecurityMeta` + `backfillSectors`)에서 조회.

---

## Success Criteria *(mandatory)*

- **SC-001**: 개별주 보유자가 마이버크셔 탭에서 페이지 이동 없이 종목 배분(4개 탭)을 확인할 수 있다.
- **SC-002**: 마이버크셔 탭 진입 시 차트 로딩이 다른 카드 표시를 지연시키지 않는다.

---

## Implementation Notes

- `src/components/growth/StockChartStreamed.tsx`(신규): 개별주 슬라이스 + `securities` 메타로 종목/지역/자산 데이터셋을 동기 계산하고, 섹터는 `secMeta.sector` + `backfillSectors`(DART/EDGAR, `/allocation`·`/rebalance` 페이지와 동일 경로)로 채워 `EtfDonutChart`에 전달. 코인·원자재는 섹터 대신 자산유형으로 분류, 미확인은 "미분류".
- `src/app/growth/page.tsx`: `hasStock`일 때 `<Suspense fallback={<ChartSkeleton embedded />}><StockChartStreamed … embedded /></Suspense>` 노드를 만들어 `BusinessSnapshotStreamed`의 `chart` prop으로 전달(데이터 카드·정적 링크 fallback 카드 모두 하단 "종목 배분" 섹션 렌더).
- `src/components/dashboard/LookThroughCard.tsx`: 카드 전체 `<Link>` 구조를 "카드 div > 상단 Link(지표) + 하단 chart 섹션"으로 재구성하고 `chart?: ReactNode` prop 추가 — 차트의 버튼/탭이 링크 내비게이션과 충돌하지 않도록.
- `src/components/etf/EtfDonutChart.tsx`: `embedded?: boolean`(카드 래퍼 없이 삽입)·`shareLabel?: string`(첫 탭 라벨, 기본 "ETF") prop 추가 — `/etf-portfolio` 기본 동작 불변. `EtfChartStreamed.tsx`의 `aggregate` 헬퍼 export 재사용.
- `src/app/etf-portfolio/page.tsx`: 로컬 스켈레톤 제거, 공용 `ChartSkeleton` import로 교체. 그 외 변경 없음.
- 신규 외부 의존 없음. 섹터 backfill은 기존 멱등 로직 재사용(한 번 채워지면 이후 즉시 읽음).

## 관련 수정: 혼합형 ETF 분류 (같은 브랜치)

ETF 페이지 차트에서 KODEX 200미국채혼합(코스피200 40% + 미국채 선물 60%, 공시 지수 비율)이 이름 키워드 "미국" 때문에 지역 100% 미국으로, "국채" 때문에 자산 100% 채권으로 분류되던 문제. 비율 분할(카탈로그 등록) 대신 **"혼합" 버킷으로 분리**하기로 결정(사용자 선택 — 수많은 혼합 ETF를 일일이 등록하는 부담 회피, 정직한 표기).

- `EtfChartStreamed.tsx`: `isMixed(name)`(혼합/TDF/멀티에셋) 추가. 지역 탭 — 혼합형이면 "혼합" 버킷(다른 지역 키워드보다 우선). 자산 탭 — 혼합 판별을 채권 판별보다 먼저(기존엔 "미국채혼합"의 "국채"가 먼저 걸림).
- 참고: 구성종목 캐시(`etf_holdings_cache`)는 주식 상위 10개만 담아 미국채 선물이 안 잡히므로 look-through 분할은 불가(조사로 확인).

## 관련 수정 2: "기타" 조각 구성 펼침 (같은 브랜치 계열)

도넛 차트는 비중 3% 미만 조각을 "기타"로 묶는데(예: 백산 등 소형 포지션), 안에 뭐가 있는지 확인할 방법이 없었다. "기타" 조각(세그먼트 또는 범례)을 탭하면 범례 아래에 묶인 조각들의 이름·비중이 내림차순으로 펼쳐진다(다시 탭하면 접힘). `EtfDonutChart`의 `groupSmall`이 묶인 원본 조각을 `parts`로 보존하고 범례가 선택 시 하위 목록을 렌더 — ETF 페이지·종목 배분 차트 공통 적용.

## Assumptions

- "내 지분 소식"은 `/lookthrough` 페이지에 있으며 마이버크셔 탭에는 없음. 마이버크셔의 "내 지분 실적" 카드가 해당 페이지 진입점.
- "주식 그래프"의 범위는 비ETF 직접 보유분 전체(주식·코인·원자재) — `hasStock` 판별 기준(`assetType !== "ETF"`)과 동일.
