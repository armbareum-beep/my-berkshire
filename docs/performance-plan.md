# 서버 렌더링 및 계산 캐시 개선 계획

> 목표: 전체 페이지 스켈레톤의 반복 표시를 없애고, 무거운 사용자별 계산을 요청마다 반복하지 않는다.

## 원칙

1. 라우트의 `loading.tsx`는 상단 로딩바만 표시한다.
2. Suspense는 독립적으로 느린 섹션에만 둔다.
3. 주가, 환율, DART/EDGAR는 공용 원천 데이터 캐시를 사용한다.
4. 수익률, 순자산, look-through처럼 사용자 포트폴리오에 의존하는 결과는 Supabase snapshot으로 저장한다.
5. 사용자 데이터 변경 직후에는 이전 snapshot이 표시되지 않도록 revision으로 무효화한다.
6. snapshot이 오래됐지만 사용 가능한 경우에는 기존 결과를 먼저 표시하고 뒤에서 갱신한다.

## 현재 상태

- [x] 모든 route-level 전체 페이지 스켈레톤을 `RouteLoadingBar`로 교체
- [x] Dashboard를 섹션별 Suspense 경계로 분리
- [x] Networth를 요약, 차트, 계좌, 자산, 부채 섹션으로 분리
- [x] Lookthrough의 중복 본문 스켈레톤 제거
- [x] Stock 상세 가격 차트를 별도 Suspense 경계로 분리
- [x] `fundamentals_cache`를 통한 DART/EDGAR 원천 데이터 캐시

## 1. 기준 성능 측정

- [x] 서버 데이터 로더에 개발 환경 전용 timing helper 추가
- [ ] 인증, DB 조회, 외부 API, 계산 시간을 분리해 기록
- [ ] 주요 페이지 cold/warm TTFB 기록
- [ ] 작업 완료 후 제거할 임시 로그와 유지할 관측 코드를 구분

2026-06-19 1차 측정:

- Lookthrough cold: 약 9.9초
- Lookthrough warm snapshot: 약 1.1초
- Returns/Networth/Report shared snapshot: 각 약 1.5초
- Allocation: 약 2.47초
- Accounts: 약 1.39초
- Holdings: 약 0.91초
- Company: 약 0.85초

대상 페이지:

- `/dashboard`
- `/lookthrough`
- `/returns`
- `/report`
- `/networth`
- `/stocks/[symbol]`
- `/allocation`
- `/dividends`

## 2. 사용자별 계산 snapshot 기반

### portfolio revision

holding 단위 revision을 관리한다. 다음 데이터가 변경되면 revision을 증가시킨다.

- events 및 transactions
- accounts
- liabilities
- manual_assets
- target_weights, category_targets, active_plan
- 수동 fundamentals/valuation assumptions

가능하면 DB trigger로 revision 증가를 보장하고, Server Action에서는 cache invalidation도 함께 수행한다.

### calculation_snapshots

초기 제안 필드:

- `user_id`
- `holding_id`
- `kind`
- `portfolio_revision`
- `as_of_date`
- `parameters_hash`
- `data jsonb`
- `status`: fresh, stale, computing, failed
- `computed_at`
- `expires_at`
- `error_message`

규칙:

- RLS로 본인 snapshot만 읽고 쓸 수 있게 한다.
- 동일 holding/kind/revision/date/parameters 조합은 하나만 저장한다.
- 계산 통화는 KRW로 고정하고 USD 변환은 렌더 시 처리한다.
- 계산 실패 시 직전 성공 snapshot을 보존한다.

## 3. Lookthrough 우선 전환

- [x] 현재 합산 결과를 `lookthrough-current` snapshot으로 저장
- [x] 분기별 추이를 `lookthrough-series` snapshot으로 저장
- [x] 사업부 플래그를 `lookthrough-flags` snapshot으로 저장
- [x] Dashboard 카드와 상세 페이지가 같은 current snapshot 공유
- [x] fresh snapshot은 즉시 반환
- [x] stale snapshot은 즉시 표시 후 백그라운드 갱신 (getOrComputeSnapshot: 만료 시 즉시 반환 + after() 백그라운드 재계산)
- [x] snapshot이 없을 때만 계산하고 최소 fallback 표시
- [x] 동일 요청에서 중복 계산되지 않도록 Promise dedupe 적용

