# API 설계도 (개발자 참고용) v1

> 이 프로젝트의 **모든 API 표면**을 한 곳에 모은 설계도. 향후 다른 클라이언트(모바일 앱 등)를 만드는 개발자가 백엔드 계약·데이터 흐름·외부 연동을 파악하는 기준 문서다.
> 시세 소스 교체(야후→토스/한투)의 상세는 [toss-migration-spec-v1.md](./toss-migration-spec-v1.md) 참조.

---

## 0. 아키텍처 한눈에

```
[UI: Next.js App Router / React]
   │  (client: searchSymbols/fetchQuotes, server components)
   ▼
[내부 경계]
   ├─ Route Handlers   src/app/api/**        (검색·시세·import)
   ├─ Server Actions   src/app/*/actions.ts  (DB 쓰기·도메인 로직)
   └─ Seam 인터페이스  src/lib/finance/*      (외부소스 격리)
   ▼
[외부]
   ├─ 시세/검색  : 야후(현재) → 토스/한투(예정)   ── 교체 가능 seam
   ├─ 펀더멘털   : DART(한국) · SEC EDGAR(미국)
   ├─ ETF/지수   : KRX(캐시) · 야후
   ├─ 매크로     : World Bank (버핏지수)
   ├─ AI 파싱    : Anthropic Claude (import)
   └─ 백엔드     : Supabase (Auth + Postgres + RLS)
```

**설계 원칙**
- **이벤트 소싱**: 모든 포트폴리오 상태는 `events` 로그에서 파생(별도 포지션 테이블 없음, `positions`는 VIEW).
- **소스 격리 seam**: 시세·검색·환율은 인터페이스 뒤에 숨겨 외부소스 교체가 라우트/lib 본문 교체로 끝남.
- **기능통화 KRW**: 모든 금액 ₩ 저장, 외화는 native currency + fx_rate 병행 보관.
- **RLS 경계**: 모든 사용자 데이터는 `holdings.user_id` 기준으로 격리.
- **소프트 삭제·상쇄**: `deleted_at`·`reverses_event_id`로 감사추적 보존.

---

## 1. 외부 데이터 제공자

| 제공자 | 용도 | 인증 | env | 주요 파일 | 상태/교체 |
|---|---|---|---|---|---|
| **Yahoo Finance** | 시세·환율·과거차트·배당·ETF/지수 펀더멘털·프로필 | 없음(crumb) | – | `prices.ts`·`fx.ts`·`dividends.ts`·`etfStats.ts`·`indexStats.ts`·`benchmark.ts`·`companyProfile.ts`·`yahooCrumb.ts` | 시세는 토스/한투로 교체 예정, 펀더멘털류는 잔존 |
| **SEC EDGAR** | 미국 공시·펀더멘털(XBRL)·SIC섹터·사업개요 | 없음(User-Agent 필수) | – | `edgar.ts` | 활성 |
| **OpenDART** | 한국 공시·재무·corp_code·업종(KSIC) | API Key | `OPENDART_API_KEY` | `dart.ts`·`sector.ts` | 활성 |
| **KRX** | 한국 ETF TER·구성종목 | 없음(스크립트 동기화→Supabase 캐시) | – | `krxEtf.ts`·`krxEtfHoldings.ts` (+ `scripts/syncKrx*`) | 활성 |
| **World Bank** | 버핏지수(시총/GDP) 매크로 | 없음 | – | `macroStats.ts` | 활성 |
| **Anthropic Claude** | import 파일(엑셀/CSV) AI 파싱 | API Key | `ANTHROPIC_API_KEY` | `api/import/parse/route.ts` (모델 `claude-haiku-4-5-20251001`) | 활성 |
| **Supabase** | Auth + Postgres + RLS | anon/service key | `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`·`SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/*` | 활성 |
| **토스증권 Open API** | 시세·검색·환율·캔들(예정) | OAuth2 Client Credentials | `TOSS_API_CLIENT_ID`·`TOSS_API_CLIENT_SECRET` | (미구현) | 승인 대기 |
| **한국투자(KIS)** | 검색(종목마스터)·현재가·환율 | OAuth2 appkey/secret→토큰(24h) | `KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_BASE_URL` | `lib/finance/kis/*`·`kisMaster.ts`·`scripts/syncKisMaster.ts` | **구현됨**(`FINANCE_SOURCE=kis`). 과거차트는 야후 유지 |

