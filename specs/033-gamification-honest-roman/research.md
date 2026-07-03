# Phase 0 Research — 033 게이미피케이션 강화

> Technical Context에 NEEDS CLARIFICATION은 없다(설계 결정은 2026-07-03 코드 전수 탐색 + 사용자 확정 라운드에서 완료). 이 문서는 그 결정들의 근거·대안을 speckit 형식으로 고정한다.

## R1. 드로다운 낙폭 산정 방식

- **Decision**: 흐름조정 TWR(Time-Weighted Return) 체인 — `invested` 일별 증분을 순자본흐름으로 보고 일수익률을 체인(`index_t = index_{t-1}×(1+r_t)`), 러닝 피크 대비 낙폭 판정. 초기 잔고 1만원 하한 가드.
- **Rationale**: 원시 평가액으로 판정하면 **인출만으로 가짜 드로다운**이 생기고 증자가 가짜 회복이 된다(FR-002 위반). TWR 체인은 입출금을 성과에서 분리하는 표준 기법이며, `ValuePoint { date, value, invested }`가 이미 필요한 두 값을 제공한다.
- **Alternatives considered**: ① 원시 `value` 기준(기각 — 입출금 왜곡), ② XIRR 기반(기각 — 기간 산정용이지 일별 피크/트로프 판정 불가), ③ 입출금일 제외 후 value 비교(기각 — 부분 인출 케이스에서 부정확).

## R2. 에피소드 저장 vs 결정적 재계산

- **Decision**: 저장하지 않고 매 요청 결정적 재계산. 새 DB 테이블·`calculation_snapshots` kind 없음.
- **Rationale**: 원천(events+종가 캐시)에서 항상 동일하게 유도 가능(FR-014). 저장하면 과거 시세 조정·거래 정정 시 저장본과 재계산본이 어긋나는 정합 문제(헌장 V)가 생긴다. 계산 비용은 순수 CPU 수 ms(R3).
- **Alternatives considered**: ① `calculation_snapshots`에 에피소드 저장(기각 — 무효화 규칙이 필요해지고 정직 재판정 원칙과 충돌), ② 연혁 테이블 신설(기각 — 파생 데이터의 이중 진실원천).

## R3. 드로다운 데이터 소스

- **Decision**: `loadPortfolioValueSeries`가 1h TTL로 캐시한 일별 종가(`closes`)를 재사용, `buildValueSeries`를 maxPoints 충분히 크게(다운샘플 없이) 재호출해 전체 해상도 시리즈 재구성.
- **Rationale**: 신규 가격 fetch 0 — /report·/returns·/networth가 같은 스냅샷을 쓰므로 대개 웜 캐시. 120포인트 다운샘플 시리즈는 피크/트로프를 뭉개 판정 부정확.
- **Alternatives considered**: ① 다운샘플 `points` 재사용(기각 — 정확도), ② 별도 시세 조회(기각 — 비용·중복).

## R4. 계획 완수 이력 보관

- **Decision**: `holdings.archived_plans jsonb not null default '[]'` 컬럼 1개, 계획 교체/삭제 직전 append, FIFO 20개 한도. 완수일은 저장하지 않고 `planCompletionDate(plan, events)`로 매번 재판정.
- **Rationale**: 현재 `active_plan` 덮어쓰기로 과거 계획이 소실돼 연혁 생성이 불가능했다. 완수 "여부/일자"까지 저장하면 events 정정 시 어긋나므로 계획 원문만 보관하고 판정은 원장에서(헌장 V).
- **Alternatives considered**: ① 별도 `plans` 테이블(기각 — 1인 가족 장부 규모에 과설계, RLS·조인 비용), ② 완수 시점 즉시 연혁 테이블 기록(기각 — R2와 동일한 이중 진실원천 문제).

## R5. 등급 기록·비교 방식

- **Decision**: 기존 style-history 스냅샷(`calculation_snapshots`)에 옵셔널 `score`/`gradeLabel` 추가, **`VERSION="v1"` 유지**. `loadLatestStyleSnapshot`(범용 최신 1건 조회) 신설, 홈에서 최신 2건 비교로 등급업 감지(분기당 1회 key).
- **Rationale**: 옵셔널 필드 추가는 JSON 하위호환 — v2로 올리면 `loadPreviousStyleSnapshot`이 과거 행을 못 찾아 /style 분기 비교가 전부 끊긴다. 홈에서 `computeStyle` 재계산 없이 DB 읽기 2건이면 충분(성능 SC-006).
- **Alternatives considered**: ① VERSION v2(기각 — 과거 비교 단절), ② 홈에서 computeStyle 재계산 후 비교(기각 — 홈 비용 증가), ③ 등급업 이벤트 테이블(기각 — R2와 동일).

## R6. 축하 배선 위치

- **Decision**: `dashboard/page.tsx`의 `HomeSignalsStreamed`(기존 Suspense 경계 안, `computeCelebrations` 호출부)에서 드로다운·등급업 입력을 만들어 opts로 전달. 중복 방지는 기존 `home_signal_dismissals` 결정적 key(`dd-pass:{recoveryDate}:{bucket}`, `grade-up:{quarterLabel}`) 재사용.
- **Rationale**: 첫 페인트 비차단(SC-006)이 이미 보장된 경계. 축하 창(14일)·디스미스·자연 만료 인프라를 전부 재사용해 신규 상태 저장 0.
- **Alternatives considered**: ① `computeDashboard` 내부(기각 — 동기 함수에 비동기 시리즈 주입 불가), ② 새 배너 컴포넌트(기각 — 기존 HomeSignalBanner 큐로 충분).

## R7. 연혁 병합 위치

- **Decision**: 드로다운·주년·완수 마일스톤은 `/timeline`·`/growth` **페이지 레벨에서** 기존 `data.timeline`과 merge+정렬. `journeyMilestones`는 동기 확장(today·archivedPlans 인자 추가)만.
- **Rationale**: 드로다운은 비동기 가격 시리즈가 필요해 동기 `computeDashboard` 안에 넣을 수 없다. 주년·완수는 동기 가능하므로 기존 함수 확장이 자연스럽다.
- **Alternatives considered**: `computeDashboard` 비동기화(기각 — 호출부 전체 파급, 위험 대비 이득 없음).

## R8. "회장님" 카피 범위

- **Decision**: 정적 레이블·인사말 4지점만 교체(분기 결산 부제·히어로 인사·연차보고서 섹션 제목/헤더·잠금 카피). CFO 코멘트 생성 로직(buildComment/cfoComment)은 무수정.
- **Rationale**: 사용자가 CFO 리포트 고도화를 명시적으로 보류(경계 확인 완료 — "호칭 통일만" 확정). 카피 교체는 로직 회귀 위험 0.
- **Alternatives considered**: 연차보고서 "주주에게 보내는 글" 룰기반 산문 추가(기각 — 사용자가 이번 범위에서 제외 결정).
