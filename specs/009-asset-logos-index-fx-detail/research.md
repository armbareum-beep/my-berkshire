# Phase 0 Research: 종목 로고 · 지수 지표 · 환율 상세

조사는 코드 직접 확인으로 수행. 파일·라인 근거를 함께 둔다.

## R1. 자산 유형별 로고 출처 (User Story 1)

**현재 상태**
- `src/components/ui/Avatar.tsx:47-56` — `logoUrl(symbol)`이 Google favicon(`s2/favicons?domain=`)을 KR/US 하드코딩 도메인 맵(~35개)으로만 반환, 나머지는 null.
- `src/lib/finance/brandColor.ts` — null일 때 텍스트 폴백: 큐레이트 브랜드색 + 해시 HSL, ETF는 운용사 약칭(`ETF_BRANDS`).
- `src/components/ui/Flag.tsx` + `public/flags/{cc}.svg` — 통화/국가 국기 SVG가 이미 존재(이모지 깨짐 회피 목적).
- `src/lib/finance/quotes.ts` — `PRESET_QUOTES`가 지수(`isIndex`,`country`)·환율(`=X`)·크립토(`BTC-USD`)를 이미 구분.

**Decision**: 자산을 4유형으로 분류하는 단일 순수 함수 `assetImage(symbol, name, opts)` 신설. 유형별 이미지 출처:

| 유형 | 분류 규칙 | 이미지 출처 | 폴백 |
|------|-----------|-------------|------|
| 암호화폐 | `symbol` 이 `-USD`로 끝나거나 코인 세트 | 로컬 `public/coins/{slug}.svg`(btc·eth…) | 글자 동그라미 |
| 지수/국가 | `symbol` 이 `^`로 시작(또는 PRESET `isIndex`) | 로컬 국기 SVG `public/flags/{cc}.svg`(국가코드 매핑) | 글자 동그라미 |
| 운용사(ETF) | 6자리 코드 + 이름이 ETF 브랜드 접두(`KODEX`…) | 운용사 favicon 도메인 맵(`samsungfund.com` 등) | 운용사 약칭(기존) |
| 기업 | 그 외(6자리 KR 코드/US 티커) | favicon 도메인 맵(확장) | 글자 동그라미 |

**Rationale**: 기존에 검증된 4개 메커니즘(favicon·국기 SVG·운용사 분류·프리셋 분류)을 재사용해 **신규 외부 유료 의존 0**(헌장 Additional Constraints 부합). 한 함수로 모아 모든 아바타 사용처가 자동 일관(FR-004). 100% 실제 로고는 목표 아님 — 미보유는 폴백(FR-003, SC-002).

**Alternatives considered**
- 범용 로고 API(Clearbit/financial logo 등): 신규 외부 의존·유료/요청제한 → 헌장 위반, 기각.
- DB `logo_url` 컬럼 추가: 수작업 큐레이션 부담·스키마 변경. 정적 맵으로 충분 → 기각(추후 필요 시 확장 여지만 남김).
- 크립토 아이콘 CDN(jsdelivr cryptocurrency-icons): 외부 의존. 보유 코인 소수 → 로컬 SVG가 단순·확실. 기각.

**운용사→도메인 맵(초안, 운용사 favicon)**: KODEX=samsungfund.com, TIGER=tigeretf.com, KBSTAR/RISE=kbam.co.kr, SOL=samsungfund? (→ 신한자산운용 = savpartners? 실제 도메인 구현 시 확정), ARIRANG/PLUS=hanwhafund.co.kr, HANARO=nhamundi.com, ACE=kiwoomam.com… → **구현 시 각 운용사 공식 도메인 1차 확인**, 불확실하면 약칭 폴백 유지(헌장 II: 추측 이미지 금지).

## R2. 코스피 지수 PER 미표시 원인 (User Story 2)

**증거 체인**
- `src/components/index/IndexValuation.tsx:24-43` — PER/Forward/PBR/ROE/배당 셀, 값 없으면 일괄 `"—"`.
- `src/lib/finance/indexStats.ts:161` — `trailingPE: krxData?.per ?? proxyData?.trailingPE ?? indexData?.trailingPE`. 한국 지수는 ETF 프록시 없음(`:19` 주석), 야후 지수는 PE 미제공 → **`krxData?.per`가 유일한 출처**.
- `:162` — `forwardPE: proxyData?.forwardPE ?? indexData?.forwardPE` → 한국 지수 항상 null(KRX를 보지 않음·KRX엔 선행 PER 없음).
- `getKrxIndexStats()` `:121-143` — `krx_index_stats_cache`에서 읽음. 캐시 비면 null.
- `scripts/syncKrxIndexStats.ts` — 캐시 충전은 **Playwright 인터랙티브 로그인 수동 배치**(`npm run sync:krx-index`). 스케줄러 없음.