> 외부 시세를 **여러 사용자에게 재배포**하면 라이선스가 필요(코스콤/KRX). §10 참조.

### 1-1. 주요 외부 엔드포인트 (요약)
- **Yahoo**: `query1/2.finance.yahoo.com` — `/v8/finance/chart/{sym}`(시세·차트·배당 `events=div`), `/v10/finance/quoteSummary/{sym}`(프로필·ETF topHoldings·TER, crumb 필요), `/v1/finance/search`(검색). 환율 `{CCY}KRW=X`.
- **EDGAR**: `data.sec.gov` — `/submissions/CIK{cik}.json`(공시), `/api/xbrl/companyfacts/CIK{cik}.json`(재무). `www.sec.gov/files/company_tickers.json`(티커→CIK).
- **DART**: `opendart.fss.or.kr/api` — `corpCode.xml`(stock_code→corp_code), `list.json`(공시), `fnlttSinglAcntAll.json`(재무), `company.json`(업종), `document.xml`(사업보고서).
- **토스(예정)**: `openapi.tossinvest.com` — `/oauth2/token`, `/api/v1/{prices,candles,exchange-rate,stocks,stocks/{symbol}/warnings,market-calendar}`.
- **KIS(예정)**: `KIS_BASE_URL` — `/oauth2/tokenP`(client_credentials→access_token, 24h), 국내·해외 시세/차트 TR.

---

## 2. 내부 Route Handlers (`src/app/api/**`)

| 경로 | 메서드 | 입력 | 응답 | 인증 | 소스 |
|---|---|---|---|---|---|
| `/api/search` | GET | `q` | `{ results: SymbolSearchResult[] }` | 공개 | Yahoo search + `etf_ter_cache` + 로컬 CATALOG |
| `/api/quote` | GET | `symbols`(CSV) | `{ prices, previousCloses, currencies, available }` (₩ 환산) | 공개 | `getKrwPrices`(Yahoo + FX) |
| `/api/import/parse` | POST | FormData `file`(≤5MB) + Bearer | `{ rows: ParsedRow[] }` | Supabase 세션 | Anthropic Claude |
| `/api/import/confirm` | POST | `{ rows, accountId, holdingId }` + Bearer | `{ ok, count? }` | Supabase(user_id 검증) | `events`/`holdings` 원자적 insert |

`ParsedRow = { date, type, symbolName, symbol, quantity, price, fee }`
`SymbolSearchResult = { symbol, name, exchange, assetType?, ter? }`

기타 라우트: `/auth/callback`(PKCE 교환), `/dev-login`(개발 전용, 프로덕션 404).

---

## 3. Server Actions (도메인 쓰기)

모두 `"use server"`, Supabase RLS로 소유권 강제, 변경 후 `revalidatePath`.

| 영역 | 파일 | 주요 액션 |
|---|---|---|
| 인증 | `auth/actions.ts` | `signOut` |
| 회사(지주) | `company/actions.ts` | `deleteCompany`·`switchCompany`·`renameActiveCompany` |
| 설립/온보딩 | `onboarding/actions.ts` | `foundCompany`(설립등기→기본계좌+설립이벤트)·`recordFirstBuy` |
| 계좌 | `accounts/actions.ts` | `createAccount`·`updateAccount`·`deleteAccount`(최소 1계좌 보호) |
| 거래 | `transactions/actions.ts` | `recordEvent`·`recordBuys`(배치)·`updateTradeEvent`·`deleteEvent`·`reverseEvent` |
| 순자산 | `networth/actions.ts` | `addLiability`/`update`/`delete` · `addManualAsset`/`update`/`delete` |
| import | `import/actions.ts` | `toggleYearComplete` |
| 종목분석 | `stocks/[symbol]/actions.ts` | `setManualFundamentals`·`clearManualFundamentals`·`setDiscountRate`·`setGrowthRate` |
| 리밸런싱 | `rebalance/actions.ts` | `setTargetWeights`·`setCategoryTargets`·`saveRebalancePlan`·`clearRebalancePlan` |
| 관심종목 | `stocks/watchlistActions.ts` | `toggleWatch` |
| 알림 | `dashboard/signalActions.ts`·`disclosures/actions.ts` | `dismissHomeSignal`·`markDisclosuresRead` |