## 4. 공통 포트폴리오 가치 시계열

다음 화면이 공유하는 일별 가치 시계열을 한 번만 계산한다.

- Returns
- Report
- Networth
- Dashboard
- PnL

구현 항목:

- [x] `portfolio-value-series` snapshot 추가
- [x] 거래 revision과 가격 기준일을 key에 포함
- [ ] 전 기간 재계산 대신 마지막 계산일 이후 증분 갱신 검토
- [ ] 휴장일 및 누락 가격 fallback 규칙 테스트
- [x] Returns, Report, Networth의 중복 `getDailyKrwCloses` 호출 제거

## 5. 페이지별 전환 순서

### 1차: 계산량이 큰 화면

1. Lookthrough
2. Returns
3. Report
4. Networth
5. Stocks 상세

### 2차: 여러 데이터 소스를 합치는 화면

1. Dashboard
2. Allocation 및 하위 화면
3. Dividends
4. Style
5. Rebalance
6. PnL

### 3차: DB 조회 중심 화면

1. Accounts
2. Holdings
3. Activity
4. Cash
5. Company

3차 화면은 snapshot보다 아래 작업을 우선한다.

- 독립 쿼리 병렬 실행
- accounts/events 중복 조회 제거
- 필요한 DB index 추가
- 왕복 횟수가 많은 경우 Supabase RPC 검토

## 6. Stock 상세

- [x] 기존 `fundamentals_cache` 재사용
- [ ] 가격 시계열과 공시 데이터의 캐시 수명 분리
- [ ] 상단 종목/보유 정보는 다른 계산을 기다리지 않도록 유지
- [ ] 가격 차트 외 공시, fundamentals, 가치평가를 독립 로더로 분리
- [ ] 수동 assumptions 수정 시 해당 종목 snapshot 즉시 무효화

## 7. UI 로딩 규칙

- route-level 전체 스켈레톤을 다시 추가하지 않는다.
- 이미 표시된 실제 콘텐츠를 스켈레톤으로 되돌리지 않는다.
- 동일 데이터 Promise를 기다리는 카드 여러 개에 각각 큰 fallback을 만들지 않는다.
- 차트처럼 고정 크기가 필요한 영역만 레이아웃 보존용 fallback을 사용한다.
- stale snapshot이 있으면 스켈레톤 대신 기존 값을 표시한다.

## 8. 검증

- [ ] snapshot RLS 테스트
- [ ] revision 증가 및 무효화 테스트
- [ ] 거래 추가/수정/삭제 직후 최신 데이터 확인
- [ ] 부채와 수동자산 변경 직후 Dashboard/Networth 갱신 확인
- [x] (구현) 계산 실패 시 마지막 성공 snapshot 폴백 — getOrComputeSnapshot.readLastGood
- [ ] (검증) snapshot 계산 실패 시 직전 성공 데이터 표시 확인
- [x] TypeScript 검사
- [x] production build
- [ ] 주요 페이지 cold/warm 성능 비교
- [ ] 모바일/데스크톱에서 로딩 중 레이아웃 점프 확인

## 완료 기준

- 전체 페이지 스켈레톤이 두 번 나타나지 않는다.
- warm 진입에서는 주요 숫자와 카드가 즉시 표시된다.
- 동일한 가치 시계열 및 공시 계산을 페이지마다 반복하지 않는다.
- 사용자 데이터 변경 직후 잘못된 이전 snapshot이 표시되지 않는다.
- 외부 API 장애가 있어도 마지막 성공 데이터로 주요 화면을 사용할 수 있다.
- 타입 검사와 production build가 통과한다.
