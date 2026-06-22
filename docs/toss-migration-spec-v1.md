# 시세·검색 데이터 소스 교체 스펙 v1 (야후 → 토스/한투)

> 토스증권 Open API(또는 한투 KIS) 승인·도입 시, 시세·검색·환율 seam을 야후에서 공식 소스로 교체하기 위한 준비 스펙. **코드는 키 도착 후 구현**하며, 이 문서는 그 청사진이다.

## 0. 요약 (한 줄)

야후를 **시세 레이어에서만 완전 제거**(토스/한투로 교체)하고, **펀더멘털·배당·미국 ETF/지수는 야후/DART/EDGAR/KRX 유지**한다. 멀티유저 공개 시 **시세 재배포 라이선스**(코스콤)가 별도 사업 트랙으로 필요하다.

> **구현 현황(2026-06-22):** 1차 소스로 **한투(KIS) 도입 완료** — `FINANCE_SOURCE=kis` 플래그로 (1) 한글검색(종목마스터 인덱스 `kis_security_master`), (2) 국내·미국 현재가, (3) 환율(`t_rate`)이 KIS로 동작. 과거 일봉(`getDailyKrwCloses`)은 페이지네이션 복잡도로 **야후 유지(후속)**. 토스 승인 시 동일 seam에 `toss` 추가 전환. 상세: `specs/003-kis-market-data/`.

---

## 1. 현황 — 야후 의존 지점 (전수조사)

UI seam은 깨끗하다: 컴포넌트는 `searchSymbols()`/`fetchQuotes()`([src/lib/finance/search.ts](../src/lib/finance/search.ts))만 호출하고 야후 직접 호출 누수 없음. 실제 야후 fetch는 **lib 8곳**에 격리돼 있다.

| # | lib 함수 | 야후 엔드포인트 | 데이터 | 공식 대체 |
|---|---|---|---|---|
| 1 | `prices.ts` `getPrices`/`getKrwPrices` | `/v8/finance/chart` | 현재가·전일종가 | ✅ 토스 `/prices` |
| 2 | `prices.ts` `getDailyKrwCloses`/`getYearEndCloses` | `/v8/finance/chart` 기간 | 과거 OHLCV | ✅ 토스 `/candles` |
| 3 | `fx.ts` `getFxToKrw` | `{CCY}KRW=X` | 환율 | ✅ 토스 `/exchange-rate` |
| 4 | `/api/search/route.ts` | `/v1/finance/search` | 종목 검색 | ✅ 토스 `/stocks` (※ 검색 가능 여부 확인) |
| 5 | `etfStats.ts`/`yahooCrumb.ts` | `/v10 quoteSummary` | ETF TER·구성·PER | ❌ 없음 → 야후 유지 |
| 6 | `indexStats.ts` | `/v10 quoteSummary` | 지수 구성종목 | ❌ 없음 → 야후 유지 |
| 7 | `benchmark.ts` `fetchIndexSeries` | `/v8 chart` | 지수 시계열(^KS11·^GSPC) | △ 토스 캔들이 지수 포함 시만 |
| 8 | `companyProfile.ts` | `/v10 assetProfile` | 섹터·프로필 | ❌ DART/EDGAR 유지(이미) |
| 9 | `dividends.ts` `getDividends` | `/v8 chart events=div` | 배당이력 | ❌ 없음 → 야후 유지 |

**fetcher 아닌 매치(변경 불필요):** `sector.ts`(주석, 섹터는 DART), `currencies.ts`(통화 목록+주석), `krxEtfHoldings.ts`(KRX 본체), `catalog.ts`(`yahooProxy` 필드), `quotes.ts`(`PRESET_QUOTES` 지수·환율 심볼), `IndexValuation.tsx`/`EtfFundamentalsSection.tsx`(UI "출처: Yahoo Finance" 라벨), `dev-login`(오탐).

**유리한 점:** 토스/한투 심볼은 `005930`·`AAPL`(맨 코드) → 우리 **내부 심볼과 동일**. 야후 `.KS`/`.KQ` 후보 probing(`toYahooCandidates`)이 불필요해져 매핑이 단순해진다.

---

## 2. 교체 전략 — 소스 플러그블 seam

`prices.ts` 기존 패턴과 동일: **인터페이스·반환 shape 고정, 내부 fetch만 교체.** 단일 소스가 아니라 **플러그블**로 설계한다.

```
FINANCE_SOURCE = yahoo | toss | kis | kiwoom   (기본 yahoo)
각 마이그레이션 대상 함수가 이 플래그로 분기 → 같은 PriceResult/SymbolSearchResult 반환
호출 측(page.tsx·컴포넌트·/api 라우트): 변경 없음
```