**거래 모드 규칙(중요):** `holding.mode` = `ledger`(자유 편집·과거일자) / `challenge`·`live`(오늘만, 시장가 강제, 삭제 대신 상쇄). `recordEvent`가 모드별 검증.

---

## 4. 데이터소스 Seam 인터페이스 (교체 지점)

UI/페이지는 **이 인터페이스만** 호출하고 외부소스를 직접 모름.

| 인터페이스 | 파일 | 호출 라우트/소스 |
|---|---|---|
| `searchSymbols(q)` | `lib/finance/search.ts` | `/api/search` |
| `fetchQuotes(symbols)` | `lib/finance/search.ts` | `/api/quote` |
| `getPrices`/`getKrwPrices` | `lib/finance/prices.ts` | Yahoo chart (→토스 `/prices`) |
| `getDailyKrwCloses`/`getYearEndCloses` | `lib/finance/prices.ts` | Yahoo chart 기간 (→토스 `/candles`) |
| `getFxToKrw`/`getUsdKrw` | `lib/finance/fx.ts` | Yahoo `{CCY}KRW=X` (→토스 `/exchange-rate`) |
| `getDividends` | `lib/finance/dividends.ts` | Yahoo `events=div` (잔존) |

> 교체 전략·정규화기·플래그(`FINANCE_SOURCE`)는 [toss-migration-spec-v1.md](./toss-migration-spec-v1.md).

---

## 5. 데이터 모델 (Supabase Postgres)

### 5-1. 핵심 계층
```
holdings(지주회사)
 ├─ accounts(계좌·세금레이어)
 │   └─ events(거래원장 5종)  →  positions(VIEW: ΣBUY−ΣSELL, avg_cost)
 ├─ liabilities(부채)
 ├─ manual_assets(수기자산)
 ├─ manual_fundamentals(수기 D&A·CapEx·할인/성장률)
 ├─ valuation_assumptions(종목별 할인/성장률)
 ├─ watchlist(관심종목)
 └─ home_signal_dismissals(알림 확인)
```

### 5-2. 테이블 요약 (`database.types.ts` + `supabase/migrations/*.sql`)

| 테이블 | 핵심 컬럼 | 비고 |
|---|---|---|
| `holdings` | `user_id, name, mode, founded_at, initial_capital, initial_valuation, portfolio_revision, target_weights, category_targets, active_plan, completed_years` | 회사 1개. insert시 기본계좌 자동생성 트리거 |
| `accounts` | `holding_id, name, account_type, broker, commission_rate(기본 0.00015)` | 세금=유형, 수수료=계좌별 |
| `events` | `account_id, type, symbol?, quantity?, price_or_amount, fee_and_tax, currency, fx_rate, to_currency?, to_amount?, date, deleted_at?, reverses_event_id?, source` | 모든 상태의 원천. CHECK 제약(BUY/SELL=symbol+qty 등) |
| `positions` (VIEW) | `holding_id, account_id, symbol, quantity, avg_cost` | `security_invoker=on` |
| `securities` | `symbol(PK), name, currency, exchange?, country?, sector?, asset_type?` | 공용 종목마스터(인증자 read/write) |
| `valuation_assumptions` | `holding_id, symbol, discount_rate?, growth_rate?` | 내재가치 오버라이드 |
| `manual_fundamentals` | `holding_id, symbol, fiscal_year, dna?, maint_capex?, discount_rate?, growth_rate?` | (holding,symbol) unique |
| `fundamentals_cache` | `symbol, year, fs_div(PK), data(jsonb), fetched_at` | DART/EDGAR 캐시(공용) |
| `etf_ter_cache` | `symbol(PK), name, ter, source_date` | KRX 동기화 |
| `etf_holdings_cache` | `symbol(PK), holdings(jsonb), source_date` | KRX 동기화 |
| `liabilities` | `holding_id, name, kind, principal, interest_rate, started_at?, deleted_at?` | 부채 |
| `manual_assets` | `holding_id, name, kind, current_value, acquired_price?, acquired_at?, deleted_at?` | 부동산 등 |
| `watchlist` | `holding_id, symbol` | (holding,symbol) unique |
| `home_signal_dismissals` | `holding_id, signal_key` | (holding,signal_key) unique |
| `user_perf_snapshots` | `user_id, holding_id, xirr?, cumulative_return?, days, portfolio_krw?, mode, alpha?, benchmark_symbol?` | 리더보드/백분위. SQL 함수 `get_xirr_percentile/histogram/leaderboard`(security definer) |
| `calculation_snapshots` | `holding_id, kind, portfolio_revision, as_of_date, parameters_hash, data(jsonb), status` | 파생계산 캐시. revision 키로 무효화 |