**Decision (원인 2층)**
1. **운영 원인(주):** `krx_index_stats_cache`가 미충전/만료면 KOSPI의 PER·PBR·배당이 모두 null → 전부 "—". 가장 유력한 "안 뜸"의 실제 원인. → 구현 시 캐시 상태 확인(행 존재·`synced_at` 신선도), 비었으면 `npm run sync:krx-index` 1회 실행으로 충전.
2. **코드 원인(부):** Forward PER 비대칭 폴백. → 사용자 결정대로 **Forward PER 셀·타입·페치 제거**(예측값·국내외 출처 없음).

**UX 처리**: 셀을 3상태(값 있음 / 정보 없음(영구) / 데이터 준비 중(미동기화))로 표기(헌장 II 중립 톤). 한국 지수에서 `krxData`가 null이면 "데이터 준비 중", 그 외 출처상 본질적 결측은 "정보 없음".

**Rationale**: 없는 값을 만들지 않고(헌장 II) 상태를 정직하게 구분. 출처 있는 지표(PER·PBR·배당)는 캐시만 채우면 즉시 표시(SC-003).

**Alternatives**: KRX 싱크 자동화(cron/edge) — 가치 있으나 본 기능 범위 밖(별도 운영 작업). 이번엔 "검증+1회 충전 + 상태 표기"로 한정.

## R3. 환율 상세 시계열·라우팅 (User Story 3)

**Decision — 데이터**: 신규 API 불요.
- 현재 환율: `getFxToKrw([code])` (`src/lib/finance/fx.ts:74`).
- 추이: `getDailyKrwCloses(["{CCY}KRW=X"], from, to, interval)` (`prices.ts:343`). `USDKRW=X`의 야후 통화=KRW → ₩환산 ×1이라 **환율값 시계열을 그대로** 반환. 일봉 1년 + 월봉 전체로 기존 `PriceChart` 재사용.
- 일간 변동·52주 고저: 일봉 시리즈에서 파생(마지막 vs 직전 종가, min/max). 추가 소스 불필요.

**Decision — 라우팅**: `/index/[symbol]`(`app/index/[symbol]/page.tsx`)을 미러링.
- `app/fx/[code]/page.tsx`: `<main> + BottomTabBar + BackButton + FxDetailContent`(FR-014 동일 크롬).
- 본문 공유 패턴(페이지 ↔ `@sheet/(.)fx/[code]`)도 기존 index/cash와 동일하게 둘 수 있음(선택). 우선 전체 페이지 구현, 바텀시트는 기존 패턴 정합 시 추가.
- 진입: `cash/page.tsx:122-142` 환율 탭 통화 행을 `<Link href="/fx/{code}">`로 감싼다.

**지원 통화**: `CURRENCIES`(`currencies.ts:22`)의 KRW 제외 — USD·JPY·EUR. `currencyMeta`로 이름·국기(`cc`) 제공. EUR은 `EURKRW=X` 프리셋이 없지만 `getDailyKrwCloses`/`getFxToKrw`가 임의 통화쌍 처리(코드값으로 동작), 차트 실패 시 현재 환율만 표시(FR-015·SC-005).

**Rationale**: 기존 인프라 100% 재사용 → 신규 외부 의존 0, 상세 패턴 일관(SC-006).

**Alternatives**: KIS/토스 캔들 — 별도 구현 필요, 야후로 충분 → 기각.

## R4. 품질·검증

- 변경 파일 `npx tsc --noEmit`·`npx eslint` 클린(헌장 워크플로).
- 순수 함수 단위테스트: `assetImage`(유형 분류·폴백 경계), 지수 지표 셀 상태 매핑.
- 실제 구동/스크린샷(`run`/`verify`): 보유·검색 4유형 로고, KOSPI 지표(캐시 충전 후), USD/JPY 환율 상세.
- 마이그레이션 없음(기존 캐시 테이블 사용). 운용사·코인 맵은 코드/정적 자산.