### 2-1. 소스 선택 모듈 (신규)
`src/lib/finance/source.ts`: `financeSource()` — `process.env.FINANCE_SOURCE` 읽기(기본 `yahoo`).

### 2-2. 토스 클라이언트 (신규, 휴면)
`src/lib/finance/toss/client.ts`:
- OAuth2 Client Credentials: `POST /oauth2/token` → 토큰 **86,400초 캐시**(모듈 스코프 메모리 캐시, 만료 60초 전 갱신).
- `client_id`/`client_secret` = `.env.local`(`TOSS_API_CLIENT_ID`/`TOSS_API_CLIENT_SECRET`), **서버 전용**.
- `tossFetch(path, init)`: 베이스 `https://openapi.tossinvest.com`, Bearer 자동 부착, 429 백오프.
- 키 없으면 throw → 호출부가 야후 폴백.

### 2-3. 대체 대상 함수에 토스 경로 추가
기존 시그니처 유지, 내부만 분기. 각 함수에 **응답 정규화기**(공식 JSON → 내부 타입)를 분리 함수로 작성 → fixture JSON으로 키 없이 단위테스트.

| 우리 함수 | 토스 엔드포인트 | 비고 |
|---|---|---|
| `prices.ts getPrices` | `GET /api/v1/prices` | 심볼 후보 probing 생략 |
| `prices.ts getDailyKrwCloses`/`getYearEndCloses` | `GET /api/v1/candles` | 과거 OHLCV |
| `fx.ts getFxToKrw` | `GET /api/v1/exchange-rate` | ₩ 환산 |
| `/api/search` | `GET /api/v1/stocks` | 한글검색 네이티브 |

**단서:** `/stocks`가 텍스트 쿼리 검색인지 전체 마스터 리스트인지 키 도착 시 확인 — 마스터면 KRX 방식으로 로컬 인덱싱.

---

## 3. 토스 Open API 참고 (조사 결과)

- **인증:** OAuth2 Client Credentials, 토큰 86,400초. 계좌/자산/주문 호출엔 `X-Tossinvest-Account` 헤더 추가.
- **시장데이터 엔드포인트:** `/api/v1/prices` `/orderbook` `/trades` `/price-limits` `/candles` `/stocks` `/stocks/{symbol}/warnings` `/exchange-rate` `/market-calendar/{KR,US}`. 한국·미국 둘 다 지원.
- **자격:** 토스증권 본인 계좌 + 약관동의·본인인증·계좌인증 → 앱키·시크릿키 발급. **사업자등록 불필요(개인 가능).**
- **계좌·주문(`/accounts`·`/holdings`·`/orders`)은 본 스펙 범위 외** — Client Credentials라 발급자 본인 계좌만 보이므로 "고객 계좌 자동연동" 불가.

---

## 4. 야후 잔존 영역 (의도된 선택)

아래는 토스·한투·키움 **어느 증권사 API로도 못 받는다**(증권사가 아니라 펀더멘털/지수 벤더의 데이터). 무료 공식 대안도 없어 야후 유지.

| 영역 | 한국 | 미국 | 비고 |
|---|---|---|---|
| 개별주 펀더멘털 | DART(이미) | EDGAR XBRL(이미, `edgar.ts getFundamentalsUS`) | 야후 거의 안 씀 |
| 기업 프로필·섹터 | DART(이미) | EDGAR SIC·10-K(이미) | 야후는 폴백 |
| ETF 구성·총보수 | KRX(이미, `etf_ter_cache`) | **야후만** | 미국 ETF가 병목 |
| 배당이력 | 야후(→DART/KRX 가능) | **야후** | 무료 벤더(Alpha Vantage·Finnhub) 대체 후속 옵션 |
| 지수 레벨·구성 | KRX 가능 | **S&P 독점** | 위키/SPY로 근사 |

`etfStats.ts`·`indexStats.ts`·`companyProfile.ts`·`dividends.ts`·(잠정)`benchmark.ts`는 **변경 없음**. 주석으로 "증권사 API 미지원 — 야후/DART 유지" 명기.

**검토했으나 탈락한 대안:**
- **구글 파이낸스**: 호출 가능한 API 없음(`GOOGLEFINANCE()` 시트 함수뿐). 위 빈틈도 못 메움 → 대안 아님.
- **무료 벤더(Alpha Vantage·Finnhub)**: 배당이력은 무료로 대체 가능(후속 옵션). 미국 ETF 구성은 못 줌.
- **유료 벤더(FMP·EODHD)**: 미국 ETF 구성까지 해결 가능하나 월 비용. 스케일 시 재검토.