**캐시 무효화:** events/accounts/liabilities/manual_assets/manual_fundamentals/valuation_assumptions 변경 트리거 → `holdings.portfolio_revision` 증가 → `calculation_snapshots` 자동 stale.

### 5-3. Enum
- `holding_mode`: `ledger`·`challenge`·`live` (불변)
- `account_type`: `GENERAL`·`ISA`·`PENSION`·`OVERSEAS`·`IRP` (세금 규칙 — 현재 일부 placeholder)
- `event_type`: `BUY`·`SELL`·`DIVIDEND`·`DEPOSIT`·`WITHDRAWAL`·`EXCHANGE`
- `liability_kind`: `CREDIT`·`MORTGAGE`·`MARGIN`·`OTHER`
- `manual_asset_kind`: `REAL_ESTATE`·`LAND`·`COMMERCIAL`·`UNLISTED`·`COLLECTIBLE`·`OTHER`

---

## 6. 인증 & 세션

- **클라이언트 생성**: `lib/supabase/server.ts`(서버, 쿠키 세션)·`client.ts`(브라우저, anon key)·`session.ts`(미들웨어 세션 갱신).
- **로그인**: `/auth/callback`이 PKCE `exchangeCodeForSession`. 보호경로는 미들웨어가 `getUser()` 검증, 미인증→`/login`.
- **개발 로그인**: `GET /dev-login?email=`(프로덕션 404). `SUPABASE_SERVICE_ROLE_KEY`로 유저 생성/로그인.
- **데이터 스코프**: JWT `auth.uid()` = `holdings.user_id`. 하위(accounts/events…)는 FK+RLS로 cascade. 다중 회사는 `active_holding` 쿠키로 전환.

---

## 7. 계산 엔진 (`lib/finance/`)

| 지표 | 파일 | 요지 |
|---|---|---|
| **XIRR** | `xirr.ts`·`returns.ts` | Newton-Raphson→이분법 폴백. 현금흐름: t0 −initial_valuation, DEPOSIT −, WITHDRAWAL +, 오늘 +총평가액. <90일이면 null |
| 누적수익률 | `returns.ts` | `(평가액+Σ출금−Σ입금−초기) / (초기+Σ입금)` |
| CAGR | `returns.ts` | 연환산 보조지표 |
| 평가/현금 | `valuation.ts` | `netQuantities`·`cashBalance`·`cashPools`(통화별)·`totalValuation` |
| 포트폴리오 로드 | `portfolio.ts` | 활성 holding의 events→prices/fx→`computeReturn` |
| 내재가치 | `intrinsic.ts` | 오너이익/(할인−성장) DCF |
| 벤치마크 | `benchmark.ts` | 지수 시계열 vs 포트(PME) |

**반환 상태**: `xirr`(≥90일) / `cumulative_only`(<90일) / `price_unavailable`(시세 누락) / `insufficient_data`.

---

## 8. 심볼/식별자 매핑

| 시장 | 내부 | Yahoo | 공식소스 |
|---|---|---|---|
| 한국주식 | `005930`(6자리) | `.KS`→`.KQ` 후보 | DART `corp_code`(corpCode.xml) |
| 미국주식 | `AAPL` | 동일 | EDGAR CIK(10자리, company_tickers.json) |
| 지수/시세전용 | `^KS11`·`USDKRW=X`·`BTC-USD` | 동일 | `isQuoteOnly()` 판별 |
| ETF | 한국 6자리/미국 티커 | 동일 | TER: 한국 `etf_ter_cache`, 미국 Yahoo crumb. `catalog.yahooProxy`로 지수 프록시 |

> 토스/한투 심볼은 `005930`·`AAPL` 맨코드 = 내부심볼과 동일 → `.KS/.KQ` probing 불필요.

---

## 9. 캐싱 & 레이트리밋

- **Next.js ISR** (`fetch(..., { next: { revalidate } })`): 시세·환율 60s, 벤치마크 300s, 배당·공시 6h, 펀더멘털·corp_code·CIK 1d, 프로필·업종·매크로 7d, ETF TER 1h.
- **모듈 인메모리 캐시**: DART corp_code map·EDGAR CIK map(영속, 실패시 재시도), Yahoo crumb(1h TTL).
- **DB 캐시**: `fundamentals_cache` read-through(있으면 DB, 없으면 API→비동기 upsert).
- **에러 처리**: 명시적 retry 없음. `Promise.allSettled`·try/catch로 graceful degradation(실패시 `null`/`[]`).

---

## 10. 데이터 라이선스 (서비스 공개 전 필수)

> 기술과 독립된 **사업 트랙**. 시세를 **여러 사용자에게 재배포**하는 순간 라이선스 필요. 본인 장부(거래·보유·XIRR)는 본인 데이터라 무관.

- **본인/비공개 베타**: 라이선스 불필요.
- **공개 1단계**: **지연시세(15~20분)** — 실시간 라이선스 없이 합법 오픈, 비용 최소(권장).
- **공개 2단계**: **코스콤 실시간 정보이용계약**(사업자 전제, 가입자수 비례 요금, 비공개 견적 `fintechdata@koscom.co.kr`).
- 증권사 Open API(토스/한투/키움) 약관은 "본인 투자판단용" — 멀티유저 재배포 근거 아님.

---

## 11. 환경변수 (값 아닌 이름만 — `.env.local`, git-ignored)

| 변수 | 용도 | 스코프 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 클라이언트 | 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | 관리자(dev-login) | 서버 전용 |
| `SUPABASE_DB_PASSWORD` | 마이그레이션 | 서버 전용 |
| `OPENDART_API_KEY` | DART | 서버 전용 |
| `ANTHROPIC_API_KEY` | import 파싱 | 서버 전용 |
| `KIS_APP_KEY`·`KIS_APP_SECRET`·`KIS_BASE_URL` | 한투(예정) | 서버 전용 |
| `TOSS_API_CLIENT_ID`·`TOSS_API_CLIENT_SECRET` | 토스(예정) | 서버 전용 |
| `NODE_ENV`·`PERF_LOG` | 런타임 플래그 | – |

> 모든 `*_KEY`/`*_SECRET`는 서버 전용. 클라이언트로 새지 않도록 seam은 항상 `/api` 라우트 또는 server-only lib 뒤에 둔다.

---

## 12. 모바일/외부 클라이언트가 붙는다면 (설계 노트)

- 현재 쓰기 경로는 **Server Actions**(웹 전용). 모바일이 붙으려면 동일 도메인 로직을 **REST 라우트로 노출**하거나 Supabase 직접 호출(RLS 의존) 중 택1.
- 인증은 Supabase 세션(쿠키 기반) — 모바일은 Supabase Auth 토큰(JWT) 방식으로 동일 RLS 활용 가능.
- 읽기는 대부분 server component 내부 계산 → 모바일용으론 `calculation_snapshots`/`portfolio` 계약을 JSON API로 빼는 설계가 자연스럽다.
- 시세·검색은 이미 `/api/search`·`/api/quote`로 노출돼 있어 모바일도 그대로 재사용 가능.