---

## 5. 시세 소스 후보 비교 (구현 시 1차 소스 확정)

| | 한투(KIS) | 토스 | 키움 |
|---|---|---|---|
| 방식 | REST + WebSocket | REST | 구형 OCX(웹 불가) + 신규 REST |
| 웹서버 사용 | ✅ | ✅ | 신규 REST만 ✅ |
| 해외(미국) 시세 | ✅ 강함 | ✅ | ✅ |
| 한글검색 | ✅ | ✅ | ✅ |
| 성숙도·생태계 | **최고**(공식 GitHub·python-kis) | 신생 | 중간 |
| **지금 가능?** | ✅ 즉시 | ⏳ 승인 대기 | ✅(REST) |

→ **한투(KIS)가 즉시 도입 가능한 1순위.** 토스 승인을 기다리지 않고 한투로 먼저 구현 가능. seam이 플러그블이라 나중에 토스로 교체/병행 자유. 어느 소스든 §4 야후 잔존 결론은 동일.

---

## 6. 데이터 라이선스·비용 트랙 (사업 — 기술과 독립)

> 시세를 **여러 사용자에게 보여주는 순간 "재배포"**가 되어 라이선스 필요. 소스(야후/토스/한투/키움) 무관 공통. **본인 장부(거래·보유·XIRR)는 본인 데이터라 무관** — 라이브 시세 레이어에만 적용.

| 단계 | 라이선스 | 비고 |
|---|---|---|
| 본인/비공개 베타 | 불필요(재배포 아님) | 야후/한투로 개발·검증 — 합법 |
| **공개 1단계 — 지연시세(15~20분)** | 가볍거나 무료 | **권장 출발점.** 실시간 라이선스 없이 합법 오픈 |
| 공개 2단계 — 코스콤 실시간 정보이용계약 | 필요(유료·사업자 전제) | 매출이 정당화할 때. 가입자 수 비례 요금(비공개·견적) |

- 한국 시세 원천 = KRX, 라이선스·재배포 계약 관리 = **코스콤(KOSCOM)**. 가공·축적·재배포 시 정보시세 라이선스 필수.
- 실시간 재분배 = 코스콤 "일반 정보이용계약", 내부이용 = "최종이용사 정보이용계약".
- 핀테크 오픈API 이용대상 = 금융위 핀테크 분류 중소기업·전자금융업자 등 → **사업자 등록 사실상 전제**.
- **비용 비공개** — 견적은 코스콤 시장데이터영업팀 `fintechdata@koscom.co.kr` / 02-767-7583.
- 증권사 Open API 약관도 "본인 투자판단용" 한정 → 멀티유저 재배포 근거로 못 씀. 코스콤/KRX 정식 계약이 정공법.

---

## 7. 건드리지 않는 것

- UI/컴포넌트, DB 스키마, `search.ts` seam 인터페이스 — 전부 불변.
- 계좌·주문 연동(`/accounts`·`/holdings`·`/orders`) — 범위 외.
- §4 펀더멘털·배당·프로필 야후/DART/EDGAR/KRX 경로 — 유지.

---

## 8. 검증

**키 도착 전**
- 정규화기 단위테스트: 공식 샘플 JSON fixture → 내부 타입(`PriceResult` 등) 일치 확인.
- `FINANCE_SOURCE=yahoo`(기본)에서 기존 동작 회귀 없음.

**키 도착 후** (`.env.local`에 키 + `FINANCE_SOURCE=toss`(또는 `kis`))
1. 한글검색("삼성전자")이 결과 반환 — 야후 한계 해소 확인.
2. `/api/quote?symbols=005930,AAPL` 가격이 공식 소스 값과 일치.
3. `/api/quote` 환율(`usdKrw`)이 `/exchange-rate`와 일치.
4. 종목 상세 과거 차트(`getYearEndCloses`)가 캔들로 정상.
5. ETF/배당/프로필 페이지가 여전히 야후로 정상(회귀 없음).
6. 토스 지수 캔들 지원 여부 확인 후 `benchmark.ts` 전환/유지 결정.

---

## 9. 후속 (이번 범위 밖)

- `/stocks/{symbol}/warnings`(투자경고·관리종목·과열·VI) → `HomeSignalBanner` warn 시그널([src/lib/finance/homeSignal.ts](../src/lib/finance/homeSignal.ts)) 연결.
- 배당이력 무료 벤더(Alpha Vantage·Finnhub) 대체 검토.
- 미국 ETF 구성 유료 벤더(FMP·EODHD) 검토 — 코스콤 계약·매출 단계와 함께.
